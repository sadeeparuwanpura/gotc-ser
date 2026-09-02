/**
 * All thread and cone arithmetic lives here.
 *
 * No other file — server or client — divides by 100, multiplies by a consumption ratio,
 * applies wastage, or calls Math.ceil on a cone count. The garment screen, the
 * thread-requirement table, the printed cone order and the register must never be able to
 * disagree, and one implementation is the only way to guarantee that.
 *
 * Pure functions only: no database, no HTTP, no framework. See CALCULATIONS.md.
 */

import {
  POSITION_LABELS,
  POSITION_SORT_ORDER,
  type PositionName,
  type RoundingMode
} from '../constants/domain';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface MachinePosition {
  id: string;
  position: PositionName;
  /** How many of that position the machine has. */
  count: number;
  /** Metres of thread consumed per metre of seam. */
  consumptionRatio: number;
}

export interface MachineType {
  id: string;
  name: string;
  code: string;
  colour: string;
  positions: MachinePosition[];
}

export interface Thread {
  id: string;
  brand: string;
  /** Inverse weight — a higher ticket is a finer thread. */
  ticket: number;
  composition: string;
  colour: string;
  coneYieldM: number;
}

export interface Operation {
  id: string;
  sequence: number;
  name: string;
  machineTypeId: string | null;
  seamLengthCm: number;
  /** Keyed by machine-type position id; values are thread ids. */
  threads: Record<string, string | undefined>;
  notes?: string;
}

