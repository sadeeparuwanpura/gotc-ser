import { idParamSchema, listQuerySchema } from '../schemas/common.schema';
import {
  createUserBodySchema,
  roleParamSchema,
  updateRolePermissionsBodySchema,
  updateUserBodySchema
} from '../schemas/user.schema';
import { createUser, deleteUser, listUsers, updateUser } from '../services/user.service';
import { listRolePermissions, updateRolePermissions } from '../services/role-permission.service';
import { asyncHandler } from '../utils/async-handler';

export const getUsers = asyncHandler(async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  res.status(200).json(await listUsers(query));
});

export const postUser = asyncHandler(async (req, res) => {
  const body = createUserBodySchema.parse(req.body);
  res.status(201).json(await createUser(body));
});

export const patchUser = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = updateUserBodySchema.parse(req.body);
  res.status(200).json(await updateUser(id, body));
});

export const removeUser = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await deleteUser(id);
  res.status(204).send();
});

export const getRolePermissions = asyncHandler(async (_req, res) => {
  res.status(200).json(await listRolePermissions());
});

export const patchRolePermissions = asyncHandler(async (req, res) => {
  const { role } = roleParamSchema.parse(req.params);
  const body = updateRolePermissionsBodySchema.parse(req.body);
  res.status(200).json(await updateRolePermissions(role, body));
});
