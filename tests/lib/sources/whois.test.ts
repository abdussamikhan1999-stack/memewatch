import { describe, it, expect, vi } from 'vitest';
import { computeDomainAgeDays } from '@/lib/sources/whois';

describe('computeDomainAgeDays', () => {
  it('computes days since the creation date', () => {
    const created = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeDomainAgeDays(created)).toBe(10);
  });

  it('returns null for a missing creation date', () => {
    expect(computeDomainAgeDays(null)).toBeNull();
  });
});
