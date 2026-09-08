/**
 * Every response shape the API returns, in one file.
 *
 * `client/src/api/types.ts` hand-mirrors this file (API.md §Where the contract lives).
 * Update the mirror in the same session you change anything here.
 *
 * Errors are the only enveloped responses:
 *   { "error": { "code", "message", "details"? } }
 * Success bodies are the payloads below, bare.
 */

import type {
  GarmentStatus,
  OrderStatus,
  PermissionMap,
  PositionName,
  Role,
  RoundingMode
} from '../constants/domain';
import type { Calculation } from '../domain/threadCalculation';

// --- paging -----------------------------------------------------------------

/** Every list endpoint answers in this envelope. */
export interface Paginated<T> {
  items: T[];
  /** Matching the filter, before paging. */
  total: number;
  page: number;
  limit: number;
}

// --- auth -------------------------------------------------------------------

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
}

export interface SessionResponse {
  user: UserSummary;
  permissions: PermissionMap;
}

// --- users and permissions --------------------------------------------------

export interface UserListItem extends UserSummary {
  active: boolean;
  /** Cone orders this user created and approved. */
  activity: { created: number; approved: number };
}

export type UserListResponse = Paginated<UserListItem>;

export interface RolePermissionRow {
  role: Role;
  roleLabel: string;
  permissions: PermissionMap;
  /** Shown in the matrix header under each role group. */
  userCount: number;
}

// --- threads ----------------------------------------------------------------

export interface ThreadUsage {
  /** Distinct garments with at least one operation using this thread. */
  styles: number;
  /** Only present when the request carried `?garmentId=`. */
  operationsOnGarment?: number;
}

export interface ThreadDTO {
  id: string;
  brand: string;
  /** Inverse weight — a higher ticket is a finer thread. */
  ticket: number;
  composition: string;
  colour: string;
  coneYieldM: number;
  unitPrice: number;
  active: boolean;
  usage: ThreadUsage;
}

export type ThreadListResponse = Paginated<ThreadDTO>;

// --- machine types ----------------------------------------------------------

export interface MachinePositionDTO {
  id: string;
  position: PositionName;
  count: number;
  consumptionRatio: number;
}

export interface MachineTypeUsage {
  operations: number;
  styles: number;
}

export interface MachineTypeDTO {
  id: string;
  name: string;
  code: string;
  colour: string;
  positions: MachinePositionDTO[];
  /** The summed position counts — "<n> threads" on the card header. */
  totalThreads: number;
  active: boolean;
  /** Operations and distinct styles sitting on this machine type. */
  usage: MachineTypeUsage;
}

export type MachineTypeListResponse = Paginated<MachineTypeDTO>;

// --- fabrics ----------------------------------------------------------------

export interface FabricDTO {
  id: string;
  name: string;
  composition: string;
  gsm: number | null;
  colour: string;
  supplier: string;
  usedOn: string[];
}

export type FabricListResponse = Paginated<FabricDTO>;

// --- garments ---------------------------------------------------------------

export interface MachineTypeToken {
  id: string;
  name: string;
  code: string;
  colour: string;
}

export interface GarmentListItem {
  id: string;
  name: string;
  styleNumber: string;
  garmentType: string;
  buyer: string;
  season: string;
  orderQuantity: number;
  status: GarmentStatus;
  /** Null unless the style is approved. */
  approvedByName: string | null;
  operationCount: number;
  machineTypesUsed: MachineTypeToken[];
  /** PER_THREAD preview; null when nothing is assignable. */
  totalCones: number | null;
  orderCount: number;
}

export interface GarmentListResponse extends Paginated<GarmentListItem> {
  /** Operations across the whole filter — the header reads "<n> styles · <n> operations". */
  operationTotal: number;
}

export interface GarmentFabricDTO {
  id: string;
  fabricId: string;
  name: string;
  composition: string;
  gsm: number | null;
  colour: string;
  supplier: string;
  parts: string[];
}

export interface GarmentDTO {
  id: string;
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
  fabrics: GarmentFabricDTO[];
  /** The three approval fields are null together — reopening a style clears them. */
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NextStyleNumberResponse {
  styleNumber: string;
}

export type CalculationDTO = Calculation;

// --- operations -------------------------------------------------------------

export interface OperationPositionDTO extends MachinePositionDTO {
  threadId: string | null;
  /** Metres this position consumes per garment, at the current seam length. */
  metresPerGarment: number;
}

export interface OperationDTO {
  id: string;
  garmentId: string;
  sequence: number;
  name: string;
  machineTypeId: string | null;
  machineTypeName: string | null;
  machineTypeCode: string | null;
  machineTypeColour: string | null;
  seamLengthCm: number;
  notes: string;
  isComplete: boolean;
  operationMetres: number;
  threadSummary: string;
  /**
   * The printed THREAD VARIETY cells — `LOOPER - 2 - 120 SURFILOR` — one per position slot.
   * An unassigned position reads "—", so a sheet using these still prints when incomplete.
   */
  threadCells: string[];
  /** The machine type's positions inlined, so the expanded panel needs no extra call. */
  positions: OperationPositionDTO[];
}

// --- cone orders ------------------------------------------------------------

export interface OrderLineDTO {
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
  /** Cones that must stand on the line at once — one per position slot. */
  threadingCones: number;
  cones: number;
}

export interface OrderRowDTO {
  sequence: number;
  name: string;
  machineName: string;
  cells: string[];
}

export interface OrderListItem {
  id: string;
  code: string;
  garmentId: string;
  styleNumber: string;
  garmentName: string;
  buyer: string;
  quantity: number;
  wastagePercent: number;
  roundingMode: RoundingMode;
  status: OrderStatus;
  totalMetres: number;
  totalCones: number;
  createdByName: string;
  createdAt: string;
  approvedByName: string | null;
  approvedAt: string | null;
  note: string;
}

export interface OrderDTO extends OrderListItem {
  lines: OrderLineDTO[];
  rows: OrderRowDTO[];
  /** The widest row — how many THREAD VARIETY columns the sheet prints. */
  maxCells: number;
}

export type OrderStatusCounts = Record<'All' | OrderStatus, number>;

export interface OrderListResponse {
  items: OrderListItem[];
  total: number;
  page: number;
  limit: number;
  /** Feeds the filter chips. */
  counts: OrderStatusCounts;
  /** Feeds the printed register header. */
  totals: { cones: number; orders: number };
}

// --- health -----------------------------------------------------------------

export interface HealthResponse {
  ok: boolean;
  db: 'connected' | 'connecting' | 'disconnected';
}
