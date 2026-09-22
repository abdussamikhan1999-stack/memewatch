import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ingestCoin, liveDeps } from '@/lib/cron-ingest';

export async function POST(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const coins = await db.coin.findMany({ select: { id: true, mintAddress: true, symbol: true } });
  await Promise.all(coins.map((coin) => ingestCoin(coin, liveDeps)));

  return NextResponse.json({ ingested: coins.length });
}
