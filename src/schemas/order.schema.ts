import { z } from 'zod';
import { ORDER_STATUSES, ROUNDING_MODES } from '../constants/domain';
import { objectIdSchema } from './common.schema';

export const createOrderBodySchema = z.object({
  garmentId: objectIdSchema,
  // Defaults come from the garment when these are absent.
  quantity: z.coerce.number().int().min(1, 'Order quantity must be a positive number of pieces.').optional(),
  wastagePercent: z.coerce
    .number()
    .min(0, 'Wastage must be between 0 and 40 per cent.')
    .max(40, 'Wastage must be between 0 and 40 per cent.')
    .optional(),
  roundingMode: z.enum(ROUNDING_MODES).optional(),
  note: z.string().trim().optional()
});

export const orderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const transitionBodySchema = z
  .object({ note: z.string().trim().max(500).optional() })
  .optional()
  .default({});

export type CreateOrderBody = z.infer<typeof createOrderBodySchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
export type TransitionBody = z.infer<typeof transitionBodySchema>;
