import 'dotenv/config';
import { z } from 'zod';

/**
 * Fails fast: a missing JWT_SECRET or MONGODB_URI stops the process before it can
 * serve a single request with a broken configuration.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  COOKIE_NAME: z.string().min(1).default('gotc_session'),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
    // Deliberately console.error: the logger itself depends on this module.
    console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Cookie lifetime, 12 hours (API.md §Auth). */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
