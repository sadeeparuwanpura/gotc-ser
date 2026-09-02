import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './env';

/**
 * `vitest.config.ts` sets CLIENT_ORIGIN for this suite, so the wildcard branch is covered.
 * The negative cases matter most: a subdomain wildcard must not become a suffix match.
 */
describe('CORS origin matching', () => {
  it('accepts the exact production origin', () => {
    expect(isAllowedOrigin('https://gotc-clie.vercel.app')).toBe(true);
  });

  it('accepts any preview subdomain through the wildcard', () => {
    expect(isAllowedOrigin('https://gotc-clie-git-main-acme.vercel.app')).toBe(true);
    expect(isAllowedOrigin('https://whatever.vercel.app')).toBe(true);
  });

  it('refuses a look-alike domain', () => {
    // Suffix matching without the dot would wave this through.
    expect(isAllowedOrigin('https://evil-vercel.app')).toBe(false);
    expect(isAllowedOrigin('https://vercel.app')).toBe(false);
  });

  it('refuses the allowed host used as a prefix of another domain', () => {
    expect(isAllowedOrigin('https://gotc-clie.vercel.app.attacker.com')).toBe(false);
  });

  it('refuses a scheme downgrade', () => {
    expect(isAllowedOrigin('http://gotc-clie.vercel.app')).toBe(false);
  });

  it('refuses an origin that is not listed at all', () => {
    expect(isAllowedOrigin('https://example.com')).toBe(false);
  });
});
