import type { GarmentStatus, OrderStatus, PositionName, Role } from '../constants/domain';

/**
 * The demonstration factory, exactly as the prototype shows it: four accounts, six
 * machine types, three threads, three fabrics, four garments and their 24 operations,
 * then the five cone orders in the register.
 *
 * Numbers here are *inputs* only. Every metre and cone figure on a seeded order is
 * computed by `domain/threadCalculation.ts` at seed time.
 */

export const DEMO_PASSWORD = 'demo1234';

export interface SeedUser {
  name: string;
  email: string;
  role: Role;
}

export const USERS: SeedUser[] = [
  { name: 'R. Fernando', email: 'r.fernando@factory.lk', role: 'ADMIN' },
  { name: 'S. Jayawardena', email: 's.jaya@factory.lk', role: 'FABRIC_TECH' },
  { name: 'N. Perera', email: 'n.perera@factory.lk', role: 'GARMENT_TECH' },
  { name: 'K. Aluthge', email: 'k.aluthge@factory.lk', role: 'PROJECT_MANAGER' }
];

export interface SeedPosition {
  position: PositionName;
  count: number;
  consumptionRatio: number;
}

export interface SeedMachineType {
  name: string;
  code: string;
  colour: string;
  positions: SeedPosition[];
}

export const MACHINE_TYPES: SeedMachineType[] = [
  {
    name: 'Four Thread Overlock',
    code: 'OL-4',
    colour: '#2F5BD0',
    positions: [
      { position: 'NEEDLE', count: 2, consumptionRatio: 4.0 },
      { position: 'UPPER_LOOPER', count: 1, consumptionRatio: 6.0 },
      { position: 'LOWER_LOOPER', count: 1, consumptionRatio: 6.0 }
    ]
  },
  {
    name: 'Two Needle Flatlock',
    code: 'FL-2',
    colour: '#17795A',
    positions: [
      { position: 'NEEDLE', count: 2, consumptionRatio: 5.0 },
      { position: 'UPPER_LOOPER', count: 1, consumptionRatio: 8.0 }
    ]
  },
  {
    name: 'Single Needle Lock Stitch',
    code: 'LS-1',
    colour: '#B4560F',
    positions: [
      { position: 'NEEDLE', count: 1, consumptionRatio: 1.4 },
      { position: 'BOBBIN', count: 1, consumptionRatio: 1.1 }
    ]
  },
  {
    name: 'Single Needle Chain Stitch',
    code: 'CS-1',
    colour: '#7A3FBF',
    positions: [
      { position: 'NEEDLE', count: 1, consumptionRatio: 1.6 },
      { position: 'UPPER_LOOPER', count: 1, consumptionRatio: 3.5 }
    ]
  },
  {
    name: 'Double Needle Chain Stitch',
    code: 'CS-2',
    colour: '#0E7290',
    positions: [
      { position: 'NEEDLE', count: 2, consumptionRatio: 1.6 },
      { position: 'UPPER_LOOPER', count: 2, consumptionRatio: 3.5 }
    ]
  },
  {
    name: 'Bartack',
    code: 'BT',
    colour: '#A83070',
    positions: [
      { position: 'NEEDLE', count: 1, consumptionRatio: 2.0 },
      { position: 'BOBBIN', count: 1, consumptionRatio: 1.8 }
    ]
  }
];

export interface SeedThread {
  brand: string;
  /** Ticket is inverse weight — a higher ticket is a finer thread. */
  ticket: number;
  composition: string;
  colour: string;
  coneYieldM: number;
  unitPrice: number;
}

export const THREADS: SeedThread[] = [
  { brand: 'Gramax', ticket: 160, composition: 'Spun polyester', colour: 'White', coneYieldM: 5000, unitPrice: 2.4 },
  { brand: 'Surfilor', ticket: 120, composition: 'Textured polyester', colour: 'White', coneYieldM: 5000, unitPrice: 2.1 },
  { brand: 'Epic', ticket: 120, composition: 'Core spun poly/poly', colour: 'White', coneYieldM: 5000, unitPrice: 3.05 }
];

export interface SeedFabric {
  name: string;
  composition: string;
  gsm: number | null;
  colour: string;
  supplier: string;
}

export const FABRICS: SeedFabric[] = [
  { name: 'Single Jersey 30s', composition: '100% Cotton', gsm: 160, colour: 'White', supplier: 'Teejay Lanka' },
  { name: 'Rib 1×1', composition: '95% Cotton / 5% Elastane', gsm: 220, colour: 'White', supplier: 'Teejay Lanka' },
  { name: 'Twill Tape 12mm', composition: '100% Polyester', gsm: null, colour: 'White', supplier: 'Trischel' }
];

