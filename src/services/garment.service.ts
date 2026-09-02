import { Types, type ClientSession, type FilterQuery } from 'mongoose';
import { GARMENT_TRANSITIONS, type GarmentStatus } from '../constants/domain';
import { ConeOrderModel } from '../models/cone-order.model';
import { FabricModel } from '../models/fabric.model';
import { GarmentModel, type GarmentAttrs, type GarmentDocument } from '../models/garment.model';
import { OperationModel } from '../models/operation.model';
import { buildCalculation } from '../domain/threadCalculation';
import type { GarmentDTO, GarmentListResponse, NextStyleNumberResponse } from '../dto/api-types';
import { HttpError } from '../utils/http-error';
import { sessionOption, withTransaction } from '../utils/transaction';
import { escapeRegex } from '../utils/regex';
import { loadMasterData, toDomainOperation } from './calculation.service';
import type { AuthContext } from '../types/express';
import type {
  CreateGarmentBody,
  GarmentListQuery,
  GarmentStatusBody,
  UpdateGarmentBody
} from '../schemas/garment.schema';

type FabricAssignment = { fabricId: string; parts: string[] };

/**
 * Resolves the fabric block, refusing the two documented cases:
 *   "Assign at least one fabric."          (zod, on the array length)
 *   "<Fabric> has no garment part assigned."  (here — the message names the fabric)
 */
async function resolveFabrics(
  assignments: FabricAssignment[]
): Promise<{ fabric: Types.ObjectId; parts: string[] }[]> {
  const ids = assignments.map((entry) => entry.fabricId);
  if (new Set(ids).size !== ids.length) {
    throw HttpError.validation('A fabric can only be assigned once per garment.');
  }

  const fabrics = await FabricModel.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } });
  const byId = new Map(fabrics.map((fabric) => [fabric._id.toHexString(), fabric]));

  return assignments.map((entry) => {
    const fabric = byId.get(entry.fabricId);
    if (!fabric) {
      throw HttpError.notFound('That fabric does not exist.');
    }
    const parts = entry.parts.map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) {
      throw HttpError.validation(`${fabric.name} has no garment part assigned.`);
    }
    return { fabric: fabric._id, parts };
  });
}

async function assertStyleNumberIsFree(styleNumber: string, exceptId?: string): Promise<void> {
  const filter: Record<string, unknown> = { styleNumber };
  if (exceptId) {
    filter._id = { $ne: new Types.ObjectId(exceptId) };
  }
  const existing = await GarmentModel.findOne(filter).collation({ locale: 'en', strength: 2 });
  if (existing) {
    throw HttpError.duplicate(`Style number ${styleNumber} already exists.`);
  }
}

