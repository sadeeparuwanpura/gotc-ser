import { z } from 'zod';
import { objectIdSchema } from './common.schema';

const seamLengthSchema = z.coerce
  .number({ invalid_type_error: 'Seam length must be a number of centimetres.' })
  .min(0, 'Seam length must be a number of centimetres.');

export const createOperationBodySchema = z.object({
  name: z.string().trim().optional(),
  machineTypeId: objectIdSchema.nullable().optional(),
  seamLengthCm: seamLengthSchema.optional(),
  notes: z.string().trim().optional()
});

export const updateOperationBodySchema = z
  .object({
    name: z.string().trim().optional(),
    machineTypeId: objectIdSchema.nullable().optional(),
    seamLengthCm: seamLengthSchema.optional(),
    notes: z.string().trim().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

/** One position at a time, matching the select in the expanded thread panel. */
export const updateOperationThreadBodySchema = z.object({
  positionId: objectIdSchema,
  threadId: objectIdSchema.nullable()
});

export const reorderOperationsBodySchema = z.object({
  orderedIds: z.array(objectIdSchema).min(1, 'Send the full ordered list of operation ids.')
});

export type CreateOperationBody = z.infer<typeof createOperationBodySchema>;
export type UpdateOperationBody = z.infer<typeof updateOperationBodySchema>;
export type UpdateOperationThreadBody = z.infer<typeof updateOperationThreadBodySchema>;
export type ReorderOperationsBody = z.infer<typeof reorderOperationsBodySchema>;
