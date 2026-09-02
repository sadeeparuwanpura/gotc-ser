import {
  ALL_PERMISSIONS_GRANTED,
  DEFAULT_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  ROLE_LABELS,
  type PermissionMap,
  type Role
} from '../constants/domain';
import { RolePermissionModel } from '../models/role-permission.model';
import { UserModel } from '../models/user.model';
import type { RolePermissionRow } from '../dto/api-types';
import { HttpError } from '../utils/http-error';
import type { UpdateRolePermissionsBody } from '../schemas/user.schema';

/**
 * The role matrix is read on every guarded request, so it is cached in memory and
 * invalidated on write — no database round trip per permission check.
 */
let cache: Map<Role, PermissionMap> | null = null;

function normalise(permissions: Partial<PermissionMap> | undefined): PermissionMap {
  return PERMISSIONS.reduce<PermissionMap>(
    (map, key) => ({ ...map, [key]: Boolean(permissions?.[key]) }),
    {} as PermissionMap
  );
}

/** Loads all four rows, creating any that are missing from the documented defaults. */
export async function loadMatrix(): Promise<Map<Role, PermissionMap>> {
  const rows = await RolePermissionModel.find();
  const byRole = new Map(rows.map((row) => [row.role, row]));
  const next = new Map<Role, PermissionMap>();

  for (const role of ROLES) {
    const existing = byRole.get(role);
    if (existing) {
      next.set(role, role === 'ADMIN' ? { ...ALL_PERMISSIONS_GRANTED } : normalise(existing.permissions));
      continue;
    }
    const created = await RolePermissionModel.create({
      role,
      permissions: { ...DEFAULT_PERMISSIONS[role] }
    });
    next.set(role, normalise(created.permissions));
  }

  cache = next;
  return next;
}

export function invalidateMatrix(): void {
  cache = null;
}

export async function getMatrix(): Promise<Map<Role, PermissionMap>> {
  return cache ?? (await loadMatrix());
}

export async function getPermissions(role: Role): Promise<PermissionMap> {
  const matrix = await getMatrix();
  return matrix.get(role) ?? normalise(DEFAULT_PERMISSIONS[role]);
}

export async function listRolePermissions(): Promise<RolePermissionRow[]> {
  const matrix = await getMatrix();
  const counts = await UserModel.aggregate<{ _id: Role; count: number }>([
    { $match: { active: true } },
    { $group: { _id: '$role', count: { $sum: 1 } } }
  ]);
  const countByRole = new Map(counts.map((entry) => [entry._id, entry.count]));

  return ROLES.map((role) => ({
    role,
    roleLabel: ROLE_LABELS[role],
    permissions: matrix.get(role) ?? normalise(DEFAULT_PERMISSIONS[role]),
    userCount: countByRole.get(role) ?? 0
  }));
}

/** Partial merge. The ADMIN row is fixed so the system cannot be locked out. */
export async function updateRolePermissions(
  role: Role,
  body: UpdateRolePermissionsBody
): Promise<RolePermissionRow> {
  if (role === 'ADMIN') {
    throw HttpError.adminPermissionsFixed();
  }

  const row = await RolePermissionModel.findOne({ role });
  if (!row) {
    throw HttpError.notFound('That role group does not exist.');
  }

  row.permissions = normalise({ ...normalise(row.permissions), ...body.permissions });
  await row.save();
  invalidateMatrix();

  const userCount = await UserModel.countDocuments({ role, active: true });
  return {
    role,
    roleLabel: ROLE_LABELS[role],
    permissions: normalise(row.permissions),
    userCount
  };
}
