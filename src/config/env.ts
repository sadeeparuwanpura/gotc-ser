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
  /** One origin, or several separated by commas. See `clientOrigins` below. */
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),
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

/**
 * The browser origins allowed to call this API directly.
 *
 * Comma separated, and an entry may use a `*.` subdomain wildcard — a host like Vercel
 * gives every preview deployment its own subdomain, so a single exact origin would only
 * ever match production:
 *
 *   CLIENT_ORIGIN=https://gotc-clie.vercel.app,https://*.vercel.app
 *
 * Only relevant when the browser calls the API cross-origin. When the front end proxies
 * `/api` through its own domain there is no `Origin` header and CORS never applies.
 */
export const clientOrigins: readonly string[] = env.CLIENT_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

export function isAllowedOrigin(origin: string): boolean {
  return clientOrigins.some((allowed) => {
    if (allowed === origin) return true;

    const wildcard = /^(https?:\/\/)\*\.(.+)$/.exec(allowed);
    const scheme = wildcard?.[1];
    const domain = wildcard?.[2];
    if (!scheme || !domain) return false;

    return origin.startsWith(scheme) && origin.slice(scheme.length).endsWith(`.${domain}`);
  });
}

/** Cookie lifetime, 12 hours (API.md §Auth). */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
