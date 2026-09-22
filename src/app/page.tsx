import Link from 'next/link';
import { db } from '@/lib/db';
import { computeRiskScore } from '@/lib/risk-score';
import { formatTrendingList, type CoinWithLatestSnapshot } from '@/lib/trending-list';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

async function getTrendingCoins(): Promise<CoinWithLatestSnapshot[]> {
  const coins = await db.coin.findMany({
    include: {
      snapshots: { orderBy: { takenAt: 'desc' }, take: 1 },
      osint: true,
    },
  });

  return coins
    .filter((c) => c.snapshots.length > 0)
    .map((c) => {
      const snap = c.snapshots[0];
      const { score } = computeRiskScore({
        liquidityLocked: snap.liquidityLocked,
        mintAuthorityActive: snap.mintAuthorityActive,
        freezeAuthorityActive: snap.freezeAuthorityActive,
        top10HolderPct: snap.top10HolderPct,
        deployerRugCount: c.osint?.deployerRugCount ?? null,
        walletClusterFlag: c.osint?.walletClusterFlag ?? null,
        twitterAccountAgeDays: c.osint?.twitterAccountAgeDays ?? null,
        domainAgeDays: c.osint?.domainAgeDays ?? null,
      });
      return {
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        mintAddress: c.mintAddress,
        trendingSince: c.trendingSince,
        latestSnapshot: {
          socialVolume: snap.socialVolume,
          tradeVolume24h: snap.tradeVolume24h,
          priceUsd: snap.priceUsd,
          riskScore: score,
        },
      };
    });
}

export default async function HomePage() {
  const coins = await getTrendingCoins();
  const list = formatTrendingList(coins);

  return (
    <main>
      <h1>Trending Solana meme coins</h1>
      <ul>
        {list.map((coin) => (
          <li key={coin.id}>
            <Link href={`/coin/${coin.mintAddress}`}>
              {coin.symbol} — risk score {coin.latestSnapshot.riskScore}
              {coin.clusterId !== null ? ` (cluster #${coin.clusterId})` : ''}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
