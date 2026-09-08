import { describe, expect, it } from 'vitest';
import {
  applyOrderScaling,
  applyRounding,
  buildCalculation,
  formatPositionSpecs,
  formatThreadSummary,
  isOperationComplete,
  operationMetres,
  positionMetres,
  rawConeCount,
  rollUpByThread,
  type MachineType,
  type Operation,
  type Thread
} from './threadCalculation';

// ---------------------------------------------------------------------------
// Fixtures — the seeded factory data (DATA_MODEL.md §machinetypes, §operations)
// ---------------------------------------------------------------------------

const OL4: MachineType = {
  id: 'ol4',
  name: 'Four Thread Overlock',
  code: 'OL-4',
  colour: '#2F5BD0',
  positions: [
    { id: 'ol4-NEEDLE', position: 'NEEDLE', count: 2, consumptionRatio: 4.0 },
    { id: 'ol4-UPPER_LOOPER', position: 'UPPER_LOOPER', count: 1, consumptionRatio: 6.0 },
    { id: 'ol4-LOWER_LOOPER', position: 'LOWER_LOOPER', count: 1, consumptionRatio: 6.0 }
  ]
};

const FL2: MachineType = {
  id: 'fl2',
  name: 'Two Needle Flatlock',
  code: 'FL-2',
  colour: '#17795A',
  positions: [
    { id: 'fl2-NEEDLE', position: 'NEEDLE', count: 2, consumptionRatio: 5.0 },
    { id: 'fl2-UPPER_LOOPER', position: 'UPPER_LOOPER', count: 1, consumptionRatio: 8.0 }
  ]
};

const LS1: MachineType = {
  id: 'ls1',
  name: 'Single Needle Lock Stitch',
  code: 'LS-1',
  colour: '#B4560F',
  positions: [
    { id: 'ls1-NEEDLE', position: 'NEEDLE', count: 1, consumptionRatio: 1.4 },
    { id: 'ls1-BOBBIN', position: 'BOBBIN', count: 1, consumptionRatio: 1.1 }
  ]
};

const CS1: MachineType = {
  id: 'cs1',
  name: 'Single Needle Chain Stitch',
  code: 'CS-1',
  colour: '#7A3FBF',
  positions: [
    { id: 'cs1-NEEDLE', position: 'NEEDLE', count: 1, consumptionRatio: 1.6 },
    { id: 'cs1-UPPER_LOOPER', position: 'UPPER_LOOPER', count: 1, consumptionRatio: 3.5 }
  ]
};

const CS2: MachineType = {
  id: 'cs2',
  name: 'Double Needle Chain Stitch',
  code: 'CS-2',
  colour: '#0E7290',
  positions: [
    { id: 'cs2-NEEDLE', position: 'NEEDLE', count: 2, consumptionRatio: 1.6 },
    { id: 'cs2-UPPER_LOOPER', position: 'UPPER_LOOPER', count: 2, consumptionRatio: 3.5 }
  ]
};

const BT: MachineType = {
  id: 'bt',
  name: 'Bartack',
  code: 'BT',
  colour: '#A83070',
  positions: [
    { id: 'bt-NEEDLE', position: 'NEEDLE', count: 1, consumptionRatio: 2.0 },
    { id: 'bt-BOBBIN', position: 'BOBBIN', count: 1, consumptionRatio: 1.8 }
  ]
};

const MACHINE_TYPES = [OL4, FL2, LS1, CS1, CS2, BT];

const GRAMAX: Thread = {
  id: 't1',
  brand: 'Gramax',
  ticket: 160,
  composition: 'Spun polyester',
  colour: 'White',
  coneYieldM: 5000
};
const SURFILOR: Thread = {
  id: 't2',
  brand: 'Surfilor',
  ticket: 120,
  composition: 'Textured polyester',
  colour: 'White',
  coneYieldM: 5000
};
const EPIC: Thread = {
  id: 't3',
  brand: 'Epic',
  ticket: 120,
  composition: 'Core spun poly/poly',
  colour: 'White',
  coneYieldM: 5000
};

