// =============================================================
// AttentionCTA — compact pill above the calendar that jumps to the
// full Needs-Attention workbench. Mirrors view-attention.jsx::AttentionCta.
// =============================================================
import { Icon } from '../../components/Icon';
import { useStore } from '../../store';
import { buildAttentionItems } from '../attention/AttentionView';

export function AttentionCTA() {
  const setTab = useStore((s) => s.setTab);
  const items = buildAttentionItems();
  const urgent = items.filter((i) => i.sev === 'urgent').length;
  const warn = items.filter((i) => i.sev === 'warn').length;
  const total = items.length;

  function open() {
    setTab('attention');
  }

  if (total === 0) {
    return (
      <div
        className="attention-cta"
        onClick={open}
        role="button"
        tabIndex={0}
        style={{ cursor: 'pointer' }}
      >
        <span className="lead zero">
          <span className="ic">
            <Icon name="check" size={12} stroke="#1A6F2E" strokeWidth={2.5} />
          </span>
          All clear
        </span>
        <span className="summary">No exceptions on today's board.</span>
      </div>
    );
  }

  const top = items.slice(0, 2);

  return (
    <div
      className="attention-cta"
      onClick={open}
      role="button"
      tabIndex={0}
      style={{ cursor: 'pointer' }}
    >
      <span className="lead">
        <span className="ic">
          <Icon name="alert_circle" size={12} />
        </span>
        Needs attention · {total}
      </span>
      <span className="summary">
        {urgent > 0 && (
          <strong style={{ color: '#C53030' }}>{urgent} urgent</strong>
        )}
        {urgent > 0 && warn > 0 && <span className="sep">·</span>}
        {warn > 0 && <strong>{warn} today</strong>}
        <span className="sep">·</span>
        <em>{top[0]?.title}</em>
        {top[1] && (
          <>
            <span className="sep">·</span>
            <em>{top[1].title}</em>
          </>
        )}
      </span>
      <button
        className="btn btn-dark btn-sm open"
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
      >
        Open workbench
        <Icon name="chevron_right" size={12} />
      </button>
    </div>
  );
}
