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
export {
  REGION_LABELS,
  REGION_PREFIXES,
  normalizeRegionPrefix,
  regionPrefixFromSubRegion,
  regionPrefixFromTeamName,
  type RegionFilterValue,
  type RegionPrefix,
} from './region-core';
import {
  normalizeRegionPrefix,
  regionPrefixFromSubRegion,
  type RegionFilterValue,
  type RegionPrefix,
} from './region-core';

// Seed IDs used by the legacy demo dataset map directly to 2-letter prefixes.
// 'va' historically meant Vancouver — treat it as BC.
const SEED_ID_TO_PREFIX: Record<string, RegionPrefix> = {
  co: 'CO',
  ma: 'MA',
  bc: 'BC',
  ny: 'NY',
  ca: 'CA',
  va: 'BC',
};

/**
 * Pull a 2-letter region from a stored RegionSelection. Looks up the
 * region's short code first; falls back to interpreting the regionId
 * directly as a seed id. Returns null if the selection doesn't map.
 */
export function resolveRegionPrefix(
  regionSel: { regionId: string; subId?: string } | null | undefined,
  regions: Region[],
): RegionPrefix | null {
  if (!regionSel?.regionId) return null;
  const match = regions.find((r) => r.id === regionSel.regionId);
  if ('subId' in regionSel && regionSel.subId) {
    const sub = match?.subs.find((s) => s.id === regionSel.subId);
    if (!sub) return null;
    return regionPrefixFromSubRegion(sub);
  }
  const fromShort = normalizeRegionPrefix(match?.short);
  if (fromShort) return fromShort;
  const seed = SEED_ID_TO_PREFIX[regionSel.regionId.toLowerCase()];
  if (seed) return seed;
  return null;
}

/**
 * Hook: returns the active region prefix (or 'all') and a setter that
 * updates the global store. Use in any view that needs region filtering.
 *
 * `region` is the legacy single-region API — returns the first selected
 * prefix when exactly one is selected, or 'all' otherwise. New consumers
 * should prefer `regionSet` (multi-select).
 */
export function useRegionFilter(): {
  region: RegionFilterValue;
  regionSet: Set<RegionPrefix>;
  setRegion: (next: RegionFilterValue) => void;
  toggleRegion: (prefix: RegionPrefix) => void;
  clearRegions: () => void;
  matchesRegion: (teamName: string | null | undefined) => boolean;
} {
  const regionSel = useStore((s) => s.region);
  const regions = useStore((s) => s.regions);
  const setRegionSel = useStore((s) => s.setRegion);

  const regionSet = useMemo<Set<RegionPrefix>>(() => {
    const out = new Set<RegionPrefix>();
    if (regionSel?.regionPrefixes?.length) {
      for (const raw of regionSel.regionPrefixes) {
        const norm = normalizeRegionPrefix(raw);
        if (norm) out.add(norm);
      }
      return out;
    }
    const single = resolveRegionPrefix(regionSel, regions);
    if (single) out.add(single);
    return out;
  }, [regionSel, regions]);

  const region: RegionFilterValue = useMemo(() => {
    if (regionSet.size === 1) {
      const [first] = regionSet;
      return first;
    }
    return 'all';
  }, [regionSet]);

  function setRegion(next: RegionFilterValue) {
    if (next === 'all') {
      setRegionSel({ regionId: '', subId: '', regionPrefixes: [] });
      return;
    }
    const match = regions.find((r) => normalizeRegionPrefix(r.short) === next);
    setRegionSel({
      regionId: match ? match.id : next.toLowerCase(),
      subId: '',
      regionPrefixes: [next],
    });
  }

  function toggleRegion(prefix: RegionPrefix) {
    const norm = normalizeRegionPrefix(prefix);
    if (!norm) return;
    const next = new Set(regionSet);
    if (next.has(norm)) next.delete(norm);
    else next.add(norm);
    const list = Array.from(next);
    setRegionSel({
      regionId: list[0]
        ? regions.find((r) => normalizeRegionPrefix(r.short) === list[0])?.id ?? list[0].toLowerCase()
        : '',
      subId: '',
      regionPrefixes: list,
    });
  }

  function clearRegions() {
    setRegionSel({ regionId: '', subId: '', regionPrefixes: [] });
  }

  function matchesRegion(teamName: string | null | undefined): boolean {
    if (regionSet.size === 0) return true;
    const prefix = normalizeRegionPrefix(teamName);
    return prefix != null && regionSet.has(prefix);
  }

  return { region, regionSet, setRegion, toggleRegion, clearRegions, matchesRegion };
}