const THREADS = [GRAMAX, SURFILOR, EPIC];

const ol4Threads = { 'ol4-NEEDLE': 't1', 'ol4-UPPER_LOOPER': 't2', 'ol4-LOWER_LOOPER': 't2' };
const fl2Threads = { 'fl2-NEEDLE': 't1', 'fl2-UPPER_LOOPER': 't2' };
const ls1Threads = { 'ls1-NEEDLE': 't3', 'ls1-BOBBIN': 't3' };
const cs1Threads = { 'cs1-NEEDLE': 't1', 'cs1-UPPER_LOOPER': 't1' };
const cs2Threads = { 'cs2-NEEDLE': 't1', 'cs2-UPPER_LOOPER': 't1' };
const btThreads = { 'bt-NEEDLE': 't3', 'bt-BOBBIN': 't3' };

function op(
  id: string,
  sequence: number,
  name: string,
  machineTypeId: string | null,
  seamLengthCm: number,
  threads: Record<string, string | undefined>
): Operation {
  return { id, sequence, name, machineTypeId, seamLengthCm, threads: { ...threads } };
}

/** STY-4471 — "Men's Crew Neck T-Shirt", the seeded twelve-operation sequence. */
function sty4471(): Operation[] {
  return [
    op('o1', 1, 'Join the shoulder', 'ol4', 42, ol4Threads),
    op('o2', 2, 'Outlining on shoulder', 'fl2', 42, fl2Threads),
    op('o3', 3, 'Attach sleeve to body panel', 'ol4', 96, ol4Threads),
    op('o4', 4, 'Join side seam', 'ol4', 124, ol4Threads),
    op('o5', 5, 'Join the neckband', 'ls1', 6, ls1Threads),
    op('o6', 6, 'Attach the neck band (4 tags)', 'ls1', 8, ls1Threads),
    op('o7', 7, 'Attach the neck band', 'ol4', 58, ol4Threads),
    op('o8', 8, 'Outlining on neckband', 'cs1', 58, cs1Threads),
    op('o9', 9, 'Attach the neck tape', 'cs2', 46, cs2Threads),
    op('o10', 10, 'Finish the neck tape', 'bt', 4, btThreads),
    op('o11', 11, 'Hemming on sleeve', 'fl2', 44, fl2Threads),
    op('o12', 12, 'Hemming on body', 'fl2', 108, fl2Threads)
  ];
}

const baseInput = {
  machineTypes: MACHINE_TYPES,
  threads: THREADS,
  quantity: 12000,
  wastagePercent: 12,
  roundingMode: 'PER_THREAD' as const
};

// ---------------------------------------------------------------------------
// The twelve pinned vectors from CALCULATIONS.md §Test vectors
// ---------------------------------------------------------------------------

