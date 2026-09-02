import bcrypt from 'bcrypt';
import { ROLE_LABELS } from '../constants/domain';
import { UserModel, type UserDocument } from '../models/user.model';
import type { SessionResponse, UserSummary } from '../dto/api-types';
import { HttpError } from '../utils/http-error';
import { getPermissions } from './role-permission.service';
import { signSessionToken } from './token.service';
import type { LoginBody } from '../schemas/auth.schema';

export const BCRYPT_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function toUserSummary(user: UserDocument): UserSummary {
  return {
    id: user._id.toHexString(),
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role]
  };
}

export async function toSession(user: UserDocument): Promise<SessionResponse> {
  return {
    user: toUserSummary(user),
    permissions: await getPermissions(user.role)
  };
}

export interface LoginResult {
  session: SessionResponse;
  token: string;
}

export async function login(body: LoginBody): Promise<LoginResult> {
  const user = await UserModel.findOne({ email: body.email.toLowerCase() }).select('+passwordHash');

  // Same message either way — never reveal which half was wrong.
  if (!user || !user.active) {
    throw HttpError.unauthenticated('Email or password is incorrect.');
  }

  const matches = await bcrypt.compare(body.password, user.passwordHash);
  if (!matches) {
    throw HttpError.unauthenticated('Email or password is incorrect.');
  }

  user.lastLoginAt = new Date();
  await user.save();

  return {
    session: await toSession(user),
    token: signSessionToken({ sub: user._id.toHexString(), role: user.role })
  };
}

export async function currentSession(userId: string): Promise<SessionResponse> {
  const user = await UserModel.findById(userId);
  if (!user || !user.active) {
    throw HttpError.unauthenticated();
  }
  return toSession(user);
}
