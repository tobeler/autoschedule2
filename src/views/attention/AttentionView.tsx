// =============================================================
// Needs-Attention workbench — list + per-item detail pane.
// =============================================================
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useStore } from '../../store';
import {
  buildAttentionItems,
  CATEGORY_META,
  SEV_LABEL,
  type AttentionCategory,
  type AttentionItem,
  type AttentionSev,
} from './buildAttentionItems';
import {
  rankAttentionItemsByImpact,
  type AttentionImpact,
} from './rankAttentionImpact';

export { buildAttentionItems } from './buildAttentionItems';
export type { AttentionItem, AttentionSev, AttentionCategory } from './buildAttentionItems';

type SevFilter = AttentionSev | 'all';
type CatFilter = AttentionCategory | 'all';
type SortMode = 'default' | 'impact';
type ViewAttentionItem = AttentionItem & { impact?: AttentionImpact };

export function AttentionView() {
  const setTab = useStore((s) => s.setTab);
  const selectJob = useStore((s) => s.selectJob);
  const openSmartSchedule = useStore((s) => s.openSmartSchedule);
  const pushToast = useStore((s) => s.pushToast);
  const jobs = useStore((s) => s.jobs);
  const projects = useStore((s) => s.projects);
  const customers = useStore((s) => s.customers);
  const people = useStore((s) => s.people);
  const crews = useStore((s) => s.crews);
  const timeOff = useStore((s) => s.timeOff);

  // Rebuild list whenever the underlying store snapshot changes.
  const baseItems = useMemo(
    () => buildAttentionItems({ jobs, customers, people, crews, timeOff }),
    [jobs, customers, people, crews, timeOff],
  );

  const [sevFilter, setSevFilter] = useState<SevFilter>('all');
  const [catFilter, setCatFilter] = useState<CatFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('impact');
  const [resolved, setResolved] = useState<Record<string, boolean>>({});
  const [snoozed, setSnoozed] = useState<Record<string, boolean>>({});

  const allItems: ViewAttentionItem[] = useMemo(() => {
    if (sortMode === 'impact') {
      return rankAttentionItemsByImpact(baseItems, {
        jobs,
        projects,
        customers,
        people,
        crews,
        timeOff,
      });
    }
    return baseItems;
  }, [baseItems, sortMode, jobs, projects, customers, people, crews, timeOff]);

  const visible = allItems.filter((it) => {
    if (snoozed[it.id]) return false;
    if (sevFilter !== 'all' && it.sev !== sevFilter) return false;
    if (catFilter !== 'all' && it.cat !== catFilter) return false;
    return true;
  });

  const [selectedId, setSelectedId] = useState<string | null>(allItems[0]?.id || null);

  // If the selected item gets filtered out, fall back to first visible
  useEffect(() => {
    if (!visible.find((v) => v.id === selectedId)) {
      setSelectedId(visible[0]?.id || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sevFilter, catFilter, Object.keys(snoozed).length, Object.keys(resolved).length, allItems.length]);

  const counts = {
    urgent: allItems.filter((i) => i.sev === 'urgent' && !snoozed[i.id]).length,
    warn: allItems.filter((i) => i.sev === 'warn' && !snoozed[i.id]).length,
    info: allItems.filter((i) => i.sev === 'info' && !snoozed[i.id]).length,
  };
  const total = counts.urgent + counts.warn + counts.info;

  const grouped = useMemo(() => {
    const map: Partial<Record<AttentionCategory, ViewAttentionItem[]>> = {};
    visible.forEach((it) => {
      const list = map[it.cat] || (map[it.cat] = []);
      list.push(it);
    });
    return (Object.keys(CATEGORY_META) as AttentionCategory[])
      .filter((k) => map[k])
      .map((k) => ({ cat: k, items: map[k]! }));
  }, [visible]);

  const selected = allItems.find((i) => i.id === selectedId) || null;

  function resolveItem(id: string) {
    setResolved((r) => ({ ...r, [id]: true }));
    pushToast('Resolved · undo');
    const remaining = visible.filter((v) => v.id !== id);
    setSelectedId(remaining[0]?.id || null);
  }
  function snoozeItem(id: string) {
    setSnoozed((s) => ({ ...s, [id]: true }));
    pushToast('Snoozed · revisit in 1 hour');
    const remaining = visible.filter((v) => v.id !== id);
    setSelectedId(remaining[0]?.id || null);
  }

  function jumpToJob(jobId: string) {
    selectJob(jobId);
    setTab('dispatch');
  }

  return (
    <div className="att-view">
      {/* HEADER */}
      <div className="att-header">
        <div>
          <h1>Needs attention</h1>
          <div className="sub">
            <span>
              {total} open item{total === 1 ? '' : 's'} across today and this week
            </span>
            {counts.urgent > 0 && (
              <span style={{ color: '#C53030', fontWeight: 600 }}>· {counts.urgent} urgent</span>
            )}
            {total === 0 && (
              <span style={{ color: '#1A6F2E', fontWeight: 600 }}>· all clear</span>
            )}
          </div>
        </div>
        <div className="att-counts">
          <button
            className={'att-count urgent' + (sevFilter === 'urgent' ? ' active' : '')}
            onClick={() => setSevFilter(sevFilter === 'urgent' ? 'all' : 'urgent')}
          >
            <span className="v">{counts.urgent}</span>
            <span className="l">Urgent</span>
          </button>
          <button
            className={'att-count warn' + (sevFilter === 'warn' ? ' active' : '')}
            onClick={() => setSevFilter(sevFilter === 'warn' ? 'all' : 'warn')}
          >
            <span className="v">{counts.warn}</span>
            <span className="l">Today</span>
          </button>
          <button
            className={'att-count info' + (sevFilter === 'info' ? ' active' : '')}
            onClick={() => setSevFilter(sevFilter === 'info' ? 'all' : 'info')}
          >
            <span className="v">{counts.info}</span>
            <span className="l">FYI</span>
          </button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="att-toolbar">
        <span className="filter-label">Severity</span>
        <div className="seg">
          <button
            className={sevFilter === 'all' ? 'active' : ''}
            onClick={() => setSevFilter('all')}
          >
            All
          </button>
          <button
            className={sevFilter === 'urgent' ? 'active' : ''}
            onClick={() => setSevFilter('urgent')}
          >
            Urgent
          </button>
          <button
            className={sevFilter === 'warn' ? 'active' : ''}
            onClick={() => setSevFilter('warn')}
          >
            Today
          </button>
          <button
            className={sevFilter === 'info' ? 'active' : ''}
            onClick={() => setSevFilter('info')}
          >
            FYI
          </button>
        </div>
        <span className="filter-label" style={{ marginLeft: 12 }}>
          Category
        </span>
        <div className="seg">
          <button
            className={catFilter === 'all' ? 'active' : ''}
            onClick={() => setCatFilter('all')}
          >
            All
          </button>
          {(Object.entries(CATEGORY_META) as [AttentionCategory, typeof CATEGORY_META[AttentionCategory]][]).map(
            ([k, m]) => (
              <button
                key={k}
                className={catFilter === k ? 'active' : ''}
                onClick={() => setCatFilter(k)}
              >
                {m.label}
              </button>
            ),
          )}
        </div>
        <span className="filter-label" style={{ marginLeft: 12 }}>
          Rank
        </span>
        <div className="seg">
          <button
            className={sortMode === 'default' ? 'active' : ''}
            onClick={() => setSortMode('default')}
          >
            Default
          </button>
          <button
            className={sortMode === 'impact' ? 'active' : ''}
            onClick={() => setSortMode('impact')}
          >
            Impact
          </button>
        </div>
        <div
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            color: 'var(--fg-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Icon name="clock" size={13} />
          <span>Loaded from dispatcher data</span>
          {Object.keys(resolved).length > 0 && (
            <button className="btn btn-ghost btn-sm muted" onClick={() => setResolved({})}>
              Undo {Object.keys(resolved).length} resolved
            </button>
          )}
          {Object.keys(snoozed).length > 0 && (
            <button className="btn btn-ghost btn-sm muted" onClick={() => setSnoozed({})}>
              Unsnooze {Object.keys(snoozed).length}
            </button>
          )}
        </div>
      </div>

      {/* MAIN */}
      <div className={'att-main' + (visible.length === 0 ? ' no-detail' : '')}>
        <div className="att-list">
          {grouped.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 60,
                textAlign: 'center',
                color: 'var(--fg-muted)',
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: 'rgba(60,213,103,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <Icon name="check" size={32} stroke="#1A6F2E" strokeWidth={2.5} />
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: 22,
                  color: 'var(--forest)',
                  marginBottom: 6,
                }}
              >
                All clear.
              </div>
              <div style={{ fontSize: 13, maxWidth: 340 }}>
                Nothing needs your attention right now. Items will surface here as conditions
                change in the field.
              </div>
            </div>
          )}

          {grouped.map((g) => {
            const meta = CATEGORY_META[g.cat];
            return (
              <div key={g.cat} className="att-group">
                <div className="group-title">
                  <span className="ic">
                    <Icon name={meta.icon} size={14} />
                  </span>
                  <span>{meta.label}</span>
                  <span className="count">
                    {g.items.length} item{g.items.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="att-cards">
                  {g.items.map((it) => (
                    <AttentionRow
                      key={it.id}
                      item={it}
                      isResolved={!!resolved[it.id]}
                      selected={selectedId === it.id}
                      onSelect={() => setSelectedId(it.id)}
                      onResolve={() => resolveItem(it.id)}
                      onJump={() => it.jobId && jumpToJob(it.jobId)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {visible.length > 0 && (
          <DetailPane
            item={selected}
            onResolve={() => selected && resolveItem(selected.id)}
            onSnooze={() => selected && snoozeItem(selected.id)}
            onJump={() => selected?.jobId && jumpToJob(selected.jobId)}
            onAction={(action) => {
              if (action === 'open_dispatch') {
                setTab('dispatch');
                return;
              }
              if (action === 'open_jobs') {
                setTab('jobs');
                return;
              }
              if ((action === 'smart_schedule' || action === 'schedule') && selected?.jobId) {
                openSmartSchedule(selected.jobId);
                return;
              }
              if ((action === 'assign' || action === 'pick') && selected?.jobId) {
                selectJob(selected.jobId, { initialTab: 'crew' });
                setTab('dispatch');
                return;
              }
              // "Open job details" + "Find schedule window" both want the job
              // drawer open on Dispatch — used by the callback flow so the
              // dispatcher can read notes, see Zuper/HubSpot ids, and pick a
              // slot from the same screen.
              if ((action === 'open_details' || action === 'pick_window') && selected?.jobId) {
                selectJob(selected.jobId);
                setTab('dispatch');
                return;
              }
              if (selected && action) resolveItem(selected.id);
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────
interface RowProps {
  item: ViewAttentionItem;
  isResolved: boolean;
  selected: boolean;
  onSelect: () => void;
  onResolve: () => void;
  onJump: () => void;
}

function AttentionRow({ item, isResolved, selected, onSelect, onResolve, onJump }: RowProps) {
  return (
    <div
      className={
        'att-item ' +
        item.sev +
        (selected ? ' selected' : '') +
        (isResolved ? ' resolved' : '')
      }
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <div className="sev-stripe"></div>
      <div className="ic-box">
        <Icon name={item.icon} size={18} />
      </div>
      <div className="att-item-body">
        <div className="att-item-title">{item.title}</div>
        <div className="att-item-desc">{item.desc}</div>
        <div className="att-item-meta">
          {item.impact && (
            <>
              <span className="pill impact">
                <Icon name="bar_chart" size={10} />
                {item.impact.score}
              </span>
              <span className="pill impact-money">
                ${Math.round(item.impact.revenueAtRisk).toLocaleString()}
              </span>
              <span className={'pill impact-confidence ' + item.impact.confidence}>
                {item.impact.confidence}
              </span>
            </>
          )}
          {item.meta?.map((m, i) => (
            <span
              key={i}
              className={
                'pill ' +
                (m.kind === 'due' ? 'due' : '') +
                (m.kind === 'soft' ? ' due soft' : '') +
                (m.kind === 'deal' ? ' deal' : '')
              }
            >
              {m.kind === 'due' && <Icon name="clock" size={10} />}
              {m.kind === 'deal' && <Icon name="hubspot" size={10} />}
              {m.label}
            </span>
          ))}
          {item.jobId && (
            <span className="pill" style={{ fontFamily: 'var(--font-mono)' }}>
              {item.jobId}
            </span>
          )}
        </div>
      </div>
      <div className="att-item-actions" onClick={(e) => e.stopPropagation()}>
        {isResolved ? (
          <span className="att-item-resolved-tag">
            <Icon name="check" size={10} stroke="#1A6F2E" strokeWidth={3} />
            Done
          </span>
        ) : (
          <>
            {item.jobId && (
              <button
                className="btn btn-ghost btn-sm muted"
                onClick={onJump}
                title="Open job"
              >
                <Icon name="expand" size={12} />
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={onResolve}>
              <Icon name="check" size={12} /> Resolve
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Detail pane
// ─────────────────────────────────────────────────────────────
interface DetailProps {
  item: ViewAttentionItem | null;
  onResolve: () => void;
  onSnooze: () => void;
  onJump: () => void;
  onAction: (action: string | undefined) => void;
}

function DetailPane({ item, onResolve, onSnooze, onJump, onAction }: DetailProps) {
  if (!item) {
    return (
      <div className="att-detail">
        <div className="att-detail-empty">
          <div className="glyph">
            <Icon name="alert_circle" size={28} stroke="var(--mid-gray)" />
          </div>
          <div className="title">Select an item</div>
          <div>Pick something from the list to see context and resolution options.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="att-detail">
      <div className="att-detail-head">
        <span className={'att-detail-sev ' + item.sev}>
          <span className="dot"></span>
          {SEV_LABEL[item.sev]} · {CATEGORY_META[item.cat]?.label}
        </span>
        <h2>{item.title}</h2>
        <div className="why">{item.desc}</div>
      </div>

      <div className="att-detail-section">
        <div className="label">Context</div>
        <div className="att-detail-context">
          {item.context?.map(([k, v], i) => (
            <div className="row" key={i}>
              <span className="k">{k}</span>
              <span className="v">{v}</span>
            </div>
          ))}
        </div>
      </div>

      {item.impact && (
        <div className="att-detail-section">
          <div className="label">Impact rank</div>
          <div className="att-impact-grid">
            <div>
              <span className="k">Score</span>
              <span className="v">{item.impact.score}</span>
            </div>
            <div>
              <span className="k">Revenue risk</span>
              <span className="v">${Math.round(item.impact.revenueAtRisk).toLocaleString()}</span>
            </div>
            <div>
              <span className="k">Confidence</span>
              <span className="v">{item.impact.confidence}</span>
            </div>
          </div>
          <div className="att-impact-reasons">
            {item.impact.reasons.map((reason) => (
              <span key={reason} className="reason-chip good">
                <Icon name="info" size={10} />
                {reason}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="att-detail-section">
        <div className="label">Resolve by</div>
        <div className="att-resolutions">
          {item.resolutions?.map((r, i) => (
            <button
              key={i}
              className={'att-resolution' + (r.primary ? ' primary' : '')}
              onClick={() => onAction(r.action)}
            >
              <span className="ic">
                <Icon name={r.icon} size={16} />
              </span>
              <span>
                <span className="ttl">{r.title}</span>
                {r.sub && <span className="sub">{r.sub}</span>}
              </span>
              <Icon name="chevron_right" size={14} className="chev" />
            </button>
          ))}
        </div>
      </div>

      <div className="att-detail-footer">
        {item.jobId && (
          <button className="btn btn-outline btn-sm" onClick={onJump}>
            <Icon name="expand" size={12} /> Open job
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onSnooze}>
          <Icon name="clock" size={12} /> Snooze 1h
        </button>
        <button
          className="btn btn-dark btn-sm"
          style={{ marginLeft: 'auto' }}
          onClick={onResolve}
        >
          <Icon name="check" size={12} /> Mark resolved
        </button>
      </div>
    </div>
  );
}
