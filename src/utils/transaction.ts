import mongoose, { type ClientSession } from 'mongoose';
import { logger } from './logger';

/**
 * Multi-document writes (reorder, duplicate garment, order creation, cascade delete)
 * run in a transaction — see CLAUDE.md §Server.
 *
 * MongoDB only offers transactions on a replica set or mongos. A plain local `mongod`
 * refuses them, so the first attempt probes support and, if the deployment is a
 * standalone, the callback is replayed without a session for the rest of the process
 * lifetime. The probe fails before any write is applied, so nothing is half-committed.
 * Point MONGODB_URI at a single-node replica set to get real atomicity locally.
 */

let transactionsSupported: boolean | null = null;

const UNSUPPORTED_MARKERS = [
  'Transaction numbers are only allowed on a replica set member or mongos',
  'Transactions are not supported',
  'This MongoDB deployment does not support retryable writes'
];

function isUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as { code?: unknown }).code;
  if (code === 20 || code === 40415) return true;
  return UNSUPPORTED_MARKERS.some((marker) => error.message.includes(marker));
}

export async function withTransaction<T>(run: (session?: ClientSession) => Promise<T>): Promise<T> {
  if (transactionsSupported === false) {
    return run(undefined);
  }

  const session = await mongoose.startSession();
  try {
    const result = await session.withTransaction(async () => run(session));
    transactionsSupported = true;
    return result as T;
  } catch (error) {
    if (isUnsupported(error)) {
      transactionsSupported = false;
      logger.warn(
        'MongoDB deployment is a standalone — multi-document writes will run without a transaction. Use a single-node replica set for atomicity.'
      );
      return run(undefined);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

/** Spreads `{ session }` into a query option object only when a session exists. */
export function sessionOption(session?: ClientSession): { session?: ClientSession } {
  return session ? { session } : {};
}
