import type { MouseEventHandler } from 'react';
import { Icon, type IconName } from './Icon';

interface IconButtonProps {
  icon: IconName;
  label: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  variant?: 'ghost' | 'solid' | 'primary' | 'danger';
  size?: 'sm' | 'md';
  className?: string;
}

export function IconButton({ icon, label, onClick, variant = 'ghost', size = 'md', className = '' }: IconButtonProps) {
  return (
    <button
      className={'btn btn-' + variant + ' btn-icon ' + className}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <Icon name={icon} size={size === 'sm' ? 14 : 16} />
    </button>
  );
}
