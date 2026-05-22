import { Icon } from './Icon';
import { useStore } from '../store';

interface AttentionPillProps {
  urgentCount: number;
  totalCount: number;
  active: boolean;
}

export function AttentionPill({ urgentCount, totalCount, active }: AttentionPillProps) {
  const setTab = useStore((s) => s.setTab);
  const cls =
    'attention-pill' +
    (urgentCount > 0 ? ' urgent' : totalCount ? ' warn' : ' ok') +
    (active ? ' active' : '');
  return (
    <button
      className={cls}
      onClick={() => setTab('attention')}
      title={totalCount ? totalCount + ' items need attention' : 'Nothing needs attention'}
    >
      <Icon name={urgentCount > 0 ? 'alert_circle' : 'bell'} size={13} />
      <span className="attention-pill-label">Attention</span>
      {totalCount ? (
        <span className="attention-pill-count">{totalCount}</span>
      ) : (
        <Icon name="check" size={11} stroke="currentColor" strokeWidth={2.5} />
      )}
    </button>
  );
}