/** Which thread sits at each position of a given machine type. */
export const THREAD_LAYOUTS: Record<string, Partial<Record<PositionName, string>>> = {
  'OL-4': { NEEDLE: 'Gramax', UPPER_LOOPER: 'Surfilor', LOWER_LOOPER: 'Surfilor' },
  'FL-2': { NEEDLE: 'Gramax', UPPER_LOOPER: 'Surfilor' },
  'LS-1': { NEEDLE: 'Epic', BOBBIN: 'Epic' },
  'CS-1': { NEEDLE: 'Gramax', UPPER_LOOPER: 'Gramax' },
  'CS-2': { NEEDLE: 'Gramax', UPPER_LOOPER: 'Gramax' },
  BT: { NEEDLE: 'Epic', BOBBIN: 'Epic' }
};

export interface SeedOperation {
  name: string;
  machineCode: string;
  seamLengthCm: number;
}

export const OPERATION_SEQUENCES: Record<string, SeedOperation[]> = {
  'STY-4471': [
    { name: 'Join the shoulder', machineCode: 'OL-4', seamLengthCm: 42 },
    { name: 'Outlining on shoulder', machineCode: 'FL-2', seamLengthCm: 42 },
    { name: 'Attach sleeve to body panel', machineCode: 'OL-4', seamLengthCm: 96 },
    { name: 'Join side seam', machineCode: 'OL-4', seamLengthCm: 124 },
    { name: 'Join the neckband', machineCode: 'LS-1', seamLengthCm: 6 },
    { name: 'Attach the neck band (4 tags)', machineCode: 'LS-1', seamLengthCm: 8 },
    { name: 'Attach the neck band', machineCode: 'OL-4', seamLengthCm: 58 },
    { name: 'Outlining on neckband', machineCode: 'CS-1', seamLengthCm: 58 },
    { name: 'Attach the neck tape', machineCode: 'CS-2', seamLengthCm: 46 },
    { name: 'Finish the neck tape', machineCode: 'BT', seamLengthCm: 4 },
    { name: 'Hemming on sleeve', machineCode: 'FL-2', seamLengthCm: 44 },
    { name: 'Hemming on body', machineCode: 'FL-2', seamLengthCm: 108 }
  ],
  'STY-4488': [
    { name: 'Join the shoulder', machineCode: 'OL-4', seamLengthCm: 44 },
    { name: 'Attach placket', machineCode: 'LS-1', seamLengthCm: 34 },
    { name: 'Attach sleeve to body panel', machineCode: 'OL-4', seamLengthCm: 98 },
    { name: 'Join side seam', machineCode: 'OL-4', seamLengthCm: 126 },
    { name: 'Attach rib collar', machineCode: 'LS-1', seamLengthCm: 52 }
  ],
  'STY-4502': [
    { name: 'Join the shoulder', machineCode: 'OL-4', seamLengthCm: 46 },
    { name: 'Attach hood panels', machineCode: 'OL-4', seamLengthCm: 88 },
    { name: 'Attach hood to neckline', machineCode: 'OL-4', seamLengthCm: 62 },
    { name: 'Attach kangaroo pocket', machineCode: 'LS-1', seamLengthCm: 74 },
    { name: 'Join side seam', machineCode: 'OL-4', seamLengthCm: 132 },
    { name: 'Attach rib cuff', machineCode: 'FL-2', seamLengthCm: 48 },
    { name: 'Attach rib hem', machineCode: 'FL-2', seamLengthCm: 112 }
  ],
  // STY-4510's empty sequence is deliberate — it is the empty state on the garment screen.
  'STY-4510': []
};

export interface SeedGarment {
  name: string;
  styleNumber: string;
  garmentType: string;
  buyer: string;
  season: string;
  orderQuantity: number;
  sizeRange: string;
  status: GarmentStatus;
  wastagePercent: number;
  description: string;
  fabrics: { name: string; parts: string[] }[];
  /** Only an approved style carries these, and it carries both. */
  approvedByEmail?: string;
  approvedAt?: string;
}

