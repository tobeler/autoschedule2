// =============================================================
// Shared table sort + filter helpers used by Jobs / Projects /
// Customers / Technicians / Crews / Trucks list views. Pure utility —
// no React, no DOM. The list views own their column definitions; this
// module just gives them the comparators and predicates so the
// behavior is identical site-wide.
// =============================================================

export type SortDir = 'asc' | 'desc';

export interface SortState<TKey extends string = string> {
  key: TKey;
  dir: SortDir;
}

/**
 * Toggle through a column header click cycle: unset → asc → desc → asc → …
 * Caller passes the previous sort state and the clicked column key.
 */
export function nextSort<TKey extends string>(
  prev: SortState<TKey> | null,
  key: TKey,
): SortState<TKey> {
  if (!prev || prev.key !== key) return { key, dir: 'asc' };
  return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
}

/**
 * Compare two rows using a value-extractor function. Nulls/undefined sort
 * to the end regardless of direction. Strings use locale compare. Numbers
 * and dates use natural ordering.
 */
export function compareBy<T>(
  a: T,
  b: T,
  extract: (row: T) => unknown,
  dir: SortDir,
): number {
  const av = extract(a);
  const bv = extract(b);
  const aNull = av == null || av === '';
  const bNull = bv == null || bv === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1; // nulls always to the end
  if (bNull) return -1;

  let cmp = 0;
  if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
  else if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
  else cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' });

  return dir === 'asc' ? cmp : -cmp;
}

/**
 * Build a sort function compatible with Array.prototype.sort.
 */
export function makeSorter<T, TKey extends string>(
  state: SortState<TKey> | null,
  extractors: Record<TKey, (row: T) => unknown>,
): (a: T, b: T) => number {
  if (!state) return () => 0;
  const extract = extractors[state.key];
  if (!extract) return () => 0;
  return (a, b) => compareBy(a, b, extract, state.dir);
}

/**
 * Tokenize a search query: lowercases, splits on whitespace, drops empty
 * tokens. Used by `matchesSearch` so multi-word queries like "denver heat
 * pump" all have to match somewhere in the searchable text.
 */
export function tokenizeQuery(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Returns true if every token in `tokens` appears (case-insensitive) in
 * any of the haystack strings.
 */
export function matchesSearch(haystack: Array<string | null | undefined>, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const joined = haystack.filter(Boolean).join(' ').toLowerCase();
  return tokens.every((t) => joined.includes(t));
}

/**
 * Useful for chip-style multi-select filters. Returns true if `value` is
 * in the active set, OR the active set is empty (meaning "all").
 */
export function chipMatches<V>(active: Set<V>, value: V | null | undefined): boolean {
  if (active.size === 0) return true;
  if (value == null) return false;
  return active.has(value);
}
