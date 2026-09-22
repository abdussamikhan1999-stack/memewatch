export interface SocialData {
  socialVolume: number;
  socialSentiment: number;
  isTrending: boolean;
}

interface LunarCrushResponse {
  data: {
    interactions_24h: number;
    sentiment: number;
    trending: boolean;
  };
}

export function parseLunarCrushTopic(raw: unknown): SocialData {
  const response = raw as LunarCrushResponse;
  const d = response.data;
  return {
    socialVolume: d.interactions_24h,
    socialSentiment: d.sentiment,
    isTrending: d.trending,
  };
}

export async function fetchLunarCrushTopic(symbol: string): Promise<SocialData> {
  const res = await fetch(`https://lunarcrush.com/api4/public/coins/${symbol}/v1`, {
    headers: { Authorization: `Bearer ${process.env.LUNARCRUSH_API_KEY ?? ''}` },
  });
  if (!res.ok) {
    throw new Error(`LunarCrush request failed: ${res.status} ${res.statusText}`);
  }
  return parseLunarCrushTopic(await res.json());
}
