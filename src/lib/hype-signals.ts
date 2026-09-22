export interface SnapshotPoint {
  takenAt: Date;
  socialVolume: number;
  tradeVolume24h: number;
  priceUsd: number;
}

export interface SpikeResult {
  social: boolean;
  volume: boolean;
}

const SPIKE_WINDOW = 6;
const SPIKE_MULTIPLIER = 3;
const MIN_CORRELATION_SAMPLES = 20;

export function detectSpike(history: SnapshotPoint[]): SpikeResult {
  if (history.length < SPIKE_WINDOW + 1) {
    return { social: false, volume: false };
  }

  const latest = history[history.length - 1];
  const window = history.slice(-SPIKE_WINDOW - 1, -1);

  const avgSocial = average(window.map((p) => p.socialVolume));
  const avgVolume = average(window.map((p) => p.tradeVolume24h));

  return {
    social: avgSocial > 0 && latest.socialVolume > avgSocial * SPIKE_MULTIPLIER,
    volume: avgVolume > 0 && latest.tradeVolume24h > avgVolume * SPIKE_MULTIPLIER,
  };
}

export function socialPriceCorrelation(history: SnapshotPoint[]): number | null {
  if (history.length < MIN_CORRELATION_SAMPLES) {
    return null;
  }

  const socialDeltas: number[] = [];
  const priceDeltas: number[] = [];
  for (let i = 1; i < history.length; i++) {
    socialDeltas.push(history[i].socialVolume - history[i - 1].socialVolume);
    priceDeltas.push(history[i].priceUsd - history[i - 1].priceUsd);
  }

  return pearsonCorrelation(socialDeltas, priceDeltas);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = average(a);
  const meanB = average(b);

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    numerator += da * db;
    denomA += da * da;
    denomB += db * db;
  }

  const denominator = Math.sqrt(denomA * denomB);
  if (denominator === 0) return 0;
  return numerator / denominator;
}
