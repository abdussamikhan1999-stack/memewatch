export interface RiskInputs {
  liquidityLocked: boolean;
  mintAuthorityActive: boolean;
  freezeAuthorityActive: boolean;
  top10HolderPct: number;
  deployerRugCount: number;
  walletClusterFlag: boolean;
  twitterAccountAgeDays: number | null;
  domainAgeDays: number | null;
}

export type FlagLevel = 'green' | 'yellow' | 'red';

export interface RiskFlag {
  label: string;
  level: FlagLevel;
  detail: string;
}

export interface RiskResult {
  score: number;
  flags: RiskFlag[];
}

const YOUNG_ACCOUNT_DAYS = 7;

export function computeRiskScore(inputs: RiskInputs): RiskResult {
  const flags: RiskFlag[] = [];
  let deduction = 0;

  if (inputs.liquidityLocked) {
    flags.push({ label: 'Liquidity lock', level: 'green', detail: 'Liquidity is locked or burned' });
  } else {
    deduction += 25;
    flags.push({ label: 'Liquidity lock', level: 'red', detail: 'Liquidity is not locked — creator can withdraw it' });
  }

  if (inputs.mintAuthorityActive) {
    deduction += 20;
    flags.push({ label: 'Mint authority', level: 'red', detail: 'Creator can still mint new supply' });
  } else {
    flags.push({ label: 'Mint authority', level: 'green', detail: 'Mint authority renounced' });
  }

  if (inputs.freezeAuthorityActive) {
    deduction += 15;
    flags.push({ label: 'Freeze authority', level: 'red', detail: 'Creator can still freeze holder wallets' });
  } else {
    flags.push({ label: 'Freeze authority', level: 'green', detail: 'Freeze authority renounced' });
  }

  if (inputs.top10HolderPct > 70) {
    deduction += 20;
    flags.push({
      label: 'Holder concentration',
      level: 'red',
      detail: `Top 10 holders own ${inputs.top10HolderPct}% of supply`,
    });
  } else if (inputs.top10HolderPct > 40) {
    deduction += 10;
    flags.push({
      label: 'Holder concentration',
      level: 'yellow',
      detail: `Top 10 holders own ${inputs.top10HolderPct}% of supply`,
    });
  } else {
    flags.push({
      label: 'Holder concentration',
      level: 'green',
      detail: `Top 10 holders own ${inputs.top10HolderPct}% of supply`,
    });
  }

  if (inputs.deployerRugCount > 0) {
    deduction += Math.min(inputs.deployerRugCount * 15, 30);
    flags.push({
      label: 'Deployer history',
      level: 'red',
      detail: `Deployer wallet linked to ${inputs.deployerRugCount} prior rugged token(s)`,
    });
  } else {
    flags.push({ label: 'Deployer history', level: 'green', detail: 'No prior rugged tokens found for this deployer' });
  }

  if (inputs.walletClusterFlag) {
    deduction += 10;
    flags.push({
      label: 'Wallet clustering',
      level: 'red',
      detail: 'Multiple top holders trace back to the same funding wallet',
    });
  } else {
    flags.push({ label: 'Wallet clustering', level: 'green', detail: 'No shared funding source detected among top holders' });
  }

  flags.push(ageFlag('Social account age', inputs.twitterAccountAgeDays));
  flags.push(ageFlag('Domain age', inputs.domainAgeDays));
  if (inputs.twitterAccountAgeDays !== null && inputs.twitterAccountAgeDays < YOUNG_ACCOUNT_DAYS) deduction += 5;
  if (inputs.domainAgeDays !== null && inputs.domainAgeDays < YOUNG_ACCOUNT_DAYS) deduction += 5;

  const score = Math.max(0, Math.min(100, 100 - deduction));
  return { score, flags };
}

function ageFlag(label: string, ageDays: number | null): RiskFlag {
  if (ageDays === null) {
    return { label, level: 'yellow', detail: 'Not found — could not verify' };
  }
  if (ageDays < YOUNG_ACCOUNT_DAYS) {
    return { label, level: 'red', detail: `Only ${ageDays} day(s) old` };
  }
  return { label, level: 'green', detail: `${ageDays} day(s) old` };
}
