import { Types, type ClientSession } from 'mongoose';
import { GarmentModel } from '../models/garment.model';
import { OperationModel, type OperationDocument } from '../models/operation.model';
import { ThreadModel } from '../models/thread.model';
import {
  distinctThreadCodes,
  formatPositionSpecs,
  formatThreadSummary,
  isOperationComplete,
  operationMetres,
  positionMetres,
  roundTo,
  sortPositions,
  type MachineType as DomainMachineType,
  type Thread as DomainThread
} from '../domain/threadCalculation';
import type { OperationDTO } from '../dto/api-types';
import { HttpError } from '../utils/http-error';
import { sessionOption, withTransaction } from '../utils/transaction';
import { loadMasterData, toDomainOperation } from './calculation.service';
import type {
  CreateOperationBody,
  ReorderOperationsBody,
  UpdateOperationBody,
  UpdateOperationThreadBody
} from '../schemas/operation.schema';

interface MasterData {
  machineTypes: DomainMachineType[];
  threads: DomainThread[];
}

function toDTO(operation: OperationDocument, master: MasterData): OperationDTO {
  const domain = toDomainOperation(operation);
  const machineType = domain.machineTypeId
    ? master.machineTypes.find((candidate) => candidate.id === domain.machineTypeId) ?? null
    : null;

  return {
    id: domain.id,
    garmentId: operation.garment.toString(),
    sequence: domain.sequence,
    name: domain.name,
    machineTypeId: machineType?.id ?? null,
    machineTypeName: machineType?.name ?? null,
    machineTypeCode: machineType?.code ?? null,
    machineTypeColour: machineType?.colour ?? null,
    seamLengthCm: domain.seamLengthCm,
    notes: operation.notes,
    isComplete: isOperationComplete(domain, machineType),
    operationMetres: roundTo(operationMetres(domain, machineType), 2),
    threadSummary: formatThreadSummary(domain, machineType, master.threads),
    /*
     * The printed cells for the operation breakdown, from the same formatter the cone order
     * uses — so the two documents can never describe a position differently.
     *
     * `withCode` appends the thread's shade code: `LOOPER - 2 - 120 SURFILOR - C9573`. The
     * breakdown is the sheet the floor works from, and the code is what they pull a cone by,
     * so it carries it; the cone order's snapshot rows are deliberately left alone.
     *
     * An unassigned position still formats as "—" with no code, which is why this does not
     * make the breakdown depend on thread data: it prints while assignment is incomplete.
     */
    threadCells: formatPositionSpecs(domain, machineType, master.threads, {
      upper: true,
      withCode: true
    }),
    /*
     * The shade codes for the operations table's own column. Derived from the same position
     * entries as the two strings above, so a code can never appear on one surface and not
     * another — and de-duplicated, because two positions on one thread is one cone to fetch.
     */
    threadCodes: distinctThreadCodes(domain, machineType, master.threads),
    positions: sortPositions(machineType).map((position) => ({
      id: position.id,
      position: position.position,
      count: position.count,
      consumptionRatio: position.consumptionRatio,
      threadId: domain.threads[position.id] ?? null,
      metresPerGarment: roundTo(
        positionMetres(domain.seamLengthCm, position.consumptionRatio, position.count),
        2
      )
    }))
  };
}

async function requireGarmentId(garmentId: string): Promise<Types.ObjectId> {
  const garment = await GarmentModel.findById(garmentId).select('_id');
  if (!garment) {
    throw HttpError.notFound('That garment does not exist.');
  }
  return garment._id;
}

async function requireOperation(id: string): Promise<OperationDocument> {
  const operation = await OperationModel.findById(id);
  if (!operation) {
    throw HttpError.notFound('That operation does not exist.');
  }
  return operation;
}

export async function listOperations(garmentId: string): Promise<OperationDTO[]> {
  const id = await requireGarmentId(garmentId);
  const [operations, master] = await Promise.all([
    OperationModel.find({ garment: id }).sort({ sequence: 1 }),
    loadMasterData()
  ]);
  return operations.map((operation) => toDTO(operation, master));
}

export async function createOperation(
  garmentId: string,
  body: CreateOperationBody
): Promise<OperationDTO> {
  const id = await requireGarmentId(garmentId);

  const last = await OperationModel.findOne({ garment: id }).sort({ sequence: -1 }).select('sequence');
  const sequence = (last?.sequence ?? 0) + 1;

  const operation = await OperationModel.create({
    garment: id,
    sequence,
    name: body.name ?? '',
    machineType: body.machineTypeId ? new Types.ObjectId(body.machineTypeId) : null,
    seamLengthCm: body.seamLengthCm ?? 0,
    notes: body.notes ?? ''
  });

  return toDTO(operation, await loadMasterData());
}

