import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { findMany, ingestCoin } = vi.hoisted(() => ({ findMany: vi.fn(), ingestCoin: vi.fn() }));

vi.mock('@/lib/db', () => ({ db: { coin: { findMany } } }));
vi.mock('@/lib/cron-ingest', () => ({ ingestCoin, liveDeps: {} }));

import { GET } from '@/app/api/cron/ingest/route';

function request(authorization?: string): Request {
  return new Request('http://localhost/api/cron/ingest', {
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe('GET /api/cron/ingest authorization', () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([
      { id: 'c1', mintAddress: 'Mint1', symbol: 'ONE' },
      { id: 'c2', mintAddress: 'Mint2', symbol: 'TWO' },
    ]);
    ingestCoin.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs ingestion and reports the coin count when the secret matches', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');

    const res = await GET(request('Bearer s3cret'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ingested: 2 });
    expect(ingestCoin).toHaveBeenCalledTimes(2);
  });

  it('rejects a wrong secret', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');

    const res = await GET(request('Bearer nope'));

    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
    expect(ingestCoin).not.toHaveBeenCalled();
  });

  it('rejects a request with no authorization header', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect(ingestCoin).not.toHaveBeenCalled();
  });

  it('fails closed when CRON_SECRET is unset, even for "Bearer undefined"', async () => {
    vi.stubEnv('CRON_SECRET', undefined as unknown as string);
    delete process.env.CRON_SECRET;

    const res = await GET(request('Bearer undefined'));

    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
    expect(ingestCoin).not.toHaveBeenCalled();
  });

  it('fails closed when CRON_SECRET is an empty string, even for "Bearer "', async () => {
    vi.stubEnv('CRON_SECRET', '');

    const res = await GET(request('Bearer '));

    expect(res.status).toBe(401);
    expect(ingestCoin).not.toHaveBeenCalled();
  });
});