export async function nextStyleNumber(): Promise<NextStyleNumberResponse> {
  const garments = await GarmentModel.find().select('styleNumber');
  const highest = garments.reduce((max, garment) => {
    const digits = garment.styleNumber.replace(/\D/g, '');
    const value = Number(digits);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);
  return { styleNumber: `STY-${String(highest + 1).padStart(4, '0')}` };
}

export async function toGarmentDTO(garment: GarmentDocument): Promise<GarmentDTO> {
  const fabricIds = garment.fabrics.map((entry) => entry.fabric);
  const fabrics = await FabricModel.find({ _id: { $in: fabricIds } });
  const byId = new Map(fabrics.map((fabric) => [fabric._id.toHexString(), fabric]));

  return {
    id: garment._id.toHexString(),
    name: garment.name,
    styleNumber: garment.styleNumber,
    garmentType: garment.garmentType,
    buyer: garment.buyer,
    season: garment.season,
    orderQuantity: garment.orderQuantity,
    sizeRange: garment.sizeRange,
    status: garment.status,
    wastagePercent: garment.wastagePercent,
    description: garment.description,
    fabrics: garment.fabrics.map((entry) => {
      const fabric = byId.get(entry.fabric.toString());
      return {
        id: entry._id.toHexString(),
        fabricId: entry.fabric.toString(),
        name: fabric?.name ?? 'Unknown fabric',
        composition: fabric?.composition ?? '',
        gsm: fabric?.gsm ?? null,
        colour: fabric?.colour ?? '',
        supplier: fabric?.supplier ?? '—',
        parts: [...entry.parts]
      };
    }),
    approvedBy: garment.approvedBy ? garment.approvedBy.toString() : null,
    approvedByName: garment.approvedByName,
    approvedAt: garment.approvedAt ? garment.approvedAt.toISOString() : null,
    createdAt: garment.createdAt.toISOString(),
    updatedAt: garment.updatedAt.toISOString()
  };
}

export async function listGarments(query: GarmentListQuery): Promise<GarmentListResponse> {
  const filter: FilterQuery<GarmentAttrs> = query.q
    ? {
        $or: [
          { styleNumber: new RegExp(escapeRegex(query.q), 'i') },
          { name: new RegExp(escapeRegex(query.q), 'i') },
          { buyer: new RegExp(escapeRegex(query.q), 'i') }
        ]
      }
    : {};

  const [garments, total, matchingIds] = await Promise.all([
    GarmentModel.find(filter)
      .sort({ styleNumber: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    GarmentModel.countDocuments(filter),
    GarmentModel.find(filter).select('_id')
  ]);

  const pageIds = garments.map((garment) => garment._id);

  // The header's operation count covers the whole filter, not just this page.
  const operationTotal = await OperationModel.countDocuments({
    garment: { $in: matchingIds.map((garment) => garment._id) }
  });

  // Only the page's garments are costed, so the work does not grow with the library.
  const [operations, master, orderCounts] = await Promise.all([
    OperationModel.find({ garment: { $in: pageIds } }).sort({ sequence: 1 }),
    loadMasterData(),
    ConeOrderModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { garment: { $in: pageIds } } },
      { $group: { _id: '$garment', count: { $sum: 1 } } }
    ])
  ]);

  const operationsByGarment = new Map<string, ReturnType<typeof toDomainOperation>[]>();
  for (const operation of operations) {
    const key = operation.garment.toString();
    const list = operationsByGarment.get(key) ?? [];
    list.push(toDomainOperation(operation));
    operationsByGarment.set(key, list);
  }

  const ordersByGarment = new Map(orderCounts.map((entry) => [entry._id.toString(), entry.count]));

  const items = garments.map((garment) => {
    const id = garment._id.toHexString();
    const garmentOperations = operationsByGarment.get(id) ?? [];
    const calculation = buildCalculation({
      operations: garmentOperations,
      machineTypes: master.machineTypes,
      threads: master.threads,
      quantity: garment.orderQuantity,
      wastagePercent: garment.wastagePercent,
      roundingMode: 'PER_THREAD'
    });

    return {
      id,
      name: garment.name,
      styleNumber: garment.styleNumber,
      garmentType: garment.garmentType,
      buyer: garment.buyer,
      season: garment.season,
      orderQuantity: garment.orderQuantity,
      status: garment.status,
      approvedByName: garment.approvedByName,
      operationCount: calculation.operationCount,
      machineTypesUsed: calculation.machineTypesUsed,
      totalCones: calculation.threadCount > 0 ? calculation.totalCones : null,
      orderCount: ordersByGarment.get(id) ?? 0
    };
  });

  return { items, total, page: query.page, limit: query.limit, operationTotal };
}

async function requireGarment(id: string): Promise<GarmentDocument> {
  const garment = await GarmentModel.findById(id);
  if (!garment) {
    throw HttpError.notFound('That garment does not exist.');
  }
  return garment;
}

export async function getGarment(id: string): Promise<GarmentDTO> {
  return toGarmentDTO(await requireGarment(id));
}

