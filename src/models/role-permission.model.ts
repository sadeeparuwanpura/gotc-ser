import { Schema, model, type HydratedDocument } from 'mongoose';
import { ALL_PERMISSIONS_GRANTED, ROLES, type PermissionMap, type Role } from '../constants/domain';
import { HttpError } from '../utils/http-error';

export interface RolePermissionAttrs {
  role: Role;
  permissions: PermissionMap;
  createdAt: Date;
  updatedAt: Date;
}

export type RolePermissionDocument = HydratedDocument<RolePermissionAttrs>;

const RolePermissionSchema = new Schema<RolePermissionAttrs>(
  {
    role: { type: String, required: true, unique: true, enum: ROLES },
    permissions: {
      info: { type: Boolean, default: false },
      fabrics: { type: Boolean, default: false },
      operations: { type: Boolean, default: false },
      master: { type: Boolean, default: false },
      orders: { type: Boolean, default: false },
      approve: { type: Boolean, default: false },
      users: { type: Boolean, default: false }
    }
  },
  { timestamps: true }
);

/** The ADMIN row is fixed so the system cannot be locked out. */
RolePermissionSchema.pre('save', function guardAdminRow(next) {
  if (this.role !== 'ADMIN') {
    next();
    return;
  }
  if (this.isNew) {
    this.permissions = { ...ALL_PERMISSIONS_GRANTED };
    next();
    return;
  }
  if (this.isModified('permissions')) {
    next(HttpError.adminPermissionsFixed());
    return;
  }
  next();
});

export const RolePermissionModel = model<RolePermissionAttrs>('RolePermission', RolePermissionSchema);
