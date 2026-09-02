import { Schema, model, type HydratedDocument } from 'mongoose';

export interface FabricAttrs {
  name: string;
  composition: string;
  /** null for tapes and trims. */
  gsm: number | null;
  colour: string;
  supplier: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FabricDocument = HydratedDocument<FabricAttrs>;

const FabricSchema = new Schema<FabricAttrs>(
  {
    name: { type: String, required: true, trim: true },
    composition: {
      type: String,
      required: [true, 'Composition is required — it drives needle and thread choice.'],
      trim: true
    },
    gsm: { type: Number, default: null, min: 1 },
    colour: { type: String, required: true, trim: true, default: 'White' },
    supplier: { type: String, trim: true, default: '—' }
  },
  { timestamps: true }
);

/**
 * Unique on name, case-insensitively. Declared here rather than as `unique: true` on the
 * field so there is one index, not two.
 */
FabricSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const FabricModel = model<FabricAttrs>('Fabric', FabricSchema);
