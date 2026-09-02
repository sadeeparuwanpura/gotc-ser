import jwt from 'jsonwebtoken';
import { env, SESSION_MAX_AGE_MS } from '../config/env';
import { ROLES, type Role } from '../constants/domain';
import { HttpError } from '../utils/http-error';

export interface SessionClaims {
  sub: string;
  role: Role;
}

const EXPIRES_IN_SECONDS = Math.floor(SESSION_MAX_AGE_MS / 1000);

export function signSessionToken(claims: SessionClaims): string {
  return jwt.sign({ role: claims.role }, env.JWT_SECRET, {
    subject: claims.sub,
    expiresIn: EXPIRES_IN_SECONDS
  });
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Never throws a raw jwt error at the client — a bad or stale cookie is simply a 401. */
export function verifySessionToken(token: string): SessionClaims {
  let payload: unknown;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw HttpError.unauthenticated('Your session has expired. Sign in again.');
  }

  if (typeof payload !== 'object' || payload === null) {
    throw HttpError.unauthenticated();
  }

  const { sub, role } = payload as { sub?: unknown; role?: unknown };
  if (typeof sub !== 'string' || !isRole(role)) {
    throw HttpError.unauthenticated();
  }

  return { sub, role };
}
