import { z } from 'zod';

/** 24-character hex strings are the only ids the API accepts. */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'That id is not valid.');

export const idParamSchema = z.object({ id: objectIdSchema });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

/**
 * Every list endpoint pages the same way. `limit` caps at 200 so a screen that genuinely
 * needs the whole set — the thread select on an operation, the fabric picker on the
 * new-garment screen — can ask for it in one request instead of walking pages.
 */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().trim().optional()
});

export type ListQuery = z.infer<typeof listQuerySchema>;

/**
 * Copy is final — the client maps `error.message` straight into its notice strips, so a
 * missing field and an empty field must produce the *same* sentence from README.md.
 * Zod's own "Required" would leak through otherwise.
 */
export function requiredString(message: string): z.ZodString {
  return z
    .string({ required_error: message, invalid_type_error: message })
    .trim()
    .min(1, message);
}

export function requiredNumber(message: string): z.ZodNumber {
  return z.coerce.number({ required_error: message, invalid_type_error: message });
}

export type IdParam = z.infer<typeof idParamSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
