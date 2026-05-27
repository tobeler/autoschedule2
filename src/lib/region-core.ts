import type { SubRegion } from '@/types';

export type RegionPrefix = 'CO' | 'MA' | 'BC' | 'NY' | 'CA';
export type RegionFilterValue = 'all' | RegionPrefix;

export const REGION_PREFIXES: readonly RegionPrefix[] = ['CO', 'MA', 'BC', 'NY', 'CA'];

export const REGION_LABELS: Record<RegionPrefix, string> = {
  CO: 'Colorado',
  MA: 'Massachusetts',
  BC: 'British Columbia',
  NY: 'New York',
  CA: 'California',
};

export function normalizeRegionPrefix(value: string | null | undefined): RegionPrefix | null {
  const text = (value ?? '').trim().toUpperCase();
  if (!text) return null;

  for (const prefix of REGION_PREFIXES) {
    if (
      text === prefix ||
      text.startsWith(prefix + '-') ||
      text.startsWith(prefix + ' -') ||
      text.startsWith(prefix + ' ')
    ) {
      return prefix;
    }
  }

  for (const prefix of REGION_PREFIXES) {
    if (text.startsWith('DISPATCH ' + prefix)) return prefix;
  }

  if (
    text.includes('COLORADO') ||
    text.includes('DENVER') ||
    text.includes('LOVELAND') ||
    text.includes('GRAND JUNCTION')
  ) {
    return 'CO';
  }
  if (text.includes('MASSACHUSETTS') || text.includes('BOSTON')) return 'MA';
  if (text.includes('BRITISH COLUMBIA') || text.includes('VANCOUVER')) return 'BC';
  if (text.includes('NEW YORK') || text.includes('WHITE PLAINS')) return 'NY';
  if (text.includes('CALIFORNIA') || text.includes('SACRAMENTO')) return 'CA';
  return null;
}

export function regionPrefixFromSubRegion(sub: SubRegion | null | undefined): RegionPrefix | null {
  if (!sub) return null;
  return normalizeRegionPrefix(sub.short) ?? normalizeRegionPrefix(sub.name) ?? normalizeRegionPrefix(sub.id);
}

export function regionPrefixFromTeamName(teamName: string | null | undefined): RegionPrefix | null {
  return normalizeRegionPrefix(teamName);
}
