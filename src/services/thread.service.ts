import { Types } from 'mongoose';
import { OperationModel } from '../models/operation.model';
import { ThreadModel, type ThreadDocument } from '../models/thread.model';
import type { ThreadDTO, ThreadListResponse, ThreadUsage } from '../dto/api-types';
import { searchAcross } from '../utils/regex';
import { HttpError } from '../utils/http-error';
import type { CreateThreadBody, ThreadListQuery, UpdateThreadBody } from '../schemas/thread.schema';

interface ThreadUsageRow {
  _id: Types.ObjectId;
  styles: Types.ObjectId[];
  operations: { id: Types.ObjectId; name: string; sequence: number }[];
}

/**
 * `threads` is a Map keyed by position id, so usage has to be read through
 * `$objectToArray` rather than a plain field match.
 */
async function usageByThread(garmentId?: string): Promise<Map<string, ThreadUsageRow>> {
  const match = garmentId ? { garment: new Types.ObjectId(garmentId) } : {};
  const rows = await OperationModel.aggregate<ThreadUsageRow>([
    { $match: match },
    {
      $project: {
        garment: 1,
        name: 1,
        sequence: 1,
        assignments: { $objectToArray: { $ifNull: ['$threads', {}] } }
      }
    },
    { $unwind: '$assignments' },
    {
      $group: {
        _id: '$assignments.v',
        styles: { $addToSet: '$garment' },
        operations: { $addToSet: { id: '$_id', name: '$name', sequence: '$sequence' } }
      }
    }
  ]);

  return new Map(rows.map((row) => [row._id.toHexString(), row]));
}

function toDTO(thread: ThreadDocument, usage: ThreadUsage): ThreadDTO {
  return {
    id: thread._id.toHexString(),
    brand: thread.brand,
    ticket: thread.ticket,
    composition: thread.composition,
    colour: thread.colour,
    coneYieldM: thread.coneYieldM,
    unitPrice: thread.unitPrice,
    active: thread.active,
    usage
  };
}

export async function listThreads(query: ThreadListQuery): Promise<ThreadListResponse> {
  const filter = searchAcross(['brand', 'composition', 'colour'], query.q);

  const [threads, total, globalUsage, garmentUsage] = await Promise.all([
    ThreadModel.find(filter)
      .sort({ brand: 1, ticket: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    ThreadModel.countDocuments(filter),
    usageByThread(),
    query.garmentId ? usageByThread(query.garmentId) : Promise.resolve(null)
  ]);

  const items = threads.map((thread) => {
    const id = thread._id.toHexString();
    const usage: ThreadUsage = { styles: globalUsage.get(id)?.styles.length ?? 0 };
    if (garmentUsage) {
      usage.operationsOnGarment = garmentUsage.get(id)?.operations.length ?? 0;
    }
    return toDTO(thread, usage);
  });

  return { items, total, page: query.page, limit: query.limit };
}

async function assertNotDuplicate(
  fields: { brand: string; ticket: number; colour: string },
  exceptId?: string
): Promise<void> {
  const filter: Record<string, unknown> = fields;
  if (exceptId) {
    filter._id = { $ne: new Types.ObjectId(exceptId) };
  }
  if (await ThreadModel.exists(filter)) {
    throw HttpError.duplicate(
      `${fields.ticket} ${fields.brand} in ${fields.colour} is already in the thread library.`
    );
  }
}

export async function createThread(body: CreateThreadBody): Promise<ThreadDTO> {
  await assertNotDuplicate({ brand: body.brand, ticket: body.ticket, colour: body.colour });

  const thread = await ThreadModel.create({
    brand: body.brand,
    ticket: body.ticket,
    composition: body.composition,
    colour: body.colour,
    coneYieldM: body.coneYieldM,
    unitPrice: body.unitPrice ?? 0
  });

  return toDTO(thread, { styles: 0 });
}

export async function updateThread(id: string, body: UpdateThreadBody): Promise<ThreadDTO> {
  const thread = await ThreadModel.findById(id);
  if (!thread) {
    throw HttpError.notFound('That thread does not exist.');
  }

  const identity = {
    brand: body.brand ?? thread.brand,
    ticket: body.ticket ?? thread.ticket,
    colour: body.colour ?? thread.colour
  };
  if (
    identity.brand !== thread.brand ||
    identity.ticket !== thread.ticket ||
    identity.colour !== thread.colour
  ) {
    await assertNotDuplicate(identity, id);
  }

  if (body.brand !== undefined) thread.brand = body.brand;
  if (body.ticket !== undefined) thread.ticket = body.ticket;
  if (body.composition !== undefined) thread.composition = body.composition;
  if (body.colour !== undefined) thread.colour = body.colour;
  if (body.coneYieldM !== undefined) thread.coneYieldM = body.coneYieldM;
  if (body.unitPrice !== undefined) thread.unitPrice = body.unitPrice;
  if (body.active !== undefined) thread.active = body.active;

  await thread.save();

  const usage = await usageByThread();
  return toDTO(thread, { styles: usage.get(id)?.styles.length ?? 0 });
}

export async function deleteThread(id: string): Promise<void> {
  const thread = await ThreadModel.findById(id);
  if (!thread) {
    throw HttpError.notFound('That thread does not exist.');
  }

  const usage = await usageByThread();
  const row = usage.get(id);
  if (row && row.operations.length > 0) {
    const operations = [...row.operations]
      .sort((a, b) => a.sequence - b.sequence)
      .map((operation) => operation.name || `Operation ${operation.sequence}`);
    throw HttpError.inUse(
      `${thread.ticket} ${thread.brand} is assigned to ${operations.length} operation${
        operations.length === 1 ? '' : 's'
      }. Set it inactive instead of deleting it.`,
      { operations }
    );
  }

  await thread.deleteOne();
}
