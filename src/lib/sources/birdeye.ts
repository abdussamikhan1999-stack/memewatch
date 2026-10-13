export interface OnChainData {
  priceUsd: number;
  liquidityUsd: number;
  tradeVolume24h: number;
  liquidityLocked: boolean;
  mintAuthorityActive: boolean;
  freezeAuthorityActive: boolean;
  top10HolderPct: number;
}

interface BirdeyeTokenResponse {
  data: {
    price: number;
    liquidity: number;
    v24hUSD: number;
    mintAuthority: string | null;
    freezeAuthority: string | null;
    lpBurned: boolean;
    top10HolderPercent: number;
  };
}

export function parseBirdeyeToken(raw: unknown): OnChainData {
  const response = raw as BirdeyeTokenResponse;
  const d = response.data;
  return {
    priceUsd: d.price,
    liquidityUsd: d.liquidity,
    tradeVolume24h: d.v24hUSD,
    liquidityLocked: d.lpBurned,
    mintAuthorityActive: d.mintAuthority !== null,
    freezeAuthorityActive: d.freezeAuthority !== null,
    top10HolderPct: d.top10HolderPercent,
  };
}

function birdeyeHeaders(): Record<string, string> {
  return {
    accept: 'application/json',
    'X-API-KEY': process.env.BIRDEYE_API_KEY ?? '',
    'x-chain': 'solana',
  };
}

export async function fetchBirdeyeToken(mintAddress: string): Promise<OnChainData> {
  const res = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${mintAddress}`, {
    headers: birdeyeHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Birdeye request failed: ${res.status} ${res.statusText}`);
  }
  return parseBirdeyeToken(await res.json());
}

export interface TrendingToken {
  mintAddress: string;
  symbol: string;
  name: string;
}

interface BirdeyeEnvelope {
  success?: boolean;
  message?: string;
  data?: unknown;
}

// Birdeye's docs give 20 as the safe page size for the trending list (one doc
// page says <=20, the reference says <=50), so ask for 20.
const TRENDING_LIMIT = 20;

export function parseBirdeyeTrending(raw: unknown): TrendingToken[] {
  const response = raw as BirdeyeEnvelope | null;
  if (!response || response.success === false) {
    throw new Error(`Birdeye trending failed: ${response?.message ?? 'no response'}`);
  }
  const tokens = (response.data as { tokens?: unknown } | undefined)?.tokens;
  if (!Array.isArray(tokens)) {
    throw new Error('Birdeye trending: unexpected response shape');
  }
  return tokens
    .filter((t): t is { address: string; symbol?: string; name?: string } => typeof t?.address === 'string' && t.address !== '')
    .map((t) => ({ mintAddress: t.address, symbol: t.symbol ?? '', name: t.name ?? '' }));
}

export async function fetchBirdeyeTrending(): Promise<TrendingToken[]> {
  const url = `https://public-api.birdeye.so/defi/token_trending?sort_by=rank&sort_type=asc&offset=0&limit=${TRENDING_LIMIT}`;
  const res = await fetch(url, { headers: birdeyeHeaders() });
  if (!res.ok) {
    throw new Error(`Birdeye trending request failed: ${res.status} ${res.statusText}`);
  }
  return parseBirdeyeTrending(await res.json());
}

export interface CreationInfo {
  deployerWallet: string;
}

export function parseBirdeyeCreationInfo(raw: unknown): CreationInfo {
  const response = raw as BirdeyeEnvelope | null;
  if (!response || response.success === false) {
    throw new Error(`Birdeye creation info failed: ${response?.message ?? 'no response'}`);
  }
  const owner = (response.data as { owner?: unknown } | undefined)?.owner;
  if (typeof owner !== 'string' || owner === '') {
    throw new Error('Birdeye creation info: no creator wallet in response');
  }
  return { deployerWallet: owner };
}

export async function fetchBirdeyeCreationInfo(mintAddress: string): Promise<CreationInfo> {
  const res = await fetch(`https://public-api.birdeye.so/defi/token_creation_info?address=${mintAddress}`, {
    headers: birdeyeHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Birdeye creation info request failed: ${res.status} ${res.statusText}`);
  }
  return parseBirdeyeCreationInfo(await res.json());
}
