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

export async function fetchBirdeyeToken(mintAddress: string): Promise<OnChainData> {
  const res = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${mintAddress}`, {
    headers: {
      'X-API-KEY': process.env.BIRDEYE_API_KEY ?? '',
      'x-chain': 'solana',
    },
  });
  if (!res.ok) {
    throw new Error(`Birdeye request failed: ${res.status} ${res.statusText}`);
  }
  return parseBirdeyeToken(await res.json());
}
