import { Schema, model, type HydratedDocument } from 'mongoose';
import { ROLES, type Role } from '../constants/domain';
import { HttpError } from '../utils/http-error';

export interface UserAttrs {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserAttrs>;

const UserSchema = new Schema<UserAttrs>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    // bcrypt cost 12; never leaves the server.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, required: true, enum: ROLES },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null }
  },
  { timestamps: true }
);

/**
 * Backstop for the "at least one active admin" invariant. The user service checks it
 * first so the message can name the account; this hook stops any other code path.
 */
UserSchema.pre('deleteOne', { document: true, query: false }, async function guardLastAdmin() {
  if (this.role !== 'ADMIN' || !this.active) return;
  const others = await UserModel.countDocuments({ role: 'ADMIN', active: true, _id: { $ne: this._id } });
  if (others === 0) {
    throw HttpError.lastAdmin(this.name);
  }
});

export const UserModel = model<UserAttrs>('User', UserSchema);
