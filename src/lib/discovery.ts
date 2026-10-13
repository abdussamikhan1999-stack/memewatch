import { fetchBirdeyeTrending, fetchBirdeyeCreationInfo, type TrendingToken } from '@/lib/sources/birdeye';
import { db } from '@/lib/db';

export type { TrendingToken };

export interface NewCoin {
  mintAddress: string;
  symbol: string;
  name: string;
  deployerWallet: string;
}

export interface DiscoveryDeps {
  fetchTrending: () => Promise<TrendingToken[]>;
  fetchDeployerWallet: (mintAddress: string) => Promise<string>;
  listTrackedMints: () => Promise<string[]>;
  createCoin: (coin: NewCoin) => Promise<void>;
}

export const liveDiscoveryDeps: DiscoveryDeps = {
  fetchTrending: fetchBirdeyeTrending,
  fetchDeployerWallet: async (mintAddress) => (await fetchBirdeyeCreationInfo(mintAddress)).deployerWallet,
  listTrackedMints: async () => (await db.coin.findMany({ select: { mintAddress: true } })).map((c) => c.mintAddress),
  createCoin: async (coin) => {
    await db.coin.create({ data: coin });
  },
};

const DEFAULT_MAX_TRACKED = 100;

/** Parse MAX_TRACKED_COINS: a positive whole number, otherwise the default of 100. */
export function maxTrackedFromEnv(value: string | undefined): number {
  if (value === undefined || !/^[1-9]\d*$/.test(value.trim())) return DEFAULT_MAX_TRACKED;
  return Number(value.trim());
}

/**
 * Add newly trending Solana tokens to the Coin table, up to `maxTracked` coins in total.
 *
 * Never throws: a failed trending call, or a failure on one token, is logged and
 * skipped so the cron can still snapshot the coins it already tracks. A token whose
 * deployer can't be looked up is not stored (Coin.deployerWallet is required and
 * the OSINT checks key off it); it is retried on the next run while it still trends.
 */
export async function discoverCoins(deps: DiscoveryDeps, opts: { maxTracked: number }): Promise<{ added: number }> {
  let trending: TrendingToken[];
  let tracked: Set<string>;
  try {
    [trending, tracked] = await Promise.all([deps.fetchTrending(), deps.listTrackedMints().then((m) => new Set(m))]);
  } catch (err) {
    console.error('Coin discovery skipped:', err);
    return { added: 0 };
  }

  const freeSlots = opts.maxTracked - tracked.size;
  if (freeSlots <= 0) return { added: 0 };

  const candidates = trending.filter((t) => !tracked.has(t.mintAddress));
  let added = 0;
  for (const token of candidates) {
    if (added >= freeSlots) break;
    try {
      const deployerWallet = await deps.fetchDeployerWallet(token.mintAddress);
      await deps.createCoin({
        mintAddress: token.mintAddress,
        symbol: token.symbol,
        name: token.name,
        deployerWallet,
      });
      added++;
    } catch (err) {
      console.error(`Skipping discovered coin ${token.symbol} (${token.mintAddress}):`, err);
    }
  }
  return { added };
}
