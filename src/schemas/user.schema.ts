import { z } from 'zod';
import { PERMISSIONS, ROLES } from '../constants/domain';
import { requiredString } from './common.schema';

const NAME_REQUIRED = 'Name is required.';
const EMAIL_INVALID = 'Enter a valid email address.';

export const createUserBodySchema = z.object({
  name: requiredString(NAME_REQUIRED),
  email: requiredString(EMAIL_INVALID).email(EMAIL_INVALID),
  role: z.enum(ROLES),
  password: z.string().min(8, 'A password needs at least 8 characters.').optional()
});

export const updateUserBodySchema = z
  .object({
    name: requiredString(NAME_REQUIRED).optional(),
    email: requiredString(EMAIL_INVALID).email(EMAIL_INVALID).optional(),
    role: z.enum(ROLES).optional(),
    active: z.boolean().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

const permissionFlags = PERMISSIONS.reduce<Record<string, z.ZodOptional<z.ZodBoolean>>>(
  (shape, key) => ({ ...shape, [key]: z.boolean().optional() }),
  {}
);

/** Partial merge — the matrix sends one cell at a time. */
export const updateRolePermissionsBodySchema = z.object({
  permissions: z.object(permissionFlags).refine((value) => Object.keys(value).length > 0, {
    message: 'Send at least one permission to change.'
  })
});

export const roleParamSchema = z.object({ role: z.enum(ROLES) });

export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type UpdateUserBody = z.infer<typeof updateUserBodySchema>;
export type UpdateRolePermissionsBody = z.infer<typeof updateRolePermissionsBodySchema>;
