import { describe, it, expect } from 'vitest';
import { detectClusters, type TrendingEntry } from '@/lib/clusters';

function entry(coinId: string, minutesAgo: number): TrendingEntry {
  return { coinId, trendingSince: new Date(Date.now() - minutesAgo * 60_000) };
}

describe('detectClusters', () => {
  it('groups coins that started trending within the window', () => {
    const entries: TrendingEntry[] = [entry('a', 50), entry('b', 40), entry('c', 30)];
    const clusters = detectClusters(entries, 60 * 60_000);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].coinIds.sort()).toEqual(['a', 'b', 'c']);
  });

  it('splits coins into separate clusters when gaps exceed the window', () => {
    const entries: TrendingEntry[] = [entry('a', 200), entry('b', 190), entry('c', 10), entry('d', 5)];
    const clusters = detectClusters(entries, 60 * 60_000);
    expect(clusters).toHaveLength(2);
  });

  it('excludes single-coin groups — a cluster needs at least 2', () => {
    const entries: TrendingEntry[] = [entry('a', 500), entry('b', 10)];
    const clusters = detectClusters(entries, 60 * 60_000);
    expect(clusters).toHaveLength(0);
  });

  it('returns no clusters for an empty list', () => {
    expect(detectClusters([], 60 * 60_000)).toEqual([]);
  });
});
