import { Schema, Types, model, type HydratedDocument } from 'mongoose';
import { ORDER_STATUSES, ROUNDING_MODES, type OrderStatus, type RoundingMode } from '../constants/domain';

/** One printed row of the cone-order sheet, frozen at creation so the paper never changes. */
export interface OrderRowAttrs {
  sequence: number;
  name: string;
  machineName: string;
  cells: string[];
}

export interface OrderLineAttrs {
  thread: Types.ObjectId;
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

export interface ConeOrderAttrs {
  code: string;
  garment: Types.ObjectId;
  styleNumber: string;
  garmentName: string;
  buyer: string;
  quantity: number;
  wastagePercent: number;
  roundingMode: RoundingMode;
  status: OrderStatus;
  lines: OrderLineAttrs[];
  rows: OrderRowAttrs[];
  totalMetres: number;
  totalCones: number;
  createdBy: Types.ObjectId;
  createdByName: string;
  approvedBy: Types.ObjectId | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ConeOrderDocument = HydratedDocument<ConeOrderAttrs>;

const OrderLineSchema = new Schema<OrderLineAttrs>(
  {
    thread: { type: Schema.Types.ObjectId, ref: 'Thread', required: true },
    brand: { type: String, required: true },
    ticket: { type: Number, required: true },
    composition: { type: String, required: true },
    colour: { type: String, required: true },
    coneYieldM: { type: Number, required: true },
    metresPerGarment: { type: Number, required: true },
    metresOrder: { type: Number, required: true },
    metresWithWastage: { type: Number, required: true },
    rawCones: { type: Number, required: true },
    // Older orders predate the threading floor, so this is not required on read.
    threadingCones: { type: Number, default: 0 },
    cones: { type: Number, required: true }
  },
  { _id: false }
);

const OrderRowSchema = new Schema<OrderRowAttrs>(
  {
    sequence: { type: Number, required: true },
    name: { type: String, default: '' },
    machineName: { type: String, default: '' },
    cells: { type: [String], default: [] }
  },
  { _id: false }
);

const ConeOrderSchema = new Schema<ConeOrderAttrs>(
  {
    code: { type: String, required: true, unique: true },
    garment: { type: Schema.Types.ObjectId, ref: 'Garment', required: true, index: true },
    // Frozen garment identity, so the sheet reprints identically.
    styleNumber: { type: String, required: true },
    garmentName: { type: String, required: true },
    buyer: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    wastagePercent: { type: Number, required: true, min: 0, max: 40 },
    roundingMode: { type: String, enum: ROUNDING_MODES, default: 'PER_THREAD' },
    status: { type: String, enum: ORDER_STATUSES, default: 'Pending approval', index: true },
    lines: { type: [OrderLineSchema], required: true },
    rows: { type: [OrderRowSchema], required: true },
    totalMetres: { type: Number, required: true },
    totalCones: { type: Number, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true },
    // Also holds the rejector — the sheet reads "Rejected by <name> · <date>".
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedByName: { type: String, default: null },
    approvedAt: { type: Date, default: null },
    note: { type: String, default: '' }
  },
  { timestamps: true }
);

ConeOrderSchema.index({ status: 1, createdAt: -1 });

export const ConeOrderModel = model<ConeOrderAttrs>('ConeOrder', ConeOrderSchema);
