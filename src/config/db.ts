import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

const RETRY_DELAY_MS = 3000;
const MAX_ATTEMPTS = 10;

export type DbState = 'connected' | 'connecting' | 'disconnected';

export function dbState(): DbState {
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
    case 3:
      return 'connecting';
    default:
      return 'disconnected';
  }
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<void> {
  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      logger.info({ uri: redact(uri) }, 'MongoDB connected');
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === MAX_ATTEMPTS) {
        logger.error({ err: message }, `MongoDB connection failed after ${MAX_ATTEMPTS} attempts`);
        throw error;
      }
      logger.warn({ err: message, attempt }, `MongoDB connection failed, retrying in ${RETRY_DELAY_MS}ms`);
      await wait(RETRY_DELAY_MS);
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
}

function redact(uri: string): string {
  return uri.replace(/\/\/([^:@]+):([^@]+)@/, '//$1:***@');
}
