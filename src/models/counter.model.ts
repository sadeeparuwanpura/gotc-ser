import { Schema, model, type ClientSession } from 'mongoose';
import { CONE_ORDER_CODE_PREFIX, CONE_ORDER_COUNTER_ID } from '../constants/domain';
import { sessionOption } from '../utils/transaction';

export interface CounterAttrs {
  _id: string;
  seq: number;
}

const CounterSchema = new Schema<CounterAttrs>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 }
  },
  { versionKey: false }
);

export const CounterModel = model<CounterAttrs>('Counter', CounterSchema);

/** `TCO-0142`. Derived from an atomic counter, never from `count()`. */
export async function nextConeOrderCode(session?: ClientSession): Promise<string> {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: CONE_ORDER_COUNTER_ID },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', ...sessionOption(session) }
  );
  const seq = counter?.seq ?? 1;
  return `${CONE_ORDER_CODE_PREFIX}${String(seq).padStart(4, '0')}`;
}

export async function setConeOrderCounter(seq: number): Promise<void> {
  await CounterModel.findOneAndUpdate({ _id: CONE_ORDER_COUNTER_ID }, { $set: { seq } }, { upsert: true });
}