export async function updateOperation(id: string, body: UpdateOperationBody): Promise<OperationDTO> {
  const operation = await requireOperation(id);

  if (body.machineTypeId !== undefined) {
    const next = body.machineTypeId ? new Types.ObjectId(body.machineTypeId) : null;
    const changed = String(operation.machineType ?? '') !== String(next ?? '');
    if (changed) {
      operation.machineType = next;
      // The new machine's positions are different ones, so the old assignments are void.
      operation.threads = new Map();
    }
  }

  if (body.name !== undefined) operation.name = body.name;
  if (body.seamLengthCm !== undefined) operation.seamLengthCm = body.seamLengthCm;
  if (body.notes !== undefined) operation.notes = body.notes;

  await operation.save();
  return toDTO(operation, await loadMasterData());
}

/** One position at a time, matching the select in the expanded thread panel. */
export async function updateOperationThread(
  id: string,
  body: UpdateOperationThreadBody
): Promise<OperationDTO> {
  const operation = await requireOperation(id);
  const master = await loadMasterData();

  const machineType = operation.machineType
    ? master.machineTypes.find((candidate) => candidate.id === operation.machineType?.toString()) ?? null
    : null;

  if (!machineType) {
    throw HttpError.validation('Pick a machine type before assigning threads.');
  }
  if (!machineType.positions.some((position) => position.id === body.positionId)) {
    throw HttpError.notFound('That thread position does not belong to this operation’s machine type.');
  }

  if (body.threadId === null) {
    operation.threads.delete(body.positionId);
  } else {
    const thread = await ThreadModel.exists({ _id: new Types.ObjectId(body.threadId) });
    if (!thread) {
      throw HttpError.notFound('That thread does not exist.');
    }
    operation.threads.set(body.positionId, new Types.ObjectId(body.threadId));
  }

  operation.markModified('threads');
  await operation.save();
  return toDTO(operation, master);
}

/**
 * Rewrites every sequence in one transaction. Sequences pass through a negative offset
 * first so the unique { garment, sequence } index never sees a collision mid-flight.
 */
async function renumber(
  garmentId: Types.ObjectId,
  orderedIds: Types.ObjectId[],
  session?: ClientSession
): Promise<void> {
  if (orderedIds.length === 0) return;

  const toNegative = orderedIds.map((id, index) => ({
    updateOne: { filter: { _id: id, garment: garmentId }, update: { $set: { sequence: -(index + 1) } } }
  }));
  const toFinal = orderedIds.map((id, index) => ({
    updateOne: { filter: { _id: id, garment: garmentId }, update: { $set: { sequence: index + 1 } } }
  }));

  await OperationModel.bulkWrite(toNegative, { ordered: true, ...sessionOption(session) });
  await OperationModel.bulkWrite(toFinal, { ordered: true, ...sessionOption(session) });
}

export async function reorderOperations(
  garmentId: string,
  body: ReorderOperationsBody
): Promise<OperationDTO[]> {
  const id = await requireGarmentId(garmentId);

  const existing = await OperationModel.find({ garment: id }).select('_id');
  const existingIds = new Set(existing.map((operation) => operation._id.toHexString()));
  const requestedIds = body.orderedIds;

  if (new Set(requestedIds).size !== requestedIds.length) {
    throw HttpError.validation('The reorder list contains the same operation twice.');
  }
  if (requestedIds.length !== existingIds.size) {
    throw HttpError.validation('Send every operation of this garment, in the new order.');
  }
  for (const operationId of requestedIds) {
    if (!existingIds.has(operationId)) {
      throw HttpError.validation('The reorder list names an operation that is not on this garment.');
    }
  }

  await withTransaction((session) =>
    renumber(
      id,
      requestedIds.map((operationId) => new Types.ObjectId(operationId)),
      session
    )
  );

  return listOperations(garmentId);
}

export async function deleteOperation(id: string): Promise<void> {
  const operation = await requireOperation(id);
  const garmentId = operation.garment;

  await withTransaction(async (session) => {
    await OperationModel.deleteOne({ _id: operation._id }, sessionOption(session));

    const remaining = await OperationModel.find({ garment: garmentId })
      .sort({ sequence: 1 })
      .select('_id')
      .session(session ?? null);

    await renumber(
      garmentId,
      remaining.map((entry) => entry._id),
      session
    );
  });
}
