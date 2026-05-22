// =============================================================
// Routing — drive-time + route optimization heuristics.
// Swap-in seam: replace estimateDriveTime with Google Maps Distance Matrix.
// =============================================================
import type { Job } from '../types';

const CITY_COORDS: Record<string, [number, number]> = {
  Newton: [42.337, -71.21],
  Brookline: [42.331, -71.121],
  Cambridge: [42.373, -71.11],
  Somerville: [42.387, -71.099],
  Boston: [42.36, -71.058],
  Arlington: [42.415, -71.158],
  Watertown: [42.371, -71.183],
  Belmont: [42.396, -71.178],
  Medford: [42.418, -71.107],
};

function cityFromAddress(addr: string): string | null {
  // Address format: "142 Elm Ridge Rd · Newton, MA" or "8 Mass Ave · Cambridge"
  const after = addr.split('·')[1]?.trim();
  if (!after) return null;
  return after.split(',')[0]?.trim() ?? null;
}

function haversine([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const R = 3959; // miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface DriveEstimate {
  minutes: number;
  miles: number;
}

export function estimateDriveTime(fromAddr: string, toAddr: string): DriveEstimate {
  const from = cityFromAddress(fromAddr);
  const to = cityFromAddress(toAddr);
  if (!from || !to || from === to) return { minutes: 10, miles: 2 };
  const c1 = CITY_COORDS[from];
  const c2 = CITY_COORDS[to];
  if (!c1 || !c2) return { minutes: 18, miles: 8 };
  const miles = haversine(c1, c2);
  // Urban average ~25mph including stops
  const minutes = Math.max(8, Math.round((miles / 25) * 60));
  return { minutes, miles: Math.round(miles * 10) / 10 };
}

/** Nearest-neighbor reorder of a crew's day starting from the first job. */
export function optimizeRouteForCrew(jobs: Job[]): Job[] {
  if (jobs.length <= 1) return jobs;
  const sorted = [...jobs].sort((a, b) => (a.startHour ?? 0) - (b.startHour ?? 0));
  const result: Job[] = [sorted[0]];
  const pool = sorted.slice(1);
  while (pool.length > 0) {
    const last = result[result.length - 1];
    let bestIdx = 0;
    let bestMin = Infinity;
    pool.forEach((candidate, i) => {
      const est = estimateDriveTime(last.address, candidate.address);
      if (est.minutes < bestMin) {
        bestMin = est.minutes;
        bestIdx = i;
      }
    });
    result.push(pool[bestIdx]);
    pool.splice(bestIdx, 1);
  }
  return result;
}
