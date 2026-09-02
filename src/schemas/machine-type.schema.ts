import { z } from 'zod';
import { POSITIONS } from '../constants/domain';
import { objectIdSchema, requiredNumber, requiredString } from './common.schema';

const NAME_REQUIRED = 'Machine type name is required.';
const CODE_REQUIRED = 'Machine code is required.';
const COLOUR_INVALID = 'Colour must be a hex value such as #2F5BD0.';
const POSITIONS_REQUIRED = 'A machine type needs at least one thread position.';
const POSITION_DUPLICATE = 'Each thread position can only be listed once on a machine type.';
const RATIO_INVALID = 'Consumption ratio must be a number between 0.1 and 40.';

const colourSchema = z
  .string({ required_error: COLOUR_INVALID, invalid_type_error: COLOUR_INVALID })
  .regex(/^#[0-9A-Fa-f]{6}$/, COLOUR_INVALID);

const positionSchema = z.object({
  position: z.enum(POSITIONS),
  count: z.coerce.number().int().min(1).max(12),
  consumptionRatio: requiredNumber(RATIO_INVALID).min(0.1, RATIO_INVALID).max(40, RATIO_INVALID)
});

const positionsSchema = z
  .array(positionSchema, {
    required_error: POSITIONS_REQUIRED,
    invalid_type_error: POSITIONS_REQUIRED
  })
  .min(1, POSITIONS_REQUIRED)
  .refine(
    (positions) => new Set(positions.map((entry) => entry.position)).size === positions.length,
    { message: POSITION_DUPLICATE }
  );

export const createMachineTypeBodySchema = z.object({
  name: requiredString(NAME_REQUIRED),
  code: requiredString(CODE_REQUIRED).toUpperCase(),
  colour: colourSchema,
  positions: positionsSchema,
  active: z.boolean().optional()
});

export const updateMachineTypeBodySchema = z
  .object({
    name: requiredString(NAME_REQUIRED).optional(),
    code: requiredString(CODE_REQUIRED).toUpperCase().optional(),
    colour: colourSchema.optional(),
    positions: positionsSchema.optional(),
    active: z.boolean().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

/** The inline edit on the machine-types screen. */
export const updatePositionRatioBodySchema = z.object({
  consumptionRatio: requiredNumber(RATIO_INVALID).min(0.1, RATIO_INVALID).max(40, RATIO_INVALID)
});

export const positionParamsSchema = z.object({
  id: objectIdSchema,
  positionId: objectIdSchema
});

export type CreateMachineTypeBody = z.infer<typeof createMachineTypeBodySchema>;
export type UpdateMachineTypeBody = z.infer<typeof updateMachineTypeBodySchema>;
export type UpdatePositionRatioBody = z.infer<typeof updatePositionRatioBodySchema>;
