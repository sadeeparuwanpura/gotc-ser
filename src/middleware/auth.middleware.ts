import type { Request, RequestHandler } from 'express';
import { HttpError } from '../utils/http-error';
import { verifySessionToken } from '../services/token.service';
import { getPermissions } from '../services/role-permission.service';
import { UserModel } from '../models/user.model';
import { env } from '../config/env';
import type { Permission } from '../constants/domain';
import type { AuthContext } from '../types/express';
import { asyncHandler } from '../utils/async-handler';

/** Reads the signed-in context a guard has already established. */
export function authContext(req: Request): AuthContext {
  if (!req.auth) {
    throw HttpError.unauthenticated();
  }
  return req.auth;
}

/**
 * Verifies the httpOnly cookie, reloads the account (so a deactivated or deleted user
 * loses access immediately) and attaches the cached permission map for its role.
 */
export const requireAuth: RequestHandler = asyncHandler(async (req, _res, next) => {
  const cookies: unknown = req.cookies;
  const raw =
    typeof cookies === 'object' && cookies !== null
      ? (cookies as Record<string, unknown>)[env.COOKIE_NAME]
      : undefined;

  if (typeof raw !== 'string' || raw.length === 0) {
    throw HttpError.unauthenticated();
  }

  const claims = verifySessionToken(raw);
  const user = await UserModel.findById(claims.sub);
  if (!user || !user.active) {
    throw HttpError.unauthenticated();
  }

  req.auth = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions: await getPermissions(user.role)
  };
  next();
});

/**
 * Permissions gate **writes only** — every authenticated user may read every endpoint
 * (README.md §Roles and permissions).
 */
export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    const auth = authContext(req);
    if (!auth.permissions[permission]) {
      next(
        HttpError.forbidden('Your role cannot edit this.', {
          permission,
          role: auth.role
        })
      );
      return;
    }
    next();
  };
}

/** Passes when the caller holds any one of the listed permissions. */
export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    const auth = authContext(req);
    if (permissions.some((permission) => auth.permissions[permission])) {
      next();
      return;
    }
    next(
      HttpError.forbidden('Your role cannot edit this.', {
        permission: permissions.join('|'),
        role: auth.role
      })
    );
  };
}
