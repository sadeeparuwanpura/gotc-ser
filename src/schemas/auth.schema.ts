import { z } from 'zod';
import { requiredString } from './common.schema';

export const loginBodySchema = z.object({
  email: requiredString('Enter your email address.').email('Enter a valid email address.'),
  password: requiredString('Enter your password.')
});

export type LoginBody = z.infer<typeof loginBodySchema>;
