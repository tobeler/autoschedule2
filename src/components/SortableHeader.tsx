// =============================================================
// SortableHeader — th cell that toggles sort direction on click.
// Used by every list view so the sort UX is consistent.
// =============================================================
import { Icon } from './Icon';
import type { SortState } from '../lib/table';

interface Props<TKey extends string = string> {
  label: string;
  sortKey: TKey;
  state: SortState<TKey> | null;
  onClick: (key: TKey) => void;
  /** Right-align numbers / dates. */
  align?: 'left' | 'right';
}

export function SortableHeader<TKey extends string = string>({
  label,
  sortKey,
  state,
  onClick,
  align = 'left',
}: Props<TKey>) {
  const active = state?.key === sortKey;
  const dir = active ? state!.dir : null;
  return (
    <th
      onClick={() => onClick(sortKey)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        textAlign: align,
        whiteSpace: 'nowrap',
      }}
      aria-sort={
        active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {active ? (
          <Icon
            name={dir === 'asc' ? 'chevron_up' : 'chevron_down'}
            size={11}
          />
        ) : (
          <span style={{ opacity: 0.3, fontSize: 11 }}>↕</span>
        )}
      </span>
    </th>
  );
}
