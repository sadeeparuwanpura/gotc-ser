import { MachineTypeModel } from '../models/machine-type.model';
import { OperationModel, type OperationDocument } from '../models/operation.model';
import { ThreadModel } from '../models/thread.model';
import { GarmentModel, type GarmentDocument } from '../models/garment.model';
import {
  buildCalculation,
  formatPositionSpecs,
  type Calculation,
  type MachineType as DomainMachineType,
  type Operation as DomainOperation,
  type Thread as DomainThread
} from '../domain/threadCalculation';
import type { OrderRowDTO } from '../dto/api-types';
import type { RoundingMode } from '../constants/domain';
import { HttpError } from '../utils/http-error';

/**
 * Translates Mongoose documents into the plain shapes the domain module works with.
 * Nothing here does arithmetic — that all lives in `domain/threadCalculation.ts`.
 */

export interface CalculationContext {
  garment: GarmentDocument;
  operations: OperationDocument[];
  domainOperations: DomainOperation[];
  machineTypes: DomainMachineType[];
  threads: DomainThread[];
}

export function toDomainOperation(operation: OperationDocument): DomainOperation {
  const threads: Record<string, string> = {};
  operation.threads.forEach((threadId, positionId) => {
    threads[positionId] = threadId.toString();
  });

  return {
    id: operation._id.toHexString(),
    sequence: operation.sequence,
    name: operation.name,
    machineTypeId: operation.machineType ? operation.machineType.toString() : null,
    seamLengthCm: operation.seamLengthCm,
    threads,
    notes: operation.notes
  };
}

export async function loadMasterData(): Promise<{
  machineTypes: DomainMachineType[];
  threads: DomainThread[];
}> {
  const [machineTypes, threads] = await Promise.all([MachineTypeModel.find(), ThreadModel.find()]);

  return {
    machineTypes: machineTypes.map((machineType) => ({
      id: machineType._id.toHexString(),
      name: machineType.name,
      code: machineType.code,
      colour: machineType.colour,
      positions: machineType.positions.map((position) => ({
        id: position._id.toHexString(),
        position: position.position,
        count: position.count,
        consumptionRatio: position.consumptionRatio
      }))
    })),
    threads: threads.map((thread) => ({
      id: thread._id.toHexString(),
      brand: thread.brand,
      ticket: thread.ticket,
      composition: thread.composition,
      colour: thread.colour,
      coneYieldM: thread.coneYieldM
    }))
  };
}

export async function loadContext(garmentId: string): Promise<CalculationContext> {
  const garment = await GarmentModel.findById(garmentId);
  if (!garment) {
    throw HttpError.notFound('That garment does not exist.');
  }

  const [operations, master] = await Promise.all([
    OperationModel.find({ garment: garment._id }).sort({ sequence: 1 }),
    loadMasterData()
  ]);

  return {
    garment,
    operations,
    domainOperations: operations.map(toDomainOperation),
    machineTypes: master.machineTypes,
    threads: master.threads
  };
}

export interface CalculationOverrides {
  quantity?: number;
  wastagePercent?: number;
  roundingMode?: RoundingMode;
}

export function calculateFromContext(
  context: CalculationContext,
  overrides: CalculationOverrides = {}
): Calculation {
  return buildCalculation({
    operations: context.domainOperations,
    machineTypes: context.machineTypes,
    threads: context.threads,
    quantity: overrides.quantity ?? context.garment.orderQuantity,
    wastagePercent: overrides.wastagePercent ?? context.garment.wastagePercent,
    roundingMode: overrides.roundingMode ?? 'PER_THREAD'
  });
}

export async function calculateForGarment(
  garmentId: string,
  overrides: CalculationOverrides = {}
): Promise<Calculation> {
  return calculateFromContext(await loadContext(garmentId), overrides);
}

/**
 * The per-operation rows the printed cone order freezes. The column count of the sheet is
 * the widest row's cell count; shorter rows get empty cells at render time.
 */
export function buildOrderRows(context: CalculationContext): OrderRowDTO[] {
  const machineTypeById = new Map(context.machineTypes.map((machine) => [machine.id, machine]));

  return context.domainOperations.map((operation) => {
    const machineType = operation.machineTypeId
      ? machineTypeById.get(operation.machineTypeId) ?? null
      : null;
    return {
      sequence: operation.sequence,
      name: operation.name,
      machineName: machineType?.name ?? '',
      cells: formatPositionSpecs(operation, machineType, context.threads, { upper: true })
    };
  });
}
