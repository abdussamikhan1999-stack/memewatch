import { describe, it, expect } from 'vitest';
import { parseLunarCrushTopic } from '@/lib/sources/lunarcrush';
import fixture from '../../fixtures/lunarcrush-topic.json';

describe('parseLunarCrushTopic', () => {
  it('parses a raw LunarCrush response into SocialData', () => {
    const result = parseLunarCrushTopic(fixture);
    expect(result).toEqual({
      socialVolume: 5400,
      socialSentiment: 78,
      isTrending: true,
    });
  });
});
