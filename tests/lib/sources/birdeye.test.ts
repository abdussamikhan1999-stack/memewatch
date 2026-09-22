import { describe, it, expect } from 'vitest';
import { parseBirdeyeToken } from '@/lib/sources/birdeye';
import fixture from '../../fixtures/birdeye-token.json';

describe('parseBirdeyeToken', () => {
  it('parses a raw Birdeye response into OnChainData', () => {
    const result = parseBirdeyeToken(fixture);
    expect(result).toEqual({
      priceUsd: 0.00042,
      liquidityUsd: 15000.5,
      tradeVolume24h: 82000,
      liquidityLocked: true,
      mintAuthorityActive: false,
      freezeAuthorityActive: true,
      top10HolderPct: 34.2,
    });
  });
});
