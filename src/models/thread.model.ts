import { Schema, model, type HydratedDocument } from 'mongoose';
import { TICKET_MAX, TICKET_MIN } from '../constants/domain';

export interface ThreadAttrs {
  brand: string;
  /** Ticket is inverse weight — a higher ticket is a finer thread. Do not "correct" this. */
  ticket: number;
  composition: string;
  colour: string;
  coneYieldM: number;
  unitPrice: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ThreadDocument = HydratedDocument<ThreadAttrs>;

const ThreadSchema = new Schema<ThreadAttrs>(
  {
    brand: { type: String, required: true, trim: true },
    // Ticket is inverse weight — a higher ticket is a finer thread.
    ticket: {
      type: Number,
      required: true,
      min: [TICKET_MIN, `Ticket must be between ${TICKET_MIN} and ${TICKET_MAX}. Higher ticket means finer thread.`],
      max: [TICKET_MAX, `Ticket must be between ${TICKET_MIN} and ${TICKET_MAX}. Higher ticket means finer thread.`]
    },
    composition: { type: String, required: true, trim: true },
    colour: { type: String, required: true, trim: true, default: 'White' },
    coneYieldM: { type: Number, required: true, min: [1, 'Cone yield must be a positive number of metres.'] },
    unitPrice: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

/** One library entry per brand / ticket / colour. */
ThreadSchema.index({ brand: 1, ticket: 1, colour: 1 }, { unique: true });

export const ThreadModel = model<ThreadAttrs>('Thread', ThreadSchema);