/** Deep-copies a source garment's operations onto a target, preserving sequence. */
async function copyOperations(
  sourceGarmentId: Types.ObjectId,
  targetGarmentId: Types.ObjectId,
  session?: ClientSession
): Promise<number> {
  const source = await OperationModel.find({ garment: sourceGarmentId })
    .sort({ sequence: 1 })
    .session(session ?? null);

  if (source.length === 0) return 0;

  const copies = source.map((operation, index) => ({
    garment: targetGarmentId,
    sequence: index + 1,
    name: operation.name,
    machineType: operation.machineType,
    seamLengthCm: operation.seamLengthCm,
    threads: new Map(operation.threads),
    notes: operation.notes
  }));

  await OperationModel.insertMany(copies, sessionOption(session));
  return copies.length;
}

export interface CreateGarmentResult {
  garment: GarmentDTO;
  operationsCopied: number;
}

export async function createGarment(
  body: CreateGarmentBody,
  createdBy: string
): Promise<CreateGarmentResult> {
  await assertStyleNumberIsFree(body.styleNumber);
  const fabrics = await resolveFabrics(body.fabrics);

  let source: GarmentDocument | null = null;
  if (body.copyOperationsFrom) {
    source = await GarmentModel.findById(body.copyOperationsFrom);
    if (!source) {
      throw HttpError.notFound('The style you are copying operations from does not exist.');
    }
  }

  return withTransaction(async (session) => {
    const [garment] = await GarmentModel.create(
      [
        {
          name: body.name,
          styleNumber: body.styleNumber,
          garmentType: body.garmentType ?? 'Unspecified',
          buyer: body.buyer,
          season: body.season ?? '—',
          orderQuantity: body.orderQuantity,
          sizeRange: body.sizeRange ?? '—',
          status: body.status ?? 'Draft',
          wastagePercent: body.wastagePercent,
          description: body.description ?? '',
          fabrics,
          createdBy: new Types.ObjectId(createdBy)
        }
      ],
      sessionOption(session)
    );

    if (!garment) {
      throw HttpError.internal('The garment could not be created.');
    }

    const operationsCopied = source ? await copyOperations(source._id, garment._id, session) : 0;
    return { garment: await toGarmentDTO(garment), operationsCopied };
  });
}

export async function updateGarment(id: string, body: UpdateGarmentBody): Promise<GarmentDTO> {
  const garment = await requireGarment(id);

  if (body.styleNumber !== undefined && body.styleNumber !== garment.styleNumber) {
    await assertStyleNumberIsFree(body.styleNumber, id);
    garment.styleNumber = body.styleNumber;
  }
  if (body.fabrics !== undefined) {
    garment.set('fabrics', await resolveFabrics(body.fabrics));
  }
  if (body.name !== undefined) garment.name = body.name;
  if (body.buyer !== undefined) garment.buyer = body.buyer;
  if (body.orderQuantity !== undefined) garment.orderQuantity = body.orderQuantity;
  if (body.wastagePercent !== undefined) garment.wastagePercent = body.wastagePercent;
  if (body.garmentType !== undefined) garment.garmentType = body.garmentType;
  if (body.season !== undefined) garment.season = body.season;
  if (body.sizeRange !== undefined) garment.sizeRange = body.sizeRange;
  if (body.description !== undefined) garment.description = body.description;

  await garment.save();
  return toGarmentDTO(garment);
}

/**
 * The same rule the cone order uses, on the style. `GARMENT_TRANSITIONS` is the only
 * place that says what a status may become — a client-supplied status is never trusted.
 */
function assertTransition(garment: GarmentDocument, next: GarmentStatus): void {
  if (!GARMENT_TRANSITIONS[garment.status].includes(next)) {
    throw HttpError.invalidTransition(
      `${garment.styleNumber} is ${garment.status.toLowerCase()} and cannot move to ${next.toLowerCase()}.`,
      { from: garment.status, to: next }
    );
  }
}

