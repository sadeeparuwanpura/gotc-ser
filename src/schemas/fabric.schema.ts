import { z } from 'zod';
import { requiredString } from './common.schema';

const NAME_REQUIRED = 'Fabric name is required.';
const COMPOSITION_REQUIRED = 'Composition is required — it drives needle and thread choice.';
const GSM_INVALID = 'GSM must be a positive number, or left blank for tapes and trims.';

const gsmSchema = z
  .union([z.coerce.number({ invalid_type_error: GSM_INVALID }).min(1, GSM_INVALID), z.null()])
  .optional();

export const createFabricBodySchema = z.object({
  name: requiredString(NAME_REQUIRED),
  composition: requiredString(COMPOSITION_REQUIRED),
  gsm: gsmSchema,
  colour: z.string().trim().min(1).default('White'),
  supplier: z.string().trim().min(1).default('—')
});

export const updateFabricBodySchema = z
  .object({
    name: requiredString(NAME_REQUIRED).optional(),
    composition: requiredString(COMPOSITION_REQUIRED).optional(),
    gsm: gsmSchema,
    colour: z.string().trim().min(1).optional(),
    supplier: z.string().trim().min(1).optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

export type CreateFabricBody = z.infer<typeof createFabricBodySchema>;
export type UpdateFabricBody = z.infer<typeof updateFabricBodySchema>;
