import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discoverCoins, maxTrackedFromEnv, type DiscoveryDeps, type TrendingToken } from '@/lib/discovery';

describe('maxTrackedFromEnv', () => {
  it('defaults to 100 when unset or blank', () => {
    expect(maxTrackedFromEnv(undefined)).toBe(100);
    expect(maxTrackedFromEnv('')).toBe(100);
  });

  it('uses a positive whole number', () => {
    expect(maxTrackedFromEnv('25')).toBe(25);
  });

  it('falls back to the default for zero, negatives, decimals and junk', () => {
    for (const bad of ['0', '-5', '2.5', 'abc', '10abc']) {
      expect(maxTrackedFromEnv(bad)).toBe(100);
    }
  });
});

const A: TrendingToken = { mintAddress: 'MintA', symbol: 'AAA', name: 'Alpha' };
const B: TrendingToken = { mintAddress: 'MintB', symbol: 'BBB', name: 'Beta' };
const C: TrendingToken = { mintAddress: 'MintC', symbol: 'CCC', name: 'Gamma' };

function makeDeps(overrides: Partial<DiscoveryDeps> = {}): DiscoveryDeps & { createCoin: ReturnType<typeof vi.fn> } {
  return {
    fetchTrending: vi.fn().mockResolvedValue([A, B, C]),
    fetchDeployerWallet: vi.fn().mockImplementation(async (mint: string) => `deployer-of-${mint}`),
    listTrackedMints: vi.fn().mockResolvedValue([]),
    createCoin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as DiscoveryDeps & { createCoin: ReturnType<typeof vi.fn> };
}

describe('discoverCoins', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores every untracked trending token with its deployer wallet', async () => {
    const deps = makeDeps();

    const result = await discoverCoins(deps, { maxTracked: 100 });

    expect(result).toEqual({ added: 3 });
    expect(deps.createCoin).toHaveBeenCalledWith({
      mintAddress: 'MintA',
      symbol: 'AAA',
      name: 'Alpha',
      deployerWallet: 'deployer-of-MintA',
    });
    expect(deps.createCoin).toHaveBeenCalledTimes(3);
  });

  it('does not re-add or look up tokens that are already tracked', async () => {
    const deps = makeDeps({ listTrackedMints: vi.fn().mockResolvedValue(['MintA', 'MintC']) });

    const result = await discoverCoins(deps, { maxTracked: 100 });

    expect(result).toEqual({ added: 1 });
    expect(deps.fetchDeployerWallet).toHaveBeenCalledTimes(1);
    expect(deps.fetchDeployerWallet).toHaveBeenCalledWith('MintB');
  });

  it('only fills the free slots under the tracked-coin cap, keeping trending order', async () => {
    const deps = makeDeps({ listTrackedMints: vi.fn().mockResolvedValue(['Existing1', 'Existing2']) });

    const result = await discoverCoins(deps, { maxTracked: 3 });

    expect(result).toEqual({ added: 1 });
    expect(deps.createCoin).toHaveBeenCalledTimes(1);
    expect(deps.createCoin.mock.calls[0][0].mintAddress).toBe('MintA');
  });

  it('makes no creation-info calls at all when already at the cap', async () => {
    const deps = makeDeps({ listTrackedMints: vi.fn().mockResolvedValue(['E1', 'E2', 'E3']) });

    const result = await discoverCoins(deps, { maxTracked: 3 });

    expect(result).toEqual({ added: 0 });
    expect(deps.fetchDeployerWallet).not.toHaveBeenCalled();
  });

  it('does not throw when the trending call fails, so ingestion of tracked coins can still run', async () => {
    const deps = makeDeps({ fetchTrending: vi.fn().mockRejectedValue(new Error('Birdeye 403')) });

    await expect(discoverCoins(deps, { maxTracked: 100 })).resolves.toEqual({ added: 0 });
    expect(deps.createCoin).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('skips a token whose creation info fails and still adds the others', async () => {
    const deps = makeDeps({
      fetchDeployerWallet: vi.fn().mockImplementation(async (mint: string) => {
        if (mint === 'MintB') throw new Error('creation info unavailable');
        return `deployer-of-${mint}`;
      }),
    });

    const result = await discoverCoins(deps, { maxTracked: 100 });

    expect(result).toEqual({ added: 2 });
    const stored = deps.createCoin.mock.calls.map((c) => c[0].mintAddress);
    expect(stored).toEqual(['MintA', 'MintC']);
  });

  it('keeps going when storing one coin fails', async () => {
    const createCoin = vi
      .fn()
      .mockRejectedValueOnce(new Error('unique constraint'))
      .mockResolvedValue(undefined);
    const deps = makeDeps({ createCoin });

    const result = await discoverCoins(deps, { maxTracked: 100 });

    expect(result).toEqual({ added: 2 });
    expect(createCoin).toHaveBeenCalledTimes(3);
  });

  it('adds nothing when nothing is trending', async () => {
    const deps = makeDeps({ fetchTrending: vi.fn().mockResolvedValue([]) });

    expect(await discoverCoins(deps, { maxTracked: 100 })).toEqual({ added: 0 });
  });
});
