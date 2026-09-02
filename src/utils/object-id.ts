import { Types } from 'mongoose';
import { HttpError } from './http-error';

/** 24-character hex strings are the only ids the API accepts (API.md §Conventions). */
export function isObjectId(value: unknown): value is string {
  return typeof value === 'string' && Types.ObjectId.isValid(value) && /^[0-9a-fA-F]{24}$/.test(value);
}

export function toObjectId(value: string, what = 'record'): Types.ObjectId {
  if (!isObjectId(value)) {
    throw HttpError.notFound(`That ${what} does not exist.`);
  }
  return new Types.ObjectId(value);
}

export function idToString(value: Types.ObjectId | string): string {
  return typeof value === 'string' ? value : value.toHexString();
}