describe('CALCULATIONS.md test vectors', () => {
  it('1 — single position: 42 cm, ratio 4.0, count 2 → 3.36 m', () => {
    expect(positionMetres(42, 4.0, 2)).toBeCloseTo(3.36, 10);
  });

  it('2 — operation total, OL-4 at 42 cm → 8.40 m (3.36 + 2.52 + 2.52)', () => {
    const operation = op('o1', 1, 'Join the shoulder', 'ol4', 42, ol4Threads);
    expect(operationMetres(operation, OL4)).toBeCloseTo(8.4, 10);
    expect(positionMetres(42, 6.0, 1)).toBeCloseTo(2.52, 10);
  });

  it('3 — the same thread on both loopers rolls up as one thread entry, not two', () => {
    const operation = op('o1', 1, 'Join the shoulder', 'ol4', 42, ol4Threads);
    const rollup = rollUpByThread([operation], MACHINE_TYPES, THREADS);

    expect(rollup).toHaveLength(2);

    const surfilor = rollup.find((entry) => entry.threadId === 't2');
    expect(surfilor).toBeDefined();
    expect(surfilor?.metresPerGarment).toBeCloseTo(5.04, 10);
    // One entry, but both looper positions are listed as consumers.
    expect(surfilor?.consumers).toHaveLength(2);
  });

  it('4 — order scaling: 53.92 m/garment × 12,000 × 1.12 → 724,684.8 m', () => {
    const { metresOrder, metresWithWastage } = applyOrderScaling(53.92, 12000, 12);
    expect(metresOrder).toBeCloseTo(647040, 6);
    expect(metresWithWastage).toBeCloseTo(724684.8, 4);
  });

  it('5 — cone ceiling: 724,684.8 ÷ 5,000 = 144.9369… → 145 cones in PER_THREAD', () => {
    const raw = rawConeCount(724684.8, 5000);
    expect(raw).toBeCloseTo(144.93696, 6);
    expect(applyRounding([raw], 'PER_THREAD')).toEqual({ cones: [145], totalCones: 145 });
  });

  it('6 — PER_THREAD vs ORDER_TOTAL: 144.94 / 60.20 / 3.10 → 210 vs 209', () => {
    const raw = [144.94, 60.2, 3.1];

    const perThread = applyRounding(raw, 'PER_THREAD');
    expect(perThread.cones).toEqual([145, 61, 4]);
    expect(perThread.totalCones).toBe(210);

    const orderTotal = applyRounding(raw, 'ORDER_TOTAL');
    expect(orderTotal.totalCones).toBe(209);

    // The modes differ — that difference is the whole reason the mode is stored on the order.
    expect(perThread.totalCones).not.toBe(orderTotal.totalCones);

    const withSafety = applyRounding(raw, 'PER_THREAD_PLUS_SAFETY');
    expect(withSafety.cones).toEqual([146, 62, 5]);
    expect(withSafety.totalCones).toBe(213);
  });

  it('7 — an incomplete operation contributes zero metres and blocks the order', () => {
    const operations = sty4471();
    const first = operations[0];
    expect(first).toBeDefined();
    if (!first) return;

    const complete = buildCalculation({ ...baseInput, operations });
    expect(complete.canCreateOrder).toBe(true);
    expect(complete.incompleteOperations).toHaveLength(0);

    // Drop the needle thread from operation 1.
    const { 'ol4-NEEDLE': _needle, ...rest } = first.threads;
    operations[0] = { ...first, threads: rest };

    const blocked = buildCalculation({ ...baseInput, operations });
    expect(blocked.canCreateOrder).toBe(false);
    expect(blocked.incompleteOperations).toEqual([
      { id: 'o1', sequence: 1, name: 'Join the shoulder' }
    ]);
    expect(blocked.operations[0]?.isComplete).toBe(false);

    // The unassigned position contributes nothing: 42 cm × 4.0 × 2 = 3.36 m of Gramax gone.
    const before = complete.threads.find((thread) => thread.threadId === 't1')?.metresPerGarment ?? 0;
    const after = blocked.threads.find((thread) => thread.threadId === 't1')?.metresPerGarment ?? 0;
    expect(before - after).toBeCloseTo(3.36, 6);

    // …while the operation's own machine consumption is unchanged.
    expect(blocked.operations[0]?.operationMetres).toBeCloseTo(8.4, 6);
  });

  it('8 — a machine change leaves the operation incomplete with an empty thread map', () => {
    const before = op('o1', 1, 'Join the shoulder', 'ol4', 42, ol4Threads);
    expect(isOperationComplete(before, OL4)).toBe(true);

    // The service clears the map when machineType changes; the positions are different.
    const after: Operation = { ...before, machineTypeId: 'ls1', threads: {} };
    expect(isOperationComplete(after, LS1)).toBe(false);
    expect(Object.keys(after.threads)).toHaveLength(0);

    const calculation = buildCalculation({ ...baseInput, operations: [after] });
    expect(calculation.canCreateOrder).toBe(false);
    expect(calculation.threads).toHaveLength(0);
  });

  it('9 — a zero seam length yields 0 metres without throwing', () => {
    const operation = op('o1', 1, 'Join the shoulder', 'ol4', 0, ol4Threads);
    expect(operationMetres(operation, OL4)).toBe(0);

    const calculation = buildCalculation({ ...baseInput, operations: [operation] });
    expect(calculation.totalMetres).toBe(0);
    expect(calculation.totalCones).toBe(0);
    // It is still "complete" — every position has a thread; only the length is missing.
    expect(calculation.operations[0]?.isComplete).toBe(true);
  });

  it('10 — 0% wastage leaves metresWithWastage === metresOrder', () => {
    const { metresOrder, metresWithWastage } = applyOrderScaling(53.92, 12000, 0);
    expect(metresWithWastage).toBe(metresOrder);

    const calculation = buildCalculation({ ...baseInput, operations: sty4471(), wastagePercent: 0 });
    for (const thread of calculation.threads) {
      expect(thread.metresWithWastage).toBe(thread.metresOrder);
    }
  });

  it('11 — raising OL-4 needle ratio 4.0 → 4.5 raises every OL-4 needle figure by 12.5%', () => {
    const operations = sty4471();
    const before = buildCalculation({ ...baseInput, operations });

    const raised: MachineType = {
      ...OL4,
      positions: OL4.positions.map((position) =>
        position.position === 'NEEDLE' ? { ...position, consumptionRatio: 4.5 } : position
      )
    };
    const after = buildCalculation({
      ...baseInput,
      operations,
      machineTypes: [raised, FL2, LS1, CS1, CS2, BT]
    });

    // OL-4 needles carry Gramax; the OL-4 seam total is 42 + 96 + 124 + 58 = 320 cm.
    const ol4NeedleBefore = (320 / 100) * 4.0 * 2;
    const gramaxBefore = before.threads.find((thread) => thread.threadId === 't1')?.metresPerGarment ?? 0;
    const gramaxAfter = after.threads.find((thread) => thread.threadId === 't1')?.metresPerGarment ?? 0;

    expect(gramaxAfter - gramaxBefore).toBeCloseTo(ol4NeedleBefore * 0.125, 6);

    // Operation 1's own total moves by the same 12.5% on its needle share only.
    expect(after.operations[0]?.operationMetres).toBeCloseTo(8.4 + 3.36 * 0.125, 6);

    // Threads that never touch an OL-4 needle are untouched.
    const epicBefore = before.threads.find((thread) => thread.threadId === 't3')?.metresPerGarment;
    const epicAfter = after.threads.find((thread) => thread.threadId === 't3')?.metresPerGarment;
    expect(epicAfter).toBe(epicBefore);
  });

  it('12 — snapshot immutability: editing the garment never changes a stored order', () => {
    const operations = sty4471();
    const atCreation = buildCalculation({ ...baseInput, operations });

    // What POST /orders freezes onto the cone order.
    const snapshot = {
      totalCones: atCreation.totalCones,
      totalMetres: atCreation.totalMetres,
      lines: atCreation.threads.map((thread) => ({ threadId: thread.threadId, cones: thread.cones }))
    };

    // The garment technician doubles every seam length afterwards.
    const edited = operations.map((operation) => ({
      ...operation,
      seamLengthCm: operation.seamLengthCm * 2
    }));
    const afterEdit = buildCalculation({ ...baseInput, operations: edited });

    expect(afterEdit.totalCones).toBeGreaterThan(snapshot.totalCones);
    expect(snapshot.totalCones).toBe(atCreation.totalCones);
    expect(snapshot.totalMetres).toBe(atCreation.totalMetres);
    expect(snapshot.lines).toEqual(
      atCreation.threads.map((thread) => ({ threadId: thread.threadId, cones: thread.cones }))
    );

    // buildCalculation never mutates the operations handed to it.
    expect(operations[0]?.seamLengthCm).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// The string formatter — CALCULATIONS.md §Thread summary strings
// ---------------------------------------------------------------------------

describe('formatPositionSpecs', () => {
  it('renders the documented on-screen summary', () => {
    const operation = op('o1', 1, 'Join the shoulder', 'ol4', 42, ol4Threads);
    expect(formatThreadSummary(operation, OL4, THREADS)).toBe(
      'LOOPER 2 × 120 Surfilor · NEEDLE 2 × 160 Gramax'
    );
  });

  it('renders the documented printed cells, upper-cased', () => {
    const operation = op('o1', 1, 'Join the shoulder', 'ol4', 42, ol4Threads);
    expect(formatPositionSpecs(operation, OL4, THREADS, { upper: true })).toEqual([
      'LOOPER - 2 - 120 SURFILOR',
      'NEEDLE - 2 - 160 GRAMAX'
    ]);
  });

  it('labels a machine with only one looper as LOOPER', () => {
    const operation = op('o2', 2, 'Outlining on shoulder', 'fl2', 42, fl2Threads);
    expect(formatThreadSummary(operation, FL2, THREADS)).toBe(
      'LOOPER 1 × 120 Surfilor · NEEDLE 2 × 160 Gramax'
    );
  });

  it('collapses both loopers with the counts summed when they share a thread', () => {
    const operation = op('o1', 1, 'Join the shoulder', 'ol4', 42, ol4Threads);
    const [looper] = formatPositionSpecs(operation, OL4, THREADS, { upper: false });
    expect(looper).toBe('LOOPER 2 × 120 Surfilor');
  });

  it('keeps UPPER LOOPER and LOWER LOOPER apart when they carry different threads', () => {
    const operation = op('o1', 1, 'Join the shoulder', 'ol4', 42, {
      'ol4-NEEDLE': 't1',
      'ol4-UPPER_LOOPER': 't2',
      'ol4-LOWER_LOOPER': 't3'
    });
    expect(formatThreadSummary(operation, OL4, THREADS)).toBe(
      'UPPER LOOPER 1 × 120 Surfilor · LOWER LOOPER 1 × 120 Epic · NEEDLE 2 × 160 Gramax'
    );
  });

  it('shows an em dash for an unassigned position', () => {
    const operation = op('o1', 1, 'Join the shoulder', 'ol4', 42, { 'ol4-NEEDLE': 't1' });
    expect(formatThreadSummary(operation, OL4, THREADS)).toBe(
      'LOOPER 2 × — · NEEDLE 2 × 160 Gramax'
    );
  });

  it('returns nothing when no machine type is selected', () => {
    const operation = op('o1', 1, 'Unnamed', null, 42, {});
    expect(formatPositionSpecs(operation, null, THREADS, { upper: false })).toEqual([]);
    expect(formatThreadSummary(operation, null, THREADS)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Derived flags the API must return — CALCULATIONS.md §Derived flags
// ---------------------------------------------------------------------------

describe('buildCalculation derived flags', () => {
  it('counts machine changeovers between adjacent operations', () => {
    const calculation = buildCalculation({ ...baseInput, operations: sty4471() });
    expect(calculation.machineChangeovers).toBe(8);
  });

  it('lists distinct machine types in sequence order', () => {
    const calculation = buildCalculation({ ...baseInput, operations: sty4471() });
    expect(calculation.machineTypesUsed.map((machine) => machine.code)).toEqual([
      'OL-4',
      'FL-2',
      'LS-1',
      'CS-1',
      'CS-2',
      'BT'
    ]);
  });

  it('refuses an order for a garment with no operations', () => {
    const calculation = buildCalculation({ ...baseInput, operations: [] });
    expect(calculation.canCreateOrder).toBe(false);
    expect(calculation.operationCount).toBe(0);
    expect(calculation.totalCones).toBe(0);
  });

  it('reports the seeded STY-4471 figures consistently across threads and total', () => {
    const calculation = buildCalculation({ ...baseInput, operations: sty4471() });

    expect(calculation.threadCount).toBe(3);
    expect(calculation.operationCount).toBe(12);

    // Surfilor sits on the OL-4 loopers (320 cm) and the FL-2 upper looper (194 cm).
    const surfilor = calculation.threads.find((thread) => thread.threadId === 't2');
    expect(surfilor?.metresPerGarment).toBeCloseTo(53.92, 6);
    expect(surfilor?.metresOrder).toBeCloseTo(647040, 2);
    expect(surfilor?.metresWithWastage).toBeCloseTo(724684.8, 2);
    expect(surfilor?.rawCones).toBeCloseTo(144.94, 2);
    expect(surfilor?.cones).toBe(145);

    // PER_THREAD: the order total is the sum of the per-thread ceilings.
    const sum = calculation.threads.reduce((total, thread) => total + thread.cones, 0);
    expect(calculation.totalCones).toBe(sum);

    // Pinned so a change to the seed or the arithmetic has to be deliberate.
    // (CALCULATIONS.md's worked table labels 53.92 as Gramax; on the seeded data it is
    // Surfilor. Its "recompute from the seed rather than trusting these figures" note
    // applies — the pinned vectors above are the contract, these are the seed's answer.)
    expect(calculation.threads.map((thread) => [thread.brand, thread.cones])).toEqual([
      ['Surfilor', 145],
      ['Gramax', 142],
      // Consumption is only 1.35 cones, but Epic is threaded at six positions across the
      // line — needle + bobbin on two lock-stitch operations and on the bartack — and each
      // of those machines needs its own cone standing on it.
      ['Epic', 6]
    ]);
    expect(calculation.threads.find((thread) => thread.brand === 'Epic')?.threadingCones).toBe(6);
    expect(calculation.totalCones).toBe(293);
    expect(calculation.totalMetres).toBeCloseTo(1439047.68, 2);
  });

  it('guards a zero cone yield instead of returning Infinity', () => {
    expect(rawConeCount(1000, 0)).toBe(1000);
    expect(Number.isFinite(rawConeCount(1000, 0))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The threading floor — a cone feeds one position at a time
// ---------------------------------------------------------------------------

describe('threading floor', () => {
  /**
   * The factory's own example. A Double Needle Flatlock with a different thread at each
   * position, on a short sample run: consumption is a fraction of a 2,500 m cone, but the
   * machine still needs two cones of Epic standing on it because both needles run at once.
   */
  const FLATLOCK: MachineType = {
    id: 'dnfl',
    name: 'Double Needle Flatlock',
    code: 'FL-2N',
    colour: '#17795A',
    positions: [
      { id: 'dnfl-NEEDLE', position: 'NEEDLE', count: 2, consumptionRatio: 5.0 },
      { id: 'dnfl-UPPER_LOOPER', position: 'UPPER_LOOPER', count: 1, consumptionRatio: 8.0 },
      { id: 'dnfl-LOWER_LOOPER', position: 'LOWER_LOOPER', count: 1, consumptionRatio: 8.0 }
    ]
  };

  const EPIC_120: Thread = { ...EPIC, coneYieldM: 2500 };
  const GRAMAX_120: Thread = { ...GRAMAX, ticket: 120, coneYieldM: 2500 };
  const SURFILOR_120: Thread = { ...SURFILOR, coneYieldM: 2500 };
  const SMALL_CONES = [EPIC_120, GRAMAX_120, SURFILOR_120];

  const flatlockOperation = op('f1', 1, 'Attach rib cuff', 'dnfl', 40, {
    'dnfl-NEEDLE': 't3', // 120 Epic on both needles
    'dnfl-UPPER_LOOPER': 't1', // 120 Gramax
    'dnfl-LOWER_LOOPER': 't2' // 120 Surfilor
  });

  it('needs one cone per position slot, even when consumption is under one cone', () => {
    const calculation = buildCalculation({
      operations: [flatlockOperation],
      machineTypes: [FLATLOCK],
      threads: SMALL_CONES,
      quantity: 200,
      wastagePercent: 12,
      roundingMode: 'PER_THREAD'
    });

    const byThread = (id: string) => calculation.threads.find((thread) => thread.threadId === id);

    const epic = byThread('t3');
    const gramax = byThread('t1');
    const surfilor = byThread('t2');

    // Two needles at 5.0 over 40 cm: 0.4 × 5 × 2 = 4 m per garment, 200 pcs + 12% = 896 m.
    expect(epic?.metresPerGarment).toBeCloseTo(4, 6);
    expect(epic?.metresWithWastage).toBeCloseTo(896, 6);
    // Well under one 2,500 m cone…
    expect(epic?.rawCones).toBeLessThan(1);
    // …but both needles run at the same time, so two cones must be on the machine.
    expect(epic?.threadingCones).toBe(2);
    expect(epic?.cones).toBe(2);

    // One looper each, so one cone each.
    expect(gramax?.threadingCones).toBe(1);
    expect(gramax?.cones).toBe(1);
    expect(surfilor?.threadingCones).toBe(1);
    expect(surfilor?.cones).toBe(1);

    // "2 – 120 Epic, 1 – 120 Gramax, 1 – 120 Surfilor" — four cones on one machine.
    expect(calculation.totalCones).toBe(4);
  });

  it('consumption still wins once the run is long enough', () => {
    const calculation = buildCalculation({
      operations: [flatlockOperation],
      machineTypes: [FLATLOCK],
      threads: SMALL_CONES,
      quantity: 100_000,
      wastagePercent: 12,
      roundingMode: 'PER_THREAD'
    });

    const epic = calculation.threads.find((thread) => thread.threadId === 't3');
    // 4 m × 100,000 × 1.12 = 448,000 m ÷ 2,500 = 179.2 → 180 cones, far above the floor of 2.
    expect(epic?.rawCones).toBeCloseTo(179.2, 4);
    expect(epic?.threadingCones).toBe(2);
    expect(epic?.cones).toBe(180);
  });

  it('sums the slots across every operation — the whole line is threaded at once', () => {
    const second = op('f2', 2, 'Attach rib hem', 'dnfl', 60, {
      'dnfl-NEEDLE': 't3',
      'dnfl-UPPER_LOOPER': 't1',
      'dnfl-LOWER_LOOPER': 't2'
    });

    const calculation = buildCalculation({
      operations: [flatlockOperation, second],
      machineTypes: [FLATLOCK],
      threads: SMALL_CONES,
      quantity: 200,
      wastagePercent: 12,
      roundingMode: 'PER_THREAD'
    });

    // Two flatlocks on the line, two needles each: four cones of Epic mounted.
    expect(calculation.threads.find((t) => t.threadId === 't3')?.cones).toBe(4);
    expect(calculation.threads.find((t) => t.threadId === 't1')?.cones).toBe(2);
    expect(calculation.threads.find((t) => t.threadId === 't2')?.cones).toBe(2);
    expect(calculation.totalCones).toBe(8);
  });

  it('applies the floor in applyRounding, and leaves the pinned vectors alone', () => {
    // No floor given: exactly the behaviour CALCULATIONS.md pins.
    expect(applyRounding([144.94, 60.2, 3.1], 'PER_THREAD').totalCones).toBe(210);
    expect(applyRounding([144.94, 60.2, 3.1], 'ORDER_TOTAL').totalCones).toBe(209);

    // A floor lifts a thread whose consumption is tiny, and nothing else.
    const withFloor = applyRounding([144.94, 60.2, 0.04], 'PER_THREAD', [2, 1, 6]);
    expect(withFloor.cones).toEqual([145, 61, 6]);
    expect(withFloor.totalCones).toBe(212);

    // The safety spare sits on top of whichever requirement won.
    expect(applyRounding([0.04], 'PER_THREAD_PLUS_SAFETY', [3]).cones).toEqual([4]);

    // ORDER_TOTAL can pool interchangeable threads, but never below the cones on the line.
    expect(applyRounding([0.1, 0.1], 'ORDER_TOTAL', [4, 2]).totalCones).toBe(6);
  });
});
