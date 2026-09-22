export interface TrendingEntry {
  coinId: string;
  trendingSince: Date;
}

export interface Cluster {
  coinIds: string[];
  windowStart: Date;
  windowEnd: Date;
}

export function detectClusters(entries: TrendingEntry[], windowMs: number): Cluster[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => a.trendingSince.getTime() - b.trendingSince.getTime());

  const groups: TrendingEntry[][] = [];
  let currentGroup: TrendingEntry[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].trendingSince.getTime() - sorted[i - 1].trendingSince.getTime();
    if (gap <= windowMs) {
      currentGroup.push(sorted[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  groups.push(currentGroup);

  return groups
    .filter((group) => group.length >= 2)
    .map((group) => ({
      coinIds: group.map((e) => e.coinId),
      windowStart: group[0].trendingSince,
      windowEnd: group[group.length - 1].trendingSince,
    }));
}