/** Approving records the actor; every other move clears the record back to null. */
async function transitionGarment(
  id: string,
  next: GarmentStatus,
  actor: AuthContext
): Promise<GarmentDTO> {
  const garment = await requireGarment(id);
  assertTransition(garment, next);

  garment.status = next;
  if (next === 'Approved') {
    garment.approvedBy = new Types.ObjectId(actor.userId);
    garment.approvedByName = actor.name;
    garment.approvedAt = new Date();
  } else {
    garment.approvedBy = null;
    garment.approvedByName = null;
    garment.approvedAt = null;
  }

  await garment.save();
  return toGarmentDTO(garment);
}

export async function approveGarment(id: string, actor: AuthContext): Promise<GarmentDTO> {
  return transitionGarment(id, 'Approved', actor);
}

export async function setGarmentStatus(
  id: string,
  body: GarmentStatusBody,
  actor: AuthContext
): Promise<GarmentDTO> {
  return transitionGarment(id, body.status, actor);
}

/** `STY-4471` → `STY-4471-A`, then `-B`… A copy of a copy takes the next free letter. */
async function nextDuplicateStyleNumber(styleNumber: string): Promise<string> {
  const base = styleNumber.replace(/-[A-Z]$/, '');
  for (let index = 0; index < 26; index += 1) {
    const candidate = `${base}-${String.fromCharCode(65 + index)}`;
    const taken = await GarmentModel.findOne({ styleNumber: candidate }).collation({
      locale: 'en',
      strength: 2
    });
    if (!taken) return candidate;
  }
  throw HttpError.duplicate(`${base} already has 26 copies. Rename one before duplicating again.`);
}

export interface DuplicateGarmentResult {
  garment: GarmentDTO;
  operationsCopied: number;
  sourceStyleNumber: string;
}

export async function duplicateGarment(
  id: string,
  createdBy: string
): Promise<DuplicateGarmentResult> {
  const source = await requireGarment(id);
  const styleNumber = await nextDuplicateStyleNumber(source.styleNumber);

  return withTransaction(async (session) => {
    const [copy] = await GarmentModel.create(
      [
        {
          name: source.name,
          styleNumber,
          garmentType: source.garmentType,
          buyer: source.buyer,
          season: source.season,
          orderQuantity: source.orderQuantity,
          sizeRange: source.sizeRange,
          status: 'Draft',
          wastagePercent: source.wastagePercent,
          description: source.description,
          fabrics: source.fabrics.map((entry) => ({ fabric: entry.fabric, parts: [...entry.parts] })),
          createdBy: new Types.ObjectId(createdBy)
        }
      ],
      sessionOption(session)
    );

    if (!copy) {
      throw HttpError.internal('The garment could not be duplicated.');
    }

    const operationsCopied = await copyOperations(source._id, copy._id, session);
    return {
      garment: await toGarmentDTO(copy),
      operationsCopied,
      sourceStyleNumber: source.styleNumber
    };
  });
}

export async function deleteGarment(id: string): Promise<void> {
  const garment = await requireGarment(id);

  const blocking = await ConeOrderModel.find({ garment: garment._id, status: { $ne: 'Draft' } })
    .select('code status')
    .sort({ code: 1 });

  if (blocking.length > 0) {
    const codes = blocking.map((order) => order.code);
    throw HttpError.inUse(
      `${garment.styleNumber} has ${codes.length} cone order${codes.length === 1 ? '' : 's'} on record (${codes.join(', ')}). Only a style whose orders are all drafts can be deleted.`,
      { codes }
    );
  }

  await withTransaction(async (session) => {
    await OperationModel.deleteMany({ garment: garment._id }, sessionOption(session));
    await ConeOrderModel.deleteMany({ garment: garment._id }, sessionOption(session));
    await GarmentModel.deleteOne({ _id: garment._id }, sessionOption(session));
  });
}
