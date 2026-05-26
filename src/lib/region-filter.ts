// =============================================================
// useRegionFilter — single source of truth for region filtering.
//
// All views (DispatchView, JobsView, ProjectsView, TechniciansView,
// CrewsView) plus the topbar RegionPicker read + write the same
// underlying `store.region` selection through this hook. Picking
// "CO" anywhere flows to all views simultaneously.
//
// Returns a 2-letter region code or 'all'. Translation between the
// `RegionSelection` shape ({ regionId, subId }) and the simple chip
// values is centralized here so each view doesn't reinvent the
// mapping (which was the source of inconsistencies in earlier
// phases).
// =============================================================
import { useMemo } from 'react';

import { useStore } from '@/store';
import type { Region } from '@/types';

export type RegionPrefix = 'CO' | 'MA' | 'BC' | 'NY';
export type RegionFilterValue = 'all' | RegionPrefix;

const VALID_PREFIXES: readonly RegionPrefix[] = ['CO', 'MA', 'BC', 'NY'];

// Seed IDs used by the legacy demo dataset map directly to 2-letter prefixes.
// 'va' historically meant Vancouver — treat it as BC.
const SEED_ID_TO_PREFIX: Record<string, RegionPrefix> = {
  co: 'CO',
  ma: 'MA',
  bc: 'BC',
  ny: 'NY',
  va: 'BC',
};

/**
 * Pull a 2-letter region from a stored RegionSelection. Looks up the
 * region's short code first; falls back to interpreting the regionId
 * directly as a seed id. Returns null if the selection doesn't map.
 */
export function resolveRegionPrefix(
  regionSel: { regionId: string } | null | undefined,
  regions: Region[],
): RegionPrefix | null {
  if (!regionSel?.regionId) return null;
  const match = regions.find((r) => r.id === regionSel.regionId);
  const fromShort = match?.short?.toUpperCase() ?? '';
  if ((VALID_PREFIXES as readonly string[]).includes(fromShort)) {
    return fromShort as RegionPrefix;
  }
  const seed = SEED_ID_TO_PREFIX[regionSel.regionId.toLowerCase()];
  if (seed) return seed;
  return null;
}

/**
 * Hook: returns the active region prefix (or 'all') and a setter that
 * updates the global store. Use in any view that needs region filtering.
 */
export function useRegionFilter(): {
  region: RegionFilterValue;
  setRegion: (next: RegionFilterValue) => void;
} {
  const regionSel = useStore((s) => s.region);
  const regions = useStore((s) => s.regions);
  const setRegionSel = useStore((s) => s.setRegion);

  const region: RegionFilterValue = useMemo(() => {
    return resolveRegionPrefix(regionSel, regions) ?? 'all';
  }, [regionSel, regions]);

  function setRegion(next: RegionFilterValue) {
    if (next === 'all') {
      setRegionSel({ regionId: '', subId: '' });
      return;
    }
    // Prefer a real region row whose short matches (HubSpot-sourced); fall
    // back to the seed id convention so the picker still works in seed-only
    // environments.
    const match = regions.find((r) => r.short?.toUpperCase() === next);
    if (match) {
      setRegionSel({ regionId: match.id, subId: '' });
    } else {
      setRegionSel({ regionId: next.toLowerCase(), subId: '' });
    }
  }

  return { region, setRegion };
}
