import { fetchBirdeyeToken, type OnChainData } from '@/lib/sources/birdeye';
import { fetchLunarCrushTopic, type SocialData } from '@/lib/sources/lunarcrush';
import { db } from '@/lib/db';

export interface CoinRef {
  id: string;
  mintAddress: string;
  symbol: string;
}

export interface IngestDeps {
  fetchOnChain: (mintAddress: string) => Promise<OnChainData>;
  fetchSocial: (symbol: string) => Promise<SocialData>;
  createSnapshot: (data: {
    coinId: string;
    priceUsd: number;
    liquidityUsd: number;
    tradeVolume24h: number;
    liquidityLocked: boolean;
    mintAuthorityActive: boolean;
    freezeAuthorityActive: boolean;
    top10HolderPct: number;
    socialVolume: number;
    socialSentiment: number;
  }) => Promise<void>;
}

export const liveDeps: IngestDeps = {
  fetchOnChain: fetchBirdeyeToken,
  fetchSocial: fetchLunarCrushTopic,
  createSnapshot: async (data) => {
    await db.snapshot.create({ data });
  },
};

export async function ingestCoin(coin: CoinRef, deps: IngestDeps): Promise<void> {
  let onChain: OnChainData;
  let social: SocialData;
  try {
    [onChain, social] = await Promise.all([
      deps.fetchOnChain(coin.mintAddress),
      deps.fetchSocial(coin.symbol),
    ]);

    await deps.createSnapshot({
      coinId: coin.id,
      priceUsd: onChain.priceUsd,
      liquidityUsd: onChain.liquidityUsd,
      tradeVolume24h: onChain.tradeVolume24h,
      liquidityLocked: onChain.liquidityLocked,
      mintAuthorityActive: onChain.mintAuthorityActive,
      freezeAuthorityActive: onChain.freezeAuthorityActive,
      top10HolderPct: onChain.top10HolderPct,
      socialVolume: social.socialVolume,
      socialSentiment: social.socialSentiment,
    });
  } catch (err) {
    console.error(`Skipping snapshot for ${coin.symbol}:`, err);
    return;
  }
}
