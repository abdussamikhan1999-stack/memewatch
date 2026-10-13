import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { findMany, ingestCoin, discoverCoins } = vi.hoisted(() => ({
  findMany: vi.fn(),
  ingestCoin: vi.fn(),
  discoverCoins: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { coin: { findMany } } }));
vi.mock('@/lib/cron-ingest', () => ({ ingestCoin, liveDeps: {} }));
vi.mock('@/lib/discovery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/discovery')>()),
  discoverCoins,
  liveDiscoveryDeps: {},
}));

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
    discoverCoins.mockReset().mockResolvedValue({ added: 0 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs ingestion and reports the coin count when the secret matches', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');

    const res = await GET(request('Bearer s3cret'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ingested: 2, discovered: 0 });
    expect(ingestCoin).toHaveBeenCalledTimes(2);
  });

  it('discovers new coins before listing the coins to snapshot, and reports how many', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    discoverCoins.mockResolvedValue({ added: 3 });

    const res = await GET(request('Bearer s3cret'));

    expect(await res.json()).toEqual({ ingested: 2, discovered: 3 });
    expect(discoverCoins.mock.invocationCallOrder[0]).toBeLessThan(findMany.mock.invocationCallOrder[0]);
  });

  it('passes the MAX_TRACKED_COINS cap to discovery, defaulting to 100', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');

    await GET(request('Bearer s3cret'));
    expect(discoverCoins).toHaveBeenLastCalledWith(expect.anything(), { maxTracked: 100 });

    vi.stubEnv('MAX_TRACKED_COINS', '25');
    await GET(request('Bearer s3cret'));
    expect(discoverCoins).toHaveBeenLastCalledWith(expect.anything(), { maxTracked: 25 });
  });

  it('still snapshots tracked coins if discovery throws unexpectedly', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    discoverCoins.mockRejectedValue(new Error('boom'));

    const res = await GET(request('Bearer s3cret'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ingested: 2, discovered: 0 });
    expect(ingestCoin).toHaveBeenCalledTimes(2);
  });

  it('does not run discovery for an unauthorized request', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');

    await GET(request('Bearer wrong'));

    expect(discoverCoins).not.toHaveBeenCalled();
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
