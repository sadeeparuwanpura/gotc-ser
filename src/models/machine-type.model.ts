import { Schema, Types, model, type HydratedDocument } from 'mongoose';
import { POSITIONS, type PositionName } from '../constants/domain';

export interface MachinePositionAttrs {
  _id: Types.ObjectId;
  position: PositionName;
  /** How many of that position the machine has. */
  count: number;
  /** Metres of thread consumed per metre of seam. */
  consumptionRatio: number;
}

export interface MachineTypeAttrs {
  name: string;
  code: string;
  colour: string;
  positions: Types.DocumentArray<MachinePositionAttrs>;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type MachineTypeDocument = HydratedDocument<MachineTypeAttrs>;

const PositionSchema = new Schema<MachinePositionAttrs>(
  {
    position: { type: String, required: true, enum: POSITIONS },
    count: { type: Number, required: true, min: 1, max: 12 },
    consumptionRatio: { type: Number, required: true, min: 0.1, max: 40 }
  },
  { _id: true }
);

const MachineTypeSchema = new Schema<MachineTypeAttrs>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    colour: { type: String, required: true, match: /^#[0-9A-Fa-f]{6}$/ },
    positions: {
      type: [PositionSchema],
      validate: [
        {
          validator: (positions: MachinePositionAttrs[]): boolean => positions.length > 0,
          message: 'A machine type needs at least one thread position.'
        },
        {
          // Invariant: a machine type cannot have two entries for the same position value.
          validator: (positions: MachinePositionAttrs[]): boolean =>
            new Set(positions.map((entry) => entry.position)).size === positions.length,
          message: 'Each thread position can only be listed once on a machine type.'
        }
      ]
    },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const MachineTypeModel = model<MachineTypeAttrs>('MachineType', MachineTypeSchema);
