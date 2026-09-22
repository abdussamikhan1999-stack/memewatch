import { describe, it, expect } from 'vitest';
import { computeRiskScore, type RiskInputs } from '@/lib/risk-score';

const safeInputs: RiskInputs = {
  liquidityLocked: true,
  mintAuthorityActive: false,
  freezeAuthorityActive: false,
  top10HolderPct: 20,
  deployerRugCount: 0,
  walletClusterFlag: false,
  twitterAccountAgeDays: 400,
  domainAgeDays: 400,
};

describe('computeRiskScore', () => {
  it('scores a clean coin near 100', () => {
    const result = computeRiskScore(safeInputs);
    expect(result.score).toBe(100);
    expect(result.flags.every((f) => f.level !== 'red')).toBe(true);
  });

  it('penalizes unlocked liquidity as red', () => {
    const result = computeRiskScore({ ...safeInputs, liquidityLocked: false });
    expect(result.score).toBe(75);
    expect(result.flags.find((f) => f.label === 'Liquidity lock')?.level).toBe('red');
  });

  it('penalizes an active mint authority as red', () => {
    const result = computeRiskScore({ ...safeInputs, mintAuthorityActive: true });
    expect(result.score).toBe(80);
  });

  it('flags high holder concentration red, moderate as yellow', () => {
    const high = computeRiskScore({ ...safeInputs, top10HolderPct: 80 });
    const moderate = computeRiskScore({ ...safeInputs, top10HolderPct: 50 });
    expect(high.flags.find((f) => f.label === 'Holder concentration')?.level).toBe('red');
    expect(moderate.flags.find((f) => f.label === 'Holder concentration')?.level).toBe('yellow');
  });

  it('caps the rug-history deduction at 30 points', () => {
    const result = computeRiskScore({ ...safeInputs, deployerRugCount: 10 });
    expect(result.score).toBe(70);
  });

  it('flags unknown social/domain age as yellow, not red', () => {
    const result = computeRiskScore({
      ...safeInputs,
      twitterAccountAgeDays: null,
      domainAgeDays: null,
    });
    expect(result.flags.find((f) => f.label === 'Social account age')?.level).toBe('yellow');
    expect(result.flags.find((f) => f.label === 'Domain age')?.level).toBe('yellow');
  });

  it('flags unknown deployer history as yellow with no deduction', () => {
    const result = computeRiskScore({ ...safeInputs, deployerRugCount: null });
    expect(result.score).toBe(100);
    expect(result.flags.find((f) => f.label === 'Deployer history')).toEqual({
      label: 'Deployer history',
      level: 'yellow',
      detail: 'Not investigated yet',
    });
  });

  it('flags unknown wallet clustering as yellow with no deduction', () => {
    const result = computeRiskScore({ ...safeInputs, walletClusterFlag: null });
    expect(result.score).toBe(100);
    expect(result.flags.find((f) => f.label === 'Wallet clustering')).toEqual({
      label: 'Wallet clustering',
      level: 'yellow',
      detail: 'Not investigated yet',
    });
  });

  it('never returns a score below 0', () => {
    const result = computeRiskScore({
      liquidityLocked: false,
      mintAuthorityActive: true,
      freezeAuthorityActive: true,
      top10HolderPct: 95,
      deployerRugCount: 10,
      walletClusterFlag: true,
      twitterAccountAgeDays: 1,
      domainAgeDays: 1,
    });
    expect(result.score).toBe(0);
  });
});
