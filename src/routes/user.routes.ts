import { Router } from 'express';
import {
  getRolePermissions,
  getUsers,
  patchRolePermissions,
  patchUser,
  postUser,
  removeUser
} from '../controllers/user.controller';
import { requirePermission } from '../middleware/auth.middleware';

/** Guards gate writes only — reads are open to any authenticated user. */
export const userRouter = Router();

userRouter.get('/', getUsers);
userRouter.post('/', requirePermission('users'), postUser);
userRouter.patch('/:id', requirePermission('users'), patchUser);
userRouter.delete('/:id', requirePermission('users'), removeUser);

export const rolePermissionRouter = Router();

rolePermissionRouter.get('/', getRolePermissions);
rolePermissionRouter.patch('/:role', requirePermission('users'), patchRolePermissions);
