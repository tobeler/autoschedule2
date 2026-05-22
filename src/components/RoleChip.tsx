import type { MouseEventHandler } from 'react';
import type { Level, RoleKey } from '../types';
import { ROLES } from '../data/seed';
import { Avatar } from './Avatar';
import { useStore } from '../store';

interface RoleChipProps {
  role: RoleKey;
  level?: Level;
  assignedTo?: string | null;
  optional?: boolean;
  suggested?: boolean;
  compact?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

export function RoleChip({ role, level, assignedTo, optional, suggested, onClick, compact }: RoleChipProps) {
  const r = ROLES[role];
  const people = useStore((s) => s.people);
  if (!r) return null;
  const p = assignedTo ? people.find((x) => x.id === assignedTo) : null;
  const cls =
    'role-chip' +
    (optional ? ' optional' : '') +
    (suggested ? ' suggested' : '') +
    (compact ? ' compact' : '') +
    (onClick ? ' clickable' : '');
  return (
    <div className={cls} onClick={onClick}>
      {p ? (
        <Avatar person={p} size="xs" />
      ) : (
        <div
          className="avatar xs"
          style={{
            background: 'transparent',
            border: '1.5px dashed var(--border-strong)',
            color: 'var(--fg-subtle)',
          }}
        >
          ?
        </div>
      )}
      <span className="role-chip-text">
        <span className="role-chip-name">
          {p ? (compact ? p.initials : p.name.split(' ')[0]) : 'Unfilled'}
        </span>
        <span className="role-chip-meta">
          {r.short}
          {level ? ' ' + level : ''}
        </span>
      </span>
    </div>
  );
}
