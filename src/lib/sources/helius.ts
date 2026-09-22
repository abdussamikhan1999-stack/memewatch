export interface DeployerHistory {
  priorLaunches: number;
  rugCount: number;
}

export interface TokenOutcome {
  outcome: 'rugged' | 'abandoned' | 'active';
}

export function parseDeployerHistory(outcomes: TokenOutcome[]): DeployerHistory {
  return {
    priorLaunches: outcomes.length,
    rugCount: outcomes.filter((o) => o.outcome === 'rugged').length,
  };
}

interface Transfer {
  source: string;
  destination: string;
  amount: number;
}

type FetchTransfersFn = (destinations: string[]) => Promise<Transfer[]>;

export async function detectWalletCluster(
  holderWallets: string[],
  fetchTransfers: FetchTransfersFn = defaultFetchTransfers
): Promise<boolean> {
  const transfers = await fetchTransfers(holderWallets);
  const sourceCounts = new Map<string, Set<string>>();

  for (const t of transfers) {
    if (!holderWallets.includes(t.destination)) continue;
    const destinations = sourceCounts.get(t.source) ?? new Set<string>();
    destinations.add(t.destination);
    sourceCounts.set(t.source, destinations);
  }

  for (const destinations of sourceCounts.values()) {
    if (destinations.size >= 2) return true;
  }
  return false;
}

async function defaultFetchTransfers(destinations: string[]): Promise<Transfer[]> {
  const res = await fetch(`https://api.helius.xyz/v0/addresses/batch-transfers?api-key=${process.env.HELIUS_API_KEY ?? ''}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses: destinations }),
  });
  if (!res.ok) {
    throw new Error(`Helius request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
