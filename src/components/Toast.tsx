import { Icon } from './Icon';
import { useStore } from '../store';

export function Toast() {
  const toast = useStore((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="toast">
      <Icon name="check" size={14} stroke="var(--jetson-green)" />
      <span>{toast}</span>
    </div>
  );
}
