import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectWalletCluster, parseDeployerHistory } from '@/lib/sources/helius';
import transfersFixture from '../../fixtures/helius-transfers.json';

describe('parseDeployerHistory', () => {
  it('counts prior launches and rugs from a list of token outcomes', () => {
    const result = parseDeployerHistory([
      { outcome: 'rugged' },
      { outcome: 'active' },
      { outcome: 'rugged' },
      { outcome: 'abandoned' },
    ]);
    expect(result).toEqual({ priorLaunches: 4, rugCount: 2 });
  });

  it('handles a deployer with no prior launches', () => {
    expect(parseDeployerHistory([])).toEqual({ priorLaunches: 0, rugCount: 0 });
  });
});

describe('detectWalletCluster', () => {
  it('flags true when two or more holders share a funding source', async () => {
    const fetchTransfers = vi.fn().mockResolvedValue(transfersFixture);
    const result = await detectWalletCluster(
      ['HolderWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'HolderWalletBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'HolderWalletCCCCCCCCCCCCCCCCCCCCCCCCCCCC'],
      fetchTransfers
    );
    expect(result).toBe(true);
  });

  it('flags false when every holder has a distinct funding source', async () => {
    const distinctTransfers = [
      { source: 'WalletOneXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', destination: 'HolderWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAA', amount: 1 },
      { source: 'WalletTwoXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', destination: 'HolderWalletBBBBBBBBBBBBBBBBBBBBBBBBBBBB', amount: 1 },
    ];
    const fetchTransfers = vi.fn().mockResolvedValue(distinctTransfers);
    const result = await detectWalletCluster(
      ['HolderWalletAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'HolderWalletBBBBBBBBBBBBBBBBBBBBBBBBBBBB'],
      fetchTransfers
    );
    expect(result).toBe(false);
  });
});
