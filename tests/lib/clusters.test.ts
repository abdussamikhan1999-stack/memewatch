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

  it('bounds the cluster to the window from the group start, not just consecutive gaps', () => {
    // Consecutive gaps are all 25min (under the 60min window), so the old
    // buggy code (which only checked the previous neighbor) would chain all
    // four into one cluster spanning 75min. Traced by hand: sorted oldest
    // first is d(75), c(50), b(25), a(0). d/c/b chain together (span from d
    // to b is 50min, within window); a breaks off (span from d to a is
    // 75min, over window) and is dropped as a singleton (<2 members).
    const entries: TrendingEntry[] = [entry('a', 0), entry('b', 25), entry('c', 50), entry('d', 75)];
    const clusters = detectClusters(entries, 60 * 60_000);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].coinIds.sort()).toEqual(['b', 'c', 'd']);
  });
});
