import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ingestCoin, liveDeps } from '@/lib/cron-ingest';

export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  // Fail closed: with no secret configured, `Bearer undefined` must not authorize anyone.
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const coins = await db.coin.findMany({ select: { id: true, mintAddress: true, symbol: true } });
  await Promise.all(coins.map((coin) => ingestCoin(coin, liveDeps)));

  return NextResponse.json({ ingested: coins.length });
}