export interface CalculationInput {
  operations: readonly Operation[];
  machineTypes: readonly MachineType[];
  threads: readonly Thread[];
  quantity: number;
  wastagePercent: number;
  roundingMode: RoundingMode;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface ThreadConsumer {
  operationId: string;
  sequence: number;
  operationName: string;
  /** Upper and lower loopers both report as LOOPER, matching the summary strings. */
  position: string;
  metres: number;
}

export interface ThreadRollupEntry {
  threadId: string;
  thread: Thread;
  metresPerGarment: number;
  consumers: ThreadConsumer[];
}

export interface OrderScaling {
  metresOrder: number;
  metresWithWastage: number;
}

export interface RoundingResult {
  /** Whole cones per thread, in the order the raw values were given. */
  cones: number[];
  /** The order's cone figure under the chosen mode. */
  totalCones: number;
}

export interface CalculationThread {
  threadId: string;
  brand: string;
  ticket: number;
  composition: string;
  colour: string;
  coneYieldM: number;
  metresPerGarment: number;
  metresOrder: number;
  metresWithWastage: number;
  rawCones: number;
  cones: number;
  consumers: ThreadConsumer[];
}

export interface CalculationOperation {
  id: string;
  sequence: number;
  name: string;
  operationMetres: number;
  isComplete: boolean;
  threadSummary: string;
}

export interface MachineTypeRef {
  id: string;
  name: string;
  code: string;
  colour: string;
}

export interface IncompleteOperationRef {
  id: string;
  sequence: number;
  name: string;
}

export interface Calculation {
  quantity: number;
  wastagePercent: number;
  roundingMode: RoundingMode;
  totalMetres: number;
  totalCones: number;
  threadCount: number;
  operationCount: number;
  machineChangeovers: number;
  machineTypesUsed: MachineTypeRef[];
  canCreateOrder: boolean;
  incompleteOperations: IncompleteOperationRef[];
  threads: CalculationThread[];
  operations: CalculationOperation[];
}

export interface PositionSpec {
  label: string;
  count: number;
  /** `<ticket> <brand>`, or an em dash when the position has no thread. */
  spec: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const UNASSIGNED = '—';

/**
 * Float-noise guard at the ceiling step only. A raw count of 1.0000000000000002 must buy
 * one cone, not two. Intermediate metres are never rounded — see CALCULATIONS.md.
 */
const CONE_EPSILON = 1e-9;

function ceilCones(rawCones: number): number {
  if (!Number.isFinite(rawCones) || rawCones <= 0) return 0;
  return Math.ceil(rawCones - CONE_EPSILON);
}

/** Rounds for transport/display only, after every calculation step is complete. */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function indexById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function isLooper(position: PositionName): boolean {
  return position === 'UPPER_LOOPER' || position === 'LOWER_LOOPER';
}

/** Loopers first — that is how the factory's existing sheets read. */
export function sortPositions(machineType: MachineType | null): MachinePosition[] {
  if (!machineType) return [];
  return [...machineType.positions].sort(
    (a, b) => POSITION_SORT_ORDER[a.position] - POSITION_SORT_ORDER[b.position]
  );
}

// ---------------------------------------------------------------------------
// Step 1 — metres per position, per garment
// ---------------------------------------------------------------------------

/**
 * `positionMetres = (seamLengthCm / 100) × consumptionRatio × count`
 *
 * The /100 converts seam centimetres to metres. `count` multiplies because a two-needle
 * machine lays two parallel threads over the same seam length.
 */
export function positionMetres(seamLengthCm: number, consumptionRatio: number, count: number): number {
  const seam = Number.isFinite(seamLengthCm) ? seamLengthCm : 0;
  if (seam <= 0) return 0;
  return (seam / 100) * consumptionRatio * count;
}

// ---------------------------------------------------------------------------
// Step 2 — operation total
// ---------------------------------------------------------------------------

/**
 * Sum over the machine type's positions — what the machine consumes, whether or not a
 * thread has been picked yet. The expanded panel prints this as
 * "Operation total <n> m / garment".
 */
export function operationMetres(operation: Operation, machineType: MachineType | null): number {
  return sortPositions(machineType).reduce(
    (total, position) =>
      total + positionMetres(operation.seamLengthCm, position.consumptionRatio, position.count),
    0
  );
}

// ---------------------------------------------------------------------------
// Step 3 — roll up per thread, per garment
// ---------------------------------------------------------------------------

/**
 * Groups every position of every operation by the thread assigned to it. Positions with
 * no thread contribute nothing and make the operation incomplete.
 */
export function rollUpByThread(
  operations: readonly Operation[],
  machineTypes: readonly MachineType[],
  threads: readonly Thread[]
): ThreadRollupEntry[] {
  const machineTypeById = indexById(machineTypes);
  const threadById = indexById(threads);
  const rollup = new Map<string, ThreadRollupEntry>();

  const ordered = [...operations].sort((a, b) => a.sequence - b.sequence);

  for (const operation of ordered) {
    const machineType = operation.machineTypeId ? machineTypeById.get(operation.machineTypeId) ?? null : null;
    for (const position of sortPositions(machineType)) {
      const threadId = operation.threads[position.id];
      if (!threadId) continue;
      const thread = threadById.get(threadId);
      if (!thread) continue;

      let entry = rollup.get(threadId);
      if (!entry) {
        entry = { threadId, thread, metresPerGarment: 0, consumers: [] };
        rollup.set(threadId, entry);
      }

      const metres = positionMetres(operation.seamLengthCm, position.consumptionRatio, position.count);
      entry.metresPerGarment += metres;
      entry.consumers.push({
        operationId: operation.id,
        sequence: operation.sequence,
        operationName: operation.name,
        position: isLooper(position.position) ? 'LOOPER' : position.position,
        metres
      });
    }
  }

  return [...rollup.values()];
}

// ---------------------------------------------------------------------------
// Step 4 — scale to the order and add wastage
// ---------------------------------------------------------------------------

/**
 * Wastage is applied at order level, **after** multiplying by quantity — not per garment,
 * not per operation.
 */
export function applyOrderScaling(
  metresPerGarment: number,
  quantity: number,
  wastagePercent: number
): OrderScaling {
  const pieces = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const wastage = Number.isFinite(wastagePercent) ? wastagePercent : 0;
  const metresOrder = metresPerGarment * pieces;
  return { metresOrder, metresWithWastage: metresOrder * (1 + wastage / 100) };
}

// ---------------------------------------------------------------------------
// Step 5 — cones
// ---------------------------------------------------------------------------

/** `rawCones = metresWithWastage / coneYieldM`, guarded against a zero yield. */
export function rawConeCount(metresWithWastage: number, coneYieldM: number): number {
  const yieldM = Number.isFinite(coneYieldM) && coneYieldM > 0 ? coneYieldM : 1;
  return metresWithWastage / yieldM;
}

/**
 * Turns raw per-thread cone counts into whole cones under the order's rounding mode.
 *
 * Per-thread `cones` is always the ceiling of that thread's own raw count — you cannot buy
 * a fraction of a cone of a particular thread. Only `totalCones` follows the mode, which is
 * why ORDER_TOTAL can report fewer cones than the lines add up to. That difference is the
 * point of the mode and is printed on the sheet.
 */
export function applyRounding(rawCones: readonly number[], mode: RoundingMode): RoundingResult {
  const perThread = rawCones.map(ceilCones);

  if (mode === 'PER_THREAD_PLUS_SAFETY') {
    const cones = perThread.map((count) => count + 1);
    return { cones, totalCones: cones.reduce((sum, count) => sum + count, 0) };
  }

  if (mode === 'ORDER_TOTAL') {
    const rawTotal = rawCones.reduce((sum, value) => sum + value, 0);
    return { cones: perThread, totalCones: ceilCones(rawTotal) };
  }

  return { cones: perThread, totalCones: perThread.reduce((sum, count) => sum + count, 0) };
}

// ---------------------------------------------------------------------------
// Derived flags
// ---------------------------------------------------------------------------

/** Complete when it has a machine type **and** every position has a thread. */
export function isOperationComplete(operation: Operation, machineType: MachineType | null): boolean {
  const positions = sortPositions(machineType);
  if (!operation.machineTypeId || !machineType || positions.length === 0) return false;
  return positions.every((position) => Boolean(operation.threads[position.id]));
}

// ---------------------------------------------------------------------------
// Thread summary strings
// ---------------------------------------------------------------------------

/**
 * One entry per position slot, applying the collapse rules in CALCULATIONS.md:
 *
 * 1. Sort UPPER_LOOPER, LOWER_LOOPER, BOBBIN, SPREADER, NEEDLE.
 * 2. Adjacent upper + lower loopers carrying the same thread collapse into one LOOPER
 *    entry with the counts summed.
 * 3. Otherwise a looper is UPPER LOOPER / LOWER LOOPER when the machine has both, and
 *    plain LOOPER when it has only one.
 */
export function positionSpecEntries(
  operation: Operation,
  machineType: MachineType | null,
  threads: readonly Thread[]
): PositionSpec[] {
  const threadById = indexById(threads);
  const positions = sortPositions(machineType);
  const hasBothLoopers =
    positions.some((entry) => entry.position === 'UPPER_LOOPER') &&
    positions.some((entry) => entry.position === 'LOWER_LOOPER');

  const entries: PositionSpec[] = [];
  let index = 0;

  while (index < positions.length) {
    const position = positions[index];
    if (!position) break;

    const threadId = operation.threads[position.id];
    const thread = threadId ? threadById.get(threadId) : undefined;
    const spec = thread ? `${thread.ticket} ${thread.brand}` : UNASSIGNED;

    const next = positions[index + 1];
    const collapses =
      position.position === 'UPPER_LOOPER' &&
      next?.position === 'LOWER_LOOPER' &&
      operation.threads[next.id] === threadId;

    if (collapses && next) {
      entries.push({ label: 'LOOPER', count: position.count + next.count, spec });
      index += 2;
      continue;
    }

    const label = isLooper(position.position)
      ? hasBothLoopers
        ? POSITION_LABELS[position.position]
        : 'LOOPER'
      : POSITION_LABELS[position.position];

    entries.push({ label, count: position.count, spec });
    index += 1;
  }

  return entries;
}

/**
 * `{ upper: false }` → screen cells (`LOOPER 2 × 120 Surfilor`).
 * `{ upper: true }`  → printed cells (`LOOPER - 2 - 120 SURFILOR`).
 */
export function formatPositionSpecs(
  operation: Operation,
  machineType: MachineType | null,
  threads: readonly Thread[],
  options: { upper: boolean }
): string[] {
  return positionSpecEntries(operation, machineType, threads).map((entry) =>
    options.upper
      ? `${entry.label} - ${entry.count} - ${entry.spec.toUpperCase()}`
      : `${entry.label} ${entry.count} × ${entry.spec}`
  );
}

/** The operations table's "Thread" column. Empty when no machine type is selected. */
export function formatThreadSummary(
  operation: Operation,
  machineType: MachineType | null,
  threads: readonly Thread[]
): string {
  return formatPositionSpecs(operation, machineType, threads, { upper: false }).join(' · ');
}

// ---------------------------------------------------------------------------
// The whole payload
// ---------------------------------------------------------------------------

export function buildCalculation(input: CalculationInput): Calculation {
  const machineTypeById = indexById(input.machineTypes);
  const operations = [...input.operations].sort((a, b) => a.sequence - b.sequence);

  const rollup = rollUpByThread(operations, input.machineTypes, input.threads);

  const scaled = rollup.map((entry) => {
    const { metresOrder, metresWithWastage } = applyOrderScaling(
      entry.metresPerGarment,
      input.quantity,
      input.wastagePercent
    );
    return {
      entry,
      metresOrder,
      metresWithWastage,
      rawCones: rawConeCount(metresWithWastage, entry.thread.coneYieldM)
    };
  });

  const rounded = applyRounding(
    scaled.map((line) => line.rawCones),
    input.roundingMode
  );

  const threads: CalculationThread[] = scaled
    .map((line, position) => ({
      threadId: line.entry.threadId,
      brand: line.entry.thread.brand,
      ticket: line.entry.thread.ticket,
      composition: line.entry.thread.composition,
      colour: line.entry.thread.colour,
      coneYieldM: line.entry.thread.coneYieldM,
      metresPerGarment: roundTo(line.entry.metresPerGarment, 2),
      metresOrder: roundTo(line.metresOrder, 2),
      metresWithWastage: roundTo(line.metresWithWastage, 2),
      rawCones: roundTo(line.rawCones, 2),
      cones: rounded.cones[position] ?? 0,
      consumers: line.entry.consumers.map((consumer) => ({
        ...consumer,
        metres: roundTo(consumer.metres, 2)
      }))
    }))
    .sort((a, b) => b.cones - a.cones || b.metresWithWastage - a.metresWithWastage);

  const incompleteOperations: IncompleteOperationRef[] = [];
  const machineTypesUsed: MachineTypeRef[] = [];
  const seenMachineTypes = new Set<string>();
  let machineChangeovers = 0;

  const operationRows: CalculationOperation[] = operations.map((operation, index) => {
    const machineType = operation.machineTypeId
      ? machineTypeById.get(operation.machineTypeId) ?? null
      : null;

    if (machineType && !seenMachineTypes.has(machineType.id)) {
      seenMachineTypes.add(machineType.id);
      machineTypesUsed.push({
        id: machineType.id,
        name: machineType.name,
        code: machineType.code,
        colour: machineType.colour
      });
    }

    const previous = operations[index - 1];
    if (previous && previous.machineTypeId !== operation.machineTypeId) {
      machineChangeovers += 1;
    }

    const complete = isOperationComplete(operation, machineType);
    if (!complete) {
      incompleteOperations.push({
        id: operation.id,
        sequence: operation.sequence,
        name: operation.name
      });
    }

    return {
      id: operation.id,
      sequence: operation.sequence,
      name: operation.name,
      operationMetres: roundTo(operationMetres(operation, machineType), 2),
      isComplete: complete,
      threadSummary: formatThreadSummary(operation, machineType, input.threads)
    };
  });

  const totalMetres = scaled.reduce((sum, line) => sum + line.metresWithWastage, 0);

  return {
    quantity: input.quantity,
    wastagePercent: input.wastagePercent,
    roundingMode: input.roundingMode,
    totalMetres: roundTo(totalMetres, 2),
    totalCones: rounded.totalCones,
    threadCount: threads.length,
    operationCount: operations.length,
    machineChangeovers,
    machineTypesUsed,
    canCreateOrder: operations.length > 0 && incompleteOperations.length === 0,
    incompleteOperations,
    threads,
    operations: operationRows
  };
}
