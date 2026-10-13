import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ingestCoin, liveDeps } from '@/lib/cron-ingest';
import { discoverCoins, liveDiscoveryDeps, maxTrackedFromEnv } from '@/lib/discovery';

export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  // Fail closed: with no secret configured, `Bearer undefined` must not authorize anyone.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Discover first so newly trending coins get their first snapshot in this same run.
  // discoverCoins is written not to throw, but a discovery problem must never stop
  // snapshots of the coins we already track, so guard it here too.
  let discovered = 0;
  try {
    ({ added: discovered } = await discoverCoins(liveDiscoveryDeps, {
      maxTracked: maxTrackedFromEnv(process.env.MAX_TRACKED_COINS),
    }));
  } catch (err) {
    console.error('Coin discovery failed:', err);
  }

  const coins = await db.coin.findMany({ select: { id: true, mintAddress: true, symbol: true } });
  await Promise.all(coins.map((coin) => ingestCoin(coin, liveDeps)));

  return NextResponse.json({ ingested: coins.length, discovered });
}
