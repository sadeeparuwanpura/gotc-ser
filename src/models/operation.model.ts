import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export interface OperationAttrs {
  garment: Types.ObjectId;
  sequence: number;
  name: string;
  machineType: Types.ObjectId | null;
  seamLengthCm: number;
  /** Keyed by the machine type's embedded position `_id`. Cleared when the machine changes. */
  threads: Map<string, Types.ObjectId>;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

export type OperationDocument = HydratedDocument<OperationAttrs>;

const OperationSchema = new Schema<OperationAttrs>(
  {
    garment: { type: Schema.Types.ObjectId, ref: 'Garment', required: true, index: true },
    sequence: { type: Number, required: true, min: 1 },
    name: { type: String, trim: true, default: '' },
    machineType: { type: Schema.Types.ObjectId, ref: 'MachineType', default: null },
    seamLengthCm: { type: Number, default: 0, min: 0 },
    threads: {
      type: Map,
      of: { type: Schema.Types.ObjectId, ref: 'Thread' },
      default: (): Map<string, Types.ObjectId> => new Map()
    },
    notes: { type: String, trim: true, default: '' }
  },
  { timestamps: true }
);

/** Sequences are contiguous 1..n per garment; reordering rewrites the whole set at once. */
OperationSchema.index({ garment: 1, sequence: 1 }, { unique: true });

export const OperationModel = model<OperationAttrs>('Operation', OperationSchema);
