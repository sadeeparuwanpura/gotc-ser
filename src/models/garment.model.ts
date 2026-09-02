import { Schema, Types, model, type HydratedDocument } from 'mongoose';
import { GARMENT_STATUSES, type GarmentStatus } from '../constants/domain';

export interface GarmentFabricAttrs {
  _id: Types.ObjectId;
  fabric: Types.ObjectId;
  parts: string[];
}

export interface GarmentAttrs {
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
  fabrics: Types.DocumentArray<GarmentFabricAttrs>;
  createdBy: Types.ObjectId | null;
  approvedBy: Types.ObjectId | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type GarmentDocument = HydratedDocument<GarmentAttrs>;

const GarmentFabricSchema = new Schema<GarmentFabricAttrs>(
  {
    fabric: { type: Schema.Types.ObjectId, ref: 'Fabric', required: true },
    parts: {
      type: [String],
      required: true,
      validate: {
        validator: (parts: string[]): boolean => parts.length > 0,
        message: 'Each fabric needs at least one part.'
      }
    }
  },
  { _id: true }
);

const GarmentSchema = new Schema<GarmentAttrs>(
  {
    name: { type: String, required: true, trim: true },
    styleNumber: { type: String, required: true, trim: true, uppercase: true },
    garmentType: { type: String, trim: true, default: 'Unspecified' },
    buyer: {
      type: String,
      required: [true, 'Buyer is required — the order and both sheets are addressed to them.'],
      trim: true
    },
    season: { type: String, trim: true, default: '—' },
    orderQuantity: {
      type: Number,
      required: true,
      min: [1, 'Order quantity must be a positive number of pieces.']
    },
    sizeRange: { type: String, trim: true, default: '—' },
    status: { type: String, enum: GARMENT_STATUSES, default: 'Draft' },
    wastagePercent: {
      type: Number,
      required: true,
      min: [0, 'Wastage must be between 0 and 40 per cent.'],
      max: [40, 'Wastage must be between 0 and 40 per cent.'],
      default: 12
    },
    description: { type: String, trim: true, default: '' },
    fabrics: {
      type: [GarmentFabricSchema],
      default: [],
      validate: {
        // Invariant: no duplicate fabric across the array.
        validator: (entries: GarmentFabricAttrs[]): boolean =>
          new Set(entries.map((entry) => String(entry.fabric))).size === entries.length,
        message: 'A fabric can only be assigned once per garment.'
      }
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // Written when the style is approved, cleared when it is reopened.
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedByName: { type: String, default: null },
    approvedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

/** Unique style number, case-insensitively — one index, declared explicitly. */
GarmentSchema.index({ styleNumber: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const GarmentModel = model<GarmentAttrs>('Garment', GarmentSchema);
