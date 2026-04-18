/**
 * Tests for `src/app/robots.ts`.
 *
 * Covers:
 *   - The allow / disallow lists match the spec (every private area blocked).
 *   - The `sitemap` URL is absolute (required by Search Console).
 *   - `host` is the canonical origin.
 *   - The user-agent is `*` (open to all crawlers; we filter via path).
 */

import { describe, it, expect } from 'vitest';

import robots from '@/app/robots';

const EXPECTED_DISALLOW = [
  '/dashboard/',
  '/admin/',
  '/agent/',
  '/api/',
  '/account/',
  '/book/',
  '/sign-in',
  '/sign-up',
  '/verify-email',
  '/setup',
  '/login',
  '/reset-password',
  '/paywall',
];

describe('robots', () => {
  it('applies to all user agents', () => {
    const result = robots();
    expect(Array.isArray(result.rules) ? false : result.rules.userAgent).toBe('*');
  });

  it('allows "/"', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules.allow).toBe('/');
  });

  it('disallows every private area listed in the spec', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    const disallow = Array.isArray(rules.disallow) ? rules.disallow : [rules.disallow!];

    for (const bad of EXPECTED_DISALLOW) {
      expect(disallow).toContain(bad);
    }
  });

  it('exposes the sitemap as an absolute URL', () => {
    const result = robots();
    const sm = result.sitemap;
    expect(sm).toBeDefined();
    const url = Array.isArray(sm) ? sm[0] : sm!;
    expect(url).toMatch(/^https?:\/\//);
    // Canonical origin per spec.
    expect(url).toBe('https://icut.pk/sitemap.xml');
  });

  it('sets host to the canonical origin', () => {
    const result = robots();
    expect(result.host).toBe('https://icut.pk');
  });
});
