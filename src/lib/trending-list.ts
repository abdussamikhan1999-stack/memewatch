import { detectClusters } from '@/lib/clusters';

export interface CoinWithLatestSnapshot {
  id: string;
  symbol: string;
  name: string;
  mintAddress: string;
  trendingSince: Date;
  latestSnapshot: {
    socialVolume: number;
    tradeVolume24h: number;
    priceUsd: number;
    riskScore: number;
  };
}

export interface TrendingListItem extends CoinWithLatestSnapshot {
  clusterId: number | null;
}

const CLUSTER_WINDOW_MS = 60 * 60_000;

export function formatTrendingList(coins: CoinWithLatestSnapshot[]): TrendingListItem[] {
  const clusters = detectClusters(
    coins.map((c) => ({ coinId: c.id, trendingSince: c.trendingSince })),
    CLUSTER_WINDOW_MS
  );

  const clusterByCoinId = new Map<string, number>();
  clusters.forEach((cluster, index) => {
    cluster.coinIds.forEach((coinId) => clusterByCoinId.set(coinId, index));
  });

  return [...coins]
    .sort((a, b) => a.latestSnapshot.riskScore - b.latestSnapshot.riskScore)
    .map((c) => ({ ...c, clusterId: clusterByCoinId.get(c.id) ?? null }));
}
