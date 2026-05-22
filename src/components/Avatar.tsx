import type { CSSProperties } from 'react';
import type { Person } from '../types';
import { useStore } from '../store';

type Size = 'xs' | 'sm' | 'md' | 'lg';

interface AvatarProps {
  /** Pass a Person object, or the id string of a person. */
  person: Person | string | null | undefined;
  size?: Size;
  color?: string;
  style?: CSSProperties;
}

export function Avatar({ person, size = 'sm', color, style }: AvatarProps) {
  const lookup = useStore((s) => s.people);
  const p = typeof person === 'string' ? lookup.find((x) => x.id === person) : person;
  if (!p) return null;
  const initials = p.initials || p.name.split(' ').map((s) => s[0]).slice(0, 2).join('');
  return (
    <div
      className={'avatar ' + size}
      title={p.name}
      style={color ? { background: color, ...style } : style}
    >
      {initials}
    </div>
  );
}
