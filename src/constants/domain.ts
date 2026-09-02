/**
 * The factory's vocabulary, in one place. Every enum the schemas, guards and domain
 * module share lives here so there is exactly one spelling of each term.
 */

export const ROLES = ['ADMIN', 'FABRIC_TECH', 'GARMENT_TECH', 'PROJECT_MANAGER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  ADMIN: 'Admin',
  FABRIC_TECH: 'Fabric technician',
  GARMENT_TECH: 'Garment technician',
  PROJECT_MANAGER: 'Project manager'
};

export const PERMISSIONS = [
  'info',
  'fabrics',
  'operations',
  'master',
  'orders',
  'approve',
  'users'
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export type PermissionMap = Record<Permission, boolean>;

/** Defaults from README.md §Roles and permissions. An admin may change any cell except ADMIN's. */
export const DEFAULT_PERMISSIONS: Readonly<Record<Role, PermissionMap>> = {
  ADMIN: { info: true, fabrics: true, operations: true, master: true, orders: true, approve: true, users: true },
  FABRIC_TECH: { info: false, fabrics: true, operations: false, master: false, orders: false, approve: false, users: false },
  GARMENT_TECH: { info: false, fabrics: false, operations: true, master: false, orders: false, approve: false, users: false },
  PROJECT_MANAGER: { info: false, fabrics: false, operations: false, master: false, orders: true, approve: true, users: false }
};

export const ALL_PERMISSIONS_GRANTED: PermissionMap = {
  info: true,
  fabrics: true,
  operations: true,
  master: true,
  orders: true,
  approve: true,
  users: true
};

export const POSITIONS = ['NEEDLE', 'UPPER_LOOPER', 'LOWER_LOOPER', 'BOBBIN', 'SPREADER'] as const;
export type PositionName = (typeof POSITIONS)[number];

/**
 * Print/summary sort order: loopers first — that is how the factory's existing sheets read.
 * (CALCULATIONS.md §Thread summary strings, rule 1.)
 */
export const POSITION_SORT_ORDER: Readonly<Record<PositionName, number>> = {
  UPPER_LOOPER: 0,
  LOWER_LOOPER: 1,
  BOBBIN: 2,
  SPREADER: 3,
  NEEDLE: 4
};

export const POSITION_LABELS: Readonly<Record<PositionName, string>> = {
  NEEDLE: 'NEEDLE',
  UPPER_LOOPER: 'UPPER LOOPER',
  LOWER_LOOPER: 'LOWER LOOPER',
  BOBBIN: 'BOBBIN',
  SPREADER: 'SPREADER'
};

export const GARMENT_STATUSES = ['Draft', 'In development', 'Approved'] as const;
export type GarmentStatus = (typeof GARMENT_STATUSES)[number];

export const ORDER_STATUSES = ['Draft', 'Pending approval', 'Approved', 'Ordered', 'Rejected'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ROUNDING_MODES = ['PER_THREAD', 'PER_THREAD_PLUS_SAFETY', 'ORDER_TOTAL'] as const;
export type RoundingMode = (typeof ROUNDING_MODES)[number];

/** Allowed status moves. Anything else is 409 INVALID_TRANSITION. */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  Draft: ['Pending approval', 'Approved', 'Rejected'],
  'Pending approval': ['Approved', 'Rejected'],
  Approved: ['Ordered'],
  Ordered: [],
  Rejected: []
};

export const CONE_ORDER_COUNTER_ID = 'coneOrder';
export const CONE_ORDER_CODE_PREFIX = 'TCO-';

/** Ticket is inverse weight — a higher ticket is a finer thread. */
export const TICKET_MIN = 8;
export const TICKET_MAX = 400;
