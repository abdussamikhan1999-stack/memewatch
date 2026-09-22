import whois from 'whois-json';

export function computeDomainAgeDays(creationDate: string | null): number | null {
  if (!creationDate) return null;
  const created = new Date(creationDate).getTime();
  const now = Date.now();
  return Math.floor((now - created) / (24 * 60 * 60 * 1000));
}

export async function lookupDomainAgeDays(domain: string): Promise<number | null> {
  try {
    const result = await whois(domain);
    const creationDate = (result as Record<string, unknown>).creationDate as string | undefined;
    return computeDomainAgeDays(creationDate ?? null);
  } catch {
    return null;
  }
}
