import { describe, it, expect, vi } from 'vitest';
import { ingestCoin, type IngestDeps } from '@/lib/cron-ingest';

describe('ingestCoin', () => {
  it('writes a snapshot with data pulled from all three sources', async () => {
    const createSnapshot = vi.fn().mockResolvedValue(undefined);
    const deps: IngestDeps = {
      fetchOnChain: vi.fn().mockResolvedValue({
        priceUsd: 1,
        liquidityUsd: 5000,
        tradeVolume24h: 2000,
        liquidityLocked: true,
        mintAuthorityActive: false,
        freezeAuthorityActive: false,
        top10HolderPct: 25,
      }),
      fetchSocial: vi.fn().mockResolvedValue({ socialVolume: 300, socialSentiment: 60, isTrending: true }),
      createSnapshot,
    };

    await ingestCoin({ id: 'coin-1', mintAddress: 'Mint111', symbol: 'TST' }, deps);

    expect(createSnapshot).toHaveBeenCalledWith({
      coinId: 'coin-1',
      priceUsd: 1,
      liquidityUsd: 5000,
      tradeVolume24h: 2000,
      liquidityLocked: true,
      mintAuthorityActive: false,
      freezeAuthorityActive: false,
      top10HolderPct: 25,
      socialVolume: 300,
      socialSentiment: 60,
    });
  });

  it('skips the coin without throwing when a source fails', async () => {
    const createSnapshot = vi.fn();
    const deps: IngestDeps = {
      fetchOnChain: vi.fn().mockRejectedValue(new Error('Birdeye down')),
      fetchSocial: vi.fn().mockResolvedValue({ socialVolume: 300, socialSentiment: 60, isTrending: true }),
      createSnapshot,
    };

    await expect(ingestCoin({ id: 'coin-1', mintAddress: 'Mint111', symbol: 'TST' }, deps)).resolves.toBeUndefined();
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it('skips the coin without throwing when createSnapshot fails', async () => {
    const createSnapshot = vi.fn().mockRejectedValue(new Error('Database connection failed'));
    const deps: IngestDeps = {
      fetchOnChain: vi.fn().mockResolvedValue({
        priceUsd: 1,
        liquidityUsd: 5000,
        tradeVolume24h: 2000,
        liquidityLocked: true,
        mintAuthorityActive: false,
        freezeAuthorityActive: false,
        top10HolderPct: 25,
      }),
      fetchSocial: vi.fn().mockResolvedValue({ socialVolume: 300, socialSentiment: 60, isTrending: true }),
      createSnapshot,
    };

    await expect(ingestCoin({ id: 'coin-1', mintAddress: 'Mint111', symbol: 'TST' }, deps)).resolves.toBeUndefined();
    expect(createSnapshot).toHaveBeenCalled();
  });
});
