import { z } from 'zod';
import { TICKET_MAX, TICKET_MIN } from '../constants/domain';
import { listQuerySchema, objectIdSchema, requiredNumber, requiredString } from './common.schema';

/** Ticket is inverse weight — a higher ticket is a finer thread. */
const TICKET_MESSAGE = `Ticket must be between ${TICKET_MIN} and ${TICKET_MAX}. Higher ticket means finer thread.`;
const YIELD_MESSAGE = 'Cone yield must be a positive number of metres.';
const BRAND_REQUIRED = 'Brand is required.';
const COMPOSITION_REQUIRED = 'Composition is required.';

const ticketSchema = requiredNumber(TICKET_MESSAGE)
  .int(TICKET_MESSAGE)
  .min(TICKET_MIN, TICKET_MESSAGE)
  .max(TICKET_MAX, TICKET_MESSAGE);

const coneYieldSchema = requiredNumber(YIELD_MESSAGE).min(1, YIELD_MESSAGE);

export const createThreadBodySchema = z.object({
  brand: requiredString(BRAND_REQUIRED),
  ticket: ticketSchema,
  composition: requiredString(COMPOSITION_REQUIRED),
  colour: z.string().trim().min(1).default('White'),
  coneYieldM: coneYieldSchema,
  unitPrice: z.coerce.number().min(0).optional()
});

export const updateThreadBodySchema = z
  .object({
    brand: requiredString(BRAND_REQUIRED).optional(),
    ticket: ticketSchema.optional(),
    composition: requiredString(COMPOSITION_REQUIRED).optional(),
    colour: z.string().trim().min(1).optional(),
    coneYieldM: coneYieldSchema.optional(),
    unitPrice: z.coerce.number().min(0).optional(),
    active: z.boolean().optional()
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update.' });

/** `?garmentId=` populates the "n ops on STY-####" figure in the usage column. */
export const threadListQuerySchema = listQuerySchema.extend({
  garmentId: objectIdSchema.optional()
});

export type CreateThreadBody = z.infer<typeof createThreadBodySchema>;
export type UpdateThreadBody = z.infer<typeof updateThreadBodySchema>;
export type ThreadListQuery = z.infer<typeof threadListQuerySchema>;