export const GARMENTS: SeedGarment[] = [
  {
    name: "Men's Crew Neck T-Shirt",
    styleNumber: 'STY-4471',
    garmentType: 'Single jersey T-shirt',
    buyer: 'Nordwear',
    season: 'SS 26',
    orderQuantity: 12000,
    sizeRange: 'S – XXL',
    status: 'Approved',
    wastagePercent: 12,
    description: 'Crew neck short sleeve tee, self-fabric neckband with twill neck tape.',
    fabrics: [
      { name: 'Single Jersey 30s', parts: ['Body', 'Sleeve'] },
      { name: 'Rib 1×1', parts: ['Neckband'] },
      { name: 'Twill Tape 12mm', parts: ['Neck tape'] }
    ],
    approvedByEmail: 'r.fernando@factory.lk',
    approvedAt: '2026-08-15T00:00:00.000Z'
  },
  {
    name: "Men's Piqué Polo",
    styleNumber: 'STY-4488',
    garmentType: 'Piqué polo',
    buyer: 'Nordwear',
    season: 'SS 26',
    orderQuantity: 6500,
    sizeRange: 'S – XL',
    status: 'In development',
    wastagePercent: 12,
    description: 'Three button placket polo, rib collar and cuff.',
    fabrics: [
      { name: 'Single Jersey 30s', parts: ['Body', 'Sleeve'] },
      { name: 'Rib 1×1', parts: ['Collar', 'Cuff'] }
    ]
  },
  {
    name: 'Pullover Hoodie',
    styleNumber: 'STY-4502',
    garmentType: 'Brushed fleece hoodie',
    buyer: 'Halden Supply',
    season: 'AW 26',
    orderQuantity: 9200,
    sizeRange: 'XS – XXL',
    status: 'In development',
    wastagePercent: 14,
    description: 'Two panel hood, kangaroo pocket, rib hem.',
    fabrics: [
      { name: 'Single Jersey 30s', parts: ['Body', 'Sleeve', 'Hood'] },
      { name: 'Rib 1×1', parts: ['Hem', 'Cuff'] }
    ]
  },
  {
    name: 'Jersey Shorts',
    styleNumber: 'STY-4510',
    garmentType: 'Single jersey short',
    buyer: 'Halden Supply',
    season: 'SS 27',
    orderQuantity: 4000,
    sizeRange: 'S – XL',
    status: 'Draft',
    wastagePercent: 12,
    description: 'Elastic waist jersey short, side seam pocket.',
    fabrics: [{ name: 'Single Jersey 30s', parts: ['Body'] }]
  }
];

export interface SeedOrder {
  code: string;
  styleNumber: string;
  quantity: number;
  wastagePercent: number;
  status: OrderStatus;
  createdByEmail: string;
  createdAt: string;
  /** Approver or rejecter — the sheet reads one or the other from the same fields. */
  decidedByEmail?: string;
  decidedAt?: string;
  note?: string;
}

export const ORDERS: SeedOrder[] = [
  {
    code: 'TCO-0136',
    styleNumber: 'STY-4471',
    quantity: 3000,
    wastagePercent: 12,
    status: 'Rejected',
    createdByEmail: 'k.aluthge@factory.lk',
    createdAt: '2026-08-04T00:00:00.000Z',
    decidedByEmail: 'r.fernando@factory.lk',
    decidedAt: '2026-08-05T00:00:00.000Z',
    note: 'Ticket 120 substituted on the needle line. Rebuild after the trial.'
  },
  {
    code: 'TCO-0139',
    styleNumber: 'STY-4488',
    quantity: 6500,
    wastagePercent: 12,
    status: 'Ordered',
    createdByEmail: 'k.aluthge@factory.lk',
    createdAt: '2026-08-11T00:00:00.000Z',
    decidedByEmail: 'r.fernando@factory.lk',
    decidedAt: '2026-08-12T00:00:00.000Z',
    note: 'Placed with Coats on 13 Aug 2026.'
  },
  {
    code: 'TCO-0142',
    styleNumber: 'STY-4471',
    quantity: 12000,
    wastagePercent: 12,
    status: 'Approved',
    createdByEmail: 'k.aluthge@factory.lk',
    createdAt: '2026-08-18T00:00:00.000Z',
    decidedByEmail: 'r.fernando@factory.lk',
    decidedAt: '2026-08-20T00:00:00.000Z'
  },
  {
    code: 'TCO-0151',
    styleNumber: 'STY-4502',
    quantity: 9200,
    wastagePercent: 14,
    status: 'Pending approval',
    createdByEmail: 'n.perera@factory.lk',
    createdAt: '2026-08-29T00:00:00.000Z'
  },
  {
    code: 'TCO-0153',
    styleNumber: 'STY-4488',
    quantity: 1500,
    wastagePercent: 12,
    status: 'Draft',
    createdByEmail: 'n.perera@factory.lk',
    createdAt: '2026-09-01T00:00:00.000Z',
    note: 'Sample run for the fit trial.'
  }
];

/** The next code the API allocates after seeding is TCO-0154. */
export const CONE_ORDER_COUNTER_START = 153;
