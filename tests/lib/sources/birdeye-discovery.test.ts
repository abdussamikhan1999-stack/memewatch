import { describe, it, expect } from 'vitest';
import { parseBirdeyeTrending, parseBirdeyeCreationInfo } from '@/lib/sources/birdeye';
import trending from '../../fixtures/birdeye-trending.json';
import creation from '../../fixtures/birdeye-creation-info.json';

// The fixtures are the response shapes published in Birdeye's API docs
// (token_trending and token_creation_info), not recordings of live calls.

describe('parseBirdeyeTrending', () => {
  it('maps each trending token to a mint, symbol and name, in rank order', () => {
    expect(parseBirdeyeTrending(trending)).toEqual([
      { mintAddress: 'HJXh1XULVe2Mdp6mTKd5K7of1uFqBTbmcWzvBv6cpump', symbol: 'ATO', name: 'AVOCATO' },
      { mintAddress: 'HYFDwieKWth1kzKbtLFMtgMVwukyvyWNYFxyQDcWpump', symbol: 'LIQUIDATOR', name: 'The Liquidator' },
    ]);
  });

  it('returns an empty list when Birdeye reports no trending tokens', () => {
    expect(parseBirdeyeTrending({ success: true, data: { tokens: [] } })).toEqual([]);
  });

  it('throws with Birdeye\'s message when Birdeye reports failure', () => {
    expect(() => parseBirdeyeTrending({ success: false, message: 'Unauthorized' })).toThrow(
      'Birdeye trending failed: Unauthorized'
    );
  });

  it('throws on an empty response', () => {
    expect(() => parseBirdeyeTrending(null)).toThrow('Birdeye trending failed: no response');
  });

  it('throws when the response has no tokens array', () => {
    expect(() => parseBirdeyeTrending({ success: true, data: {} })).toThrow(
      'Birdeye trending: unexpected response shape'
    );
  });

  it('skips entries that are missing an address instead of inventing one', () => {
    const raw = { success: true, data: { tokens: [{ symbol: 'X', name: 'No address' }, ...trending.data.tokens.slice(0, 1)] } };
    expect(parseBirdeyeTrending(raw).map((t) => t.symbol)).toEqual(['ATO']);
  });
});

describe('parseBirdeyeCreationInfo', () => {
  it('reads the creator wallet from the owner field', () => {
    expect(parseBirdeyeCreationInfo(creation)).toEqual({
      deployerWallet: 'JEFL3KwPQeughdrQAjLo9o75qh15nYbFJ2ZDrb695qsZ',
    });
  });

  it('throws when there is no owner, since a coin cannot be stored without a deployer', () => {
    expect(() => parseBirdeyeCreationInfo({ success: true, data: {} })).toThrow(
      'Birdeye creation info: no creator wallet in response'
    );
  });

  it('throws with Birdeye\'s message when Birdeye reports failure', () => {
    expect(() => parseBirdeyeCreationInfo({ success: false, message: 'Not found' })).toThrow(
      'Birdeye creation info failed: Not found'
    );
  });
});
