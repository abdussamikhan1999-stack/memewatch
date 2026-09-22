import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { computeRiskScore } from '@/lib/risk-score';
import { socialPriceCorrelation, type SnapshotPoint } from '@/lib/hype-signals';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export default async function CoinDetailPage({ params }: { params: Promise<{ mintAddress: string }> }) {
  const { mintAddress } = await params;
  const coin = await db.coin.findUnique({
    where: { mintAddress },
    include: { snapshots: { orderBy: { takenAt: 'asc' } }, osint: true },
  });

  if (!coin || coin.snapshots.length === 0) {
    notFound();
  }

  const latest = coin.snapshots[coin.snapshots.length - 1];
  const { score, flags } = computeRiskScore({
    liquidityLocked: latest.liquidityLocked,
    mintAuthorityActive: latest.mintAuthorityActive,
    freezeAuthorityActive: latest.freezeAuthorityActive,
    top10HolderPct: latest.top10HolderPct,
    deployerRugCount: coin.osint?.deployerRugCount ?? 0,
    walletClusterFlag: coin.osint?.walletClusterFlag ?? false,
    twitterAccountAgeDays: coin.osint?.twitterAccountAgeDays ?? null,
    domainAgeDays: coin.osint?.domainAgeDays ?? null,
  });

  const history: SnapshotPoint[] = coin.snapshots.map((s) => ({
    takenAt: s.takenAt,
    socialVolume: s.socialVolume,
    tradeVolume24h: s.tradeVolume24h,
    priceUsd: s.priceUsd,
  }));
  const correlation = socialPriceCorrelation(history);

  return (
    <main>
      <h1>
        {coin.name} ({coin.symbol})
      </h1>
      <p>Risk score: {score} / 100</p>
      <ul>
        {flags.map((flag) => (
          <li key={flag.label}>
            [{flag.level}] {flag.label}: {flag.detail}
          </li>
        ))}
      </ul>

      <h2>Hype vs. price</h2>
      <p>
        {correlation === null
          ? 'Not enough history yet to tell if hype predicts price movement.'
          : `Social/price correlation: ${correlation.toFixed(2)} (${
              Math.abs(correlation) > 0.5 ? 'hype tracks price' : 'no clear relationship'
            })`}
      </p>

      <h2>Price/social history</h2>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Price</th>
            <th>Social volume</th>
          </tr>
        </thead>
        <tbody>
          {coin.snapshots.map((s) => (
            <tr key={s.id}>
              <td>{s.takenAt.toISOString()}</td>
              <td>{s.priceUsd}</td>
              <td>{s.socialVolume}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
