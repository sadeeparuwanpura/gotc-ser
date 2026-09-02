import { z } from 'zod';
import { GARMENT_STATUSES, ROUNDING_MODES } from '../constants/domain';
import { objectIdSchema, requiredNumber, requiredString } from './common.schema';

const NAME_REQUIRED = 'Garment name is required.';
const STYLE_REQUIRED = 'Style number is required.';
const BUYER_REQUIRED = 'Buyer is required — the order and both sheets are addressed to them.';
const QUANTITY_INVALID = 'Order quantity must be a positive number of pieces.';
const WASTAGE_INVALID = 'Wastage must be between 0 and 40 per cent.';
const FABRICS_REQUIRED = 'Assign at least one fabric.';
const STATUS_INVALID = 'Status must be Draft, In development or Approved.';

const garmentFabricSchema = z.object({
  fabricId: objectIdSchema,
  // Emptiness is checked in the service, where the fabric's name is known:
  // "<Fabric> has no garment part assigned."
  parts: z.array(z.string().trim().min(1)).default([])
});

const wastageSchema = requiredNumber(WASTAGE_INVALID)
  .min(0, WASTAGE_INVALID)
  .max(40, WASTAGE_INVALID);

const quantitySchema = requiredNumber(QUANTITY_INVALID)
  .int(QUANTITY_INVALID)
  .min(1, QUANTITY_INVALID);

const fabricsSchema = z
  .array(garmentFabricSchema, {
    required_error: FABRICS_REQUIRED,
    invalid_type_error: FABRICS_REQUIRED
  })
  .min(1, FABRICS_REQUIRED);

/**
 * Key order matters: zod reports issues in declaration order, and the client shows one
 * message at a time in the order documented in README.md §New garment.
 */
export const createGarmentBodySchema = z.object({
  name: requiredString(NAME_REQUIRED),
  styleNumber: requiredString(STYLE_REQUIRED).toUpperCase(),
  buyer: requiredString(BUYER_REQUIRED),
  orderQuantity: quantitySchema,
  wastagePercent: wastageSchema.default(12),
  fabrics: fabricsSchema,
  garmentType: z.string().trim().min(1).optional(),
  season: z.string().trim().min(1).optional(),
  sizeRange: z.string().trim().min(1).optional(),
  status: z.enum(GARMENT_STATUSES).optional(),
  description: z.string().trim().optional(),
  copyOperationsFrom: objectIdSchema.optional()
});

/**
 * Status is deliberately absent: a style moves through
 * `POST /garments/:id/approve` and `POST /garments/:id/status`, which hold the transition
 * rule and the approval record. An edit must never be able to approve a style.
 */
export const updateGarmentBodySchema = z
  .object({
    name: requiredString(NAME_REQUIRED).optional(),
    styleNumber: requiredString(STYLE_REQUIRED).toUpperCase().optional(),
    buyer: requiredString(BUYER_REQUIRED).optional(),
    orderQuantity: quantitySchema.optional(),
    wastagePercent: wastageSchema.optional(),
    fabrics: fabricsSchema.optional(),
    garmentType: z.string().trim().min(1).optional(),
    season: z.string().trim().min(1).optional(),
    sizeRange: z.string().trim().min(1).optional(),
    description: z.string().trim().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

/**
 * The move a style is asked to make. Whether it is *allowed* is decided by
 * `GARMENT_TRANSITIONS` in the service, never by the client.
 */
export const garmentStatusBodySchema = z.object({
  status: z.enum(GARMENT_STATUSES, {
    required_error: STATUS_INVALID,
    invalid_type_error: STATUS_INVALID
  })
});

/**
 * The library paginates server-side. `limit` goes up to 200 so the screens that need the
 * whole set — the copy-operations-from select on the new-garment screen — can ask for it
 * in one request rather than walking pages.
 */
export const garmentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().trim().optional()
});

/** Preview values without saving them to the garment. */
export const calculationQuerySchema = z.object({
  quantity: z.coerce.number().int().min(1).optional(),
  wastagePercent: z.coerce.number().min(0).max(40).optional(),
  roundingMode: z.enum(ROUNDING_MODES).optional()
});

export type CreateGarmentBody = z.infer<typeof createGarmentBodySchema>;
export type UpdateGarmentBody = z.infer<typeof updateGarmentBodySchema>;
export type GarmentStatusBody = z.infer<typeof garmentStatusBodySchema>;
export type GarmentListQuery = z.infer<typeof garmentListQuerySchema>;
export type CalculationQuery = z.infer<typeof calculationQuerySchema>;
