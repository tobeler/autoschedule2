// =============================================================
// AddMemberPicker — pick from technicians whose default crew is
// unset OR who are role-compatible with this crew. Selecting
// adds them to the crew and updates their defaultCrew via
// useStore().updateCrew(crew) + useStore().updatePerson(person).
// =============================================================
import { useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { useStore } from '../../store';
import { roleLabel, getPerson } from '../../data/selectors';
import type { Crew, Person, RoleKey } from '../../types';

interface AddMemberPickerProps {
  crew: Crew;
  onClose: () => void;
}

// Which roles fit which crew type. Used as the "compatible" filter
// when the candidate already has a default crew assigned elsewhere.
const CREW_TYPE_ROLES: Record<string, RoleKey[]> = {
  install: ['hvac_lead', 'hvac_installer', 'apprentice', 'electrician'],
  service: ['service_tech', 'hvac_lead', 'hvac_installer', 'apprentice'],
  electrical: ['electrician', 'apprentice'],
  plumbing: ['plumber', 'apprentice'],
  sales: ['fsm'],
};

export function AddMemberPicker({ crew, onClose }: AddMemberPickerProps) {
  const people = useStore((s) => s.people);
  const crews = useStore((s) => s.crews);
  const updateCrew = useStore((s) => s.updateCrew);
  const updatePerson = useStore((s) => s.updatePerson);
  const pushToast = useStore((s) => s.pushToast);

  const [query, setQuery] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState<Person | null>(null);

  const currentMembers = useMemo(
    () =>
      crew.members
        .map((id) => getPerson(people, id))
        .filter((p): p is Person => !!p),
    [crew.members, people],
  );

  function removeMember(p: Person) {
    if (p.id === crew.lead) return; // lead can't be removed from picker
    const next: Crew = {
      ...crew,
      members: crew.members.filter((m) => m !== p.id),
    };
    updateCrew(next);
    if (p.defaultCrew === crew.id) {
      updatePerson({ ...p, defaultCrew: '' });
    }
    pushToast('Removed ' + p.name + ' from ' + crew.name);
    setRemoveConfirm(null);
  }

  const compatible = CREW_TYPE_ROLES[crew.type] || [];

  const candidates = useMemo(() => {
    return people.filter((p) => {
      if (crew.members.includes(p.id)) return false;
      const hasDefault = p.defaultCrew && p.defaultCrew !== crew.id;
      const isCompatible = p.roles.some((r) => compatible.includes(r));
      // Eligible when no default crew, or compatible (so they can be loaned)
      if (hasDefault && !isCompatible) return false;
      if (query) {
        const hay = (p.name + ' ' + roleLabel(p.roles[0])).toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [people, crew, compatible, query]);

  function add(p: Person) {
    const next: Crew = { ...crew, members: [...crew.members, p.id] };
    updateCrew(next);
    // If they had no default crew, this becomes their home.
    if (!p.defaultCrew) {
      updatePerson({ ...p, defaultCrew: crew.id });
    }
    pushToast(p.name + ' added to ' + crew.name);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480 }}
        role="dialog"
        aria-label="Add crew member"
      >
        <div className="modal-header">
          <Icon name="user" size={18} />
          <div>
            <div className="eyebrow-sm">{crew.name}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Add member</div>
          </div>
          <div className="topbar-spacer" />
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>

        <div className="modal-body">
          {currentMembers.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div
                className="eyebrow-sm"
                style={{ marginBottom: 6, color: 'var(--fg-muted)' }}
              >
                Current members ({currentMembers.length})
              </div>
              <div
                className="row"
                style={{ gap: 4, flexWrap: 'wrap' }}
              >
                {currentMembers.map((m) => {
                  const isLead = m.id === crew.lead;
                  return (
                    <span
                      key={m.id}
                      className="row"
                      style={{
                        gap: 6,
                        padding: '4px 8px',
                        background: isLead
                          ? 'var(--jetson-green)'
                          : 'var(--bg-subtle)',
                        color: isLead ? 'var(--forest)' : 'var(--fg)',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      <Avatar person={m} size="xs" />
                      <span>{m.name}</span>
                      {isLead && (
                        <span style={{ fontSize: 9, opacity: 0.7 }}>
                          LEAD
                        </span>
                      )}
                      {!isLead && (
                        <button
                          type="button"
                          onClick={() => setRemoveConfirm(m)}
                          title={'Remove ' + m.name}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            color: 'inherit',
                          }}
                        >
                          <Icon name="x" size={11} />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          <div className="search" style={{ marginBottom: 12 }}>
            <Icon name="search" size={14} />
            <input
              placeholder="Search by name or role…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
          {candidates.length === 0 ? (
            <div className="empty" style={{ padding: 24, textAlign: 'center' }}>
              <Icon name="user" size={24} stroke="var(--mid-gray)" />
              <div
                style={{
                  marginTop: 8,
                  fontFamily: 'var(--font-subhead)',
                  fontWeight: 700,
                }}
              >
                No candidates
              </div>
              <div className="muted small" style={{ marginTop: 4 }}>
                Everyone compatible is already on this crew or assigned elsewhere.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {candidates.map((p) => {
                const home = crews.find((c) => c.id === p.defaultCrew);
                const isLoan = home && home.id !== crew.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => add(p)}
                    className="row"
                    style={{
                      gap: 10,
                      padding: '8px 10px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--surface-card)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <Avatar person={p} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {p.name}
                      </div>
                      <div className="muted small">
                        {roleLabel(p.roles[0])} · {p.level}
                        {home ? ' · home: ' + home.name : ' · no default crew'}
                      </div>
                    </div>
                    {isLoan && (
                      <span
                        className="tag"
                        style={{
                          background: 'rgba(255,182,39,0.18)',
                          color: '#8A5500',
                        }}
                      >
                        LOAN
                      </span>
                    )}
                    <Icon name="plus" size={14} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span className="muted small">
            Candidates: unassigned techs + role-compatible loans.
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
      {removeConfirm && (
        <ConfirmDeleteModal
          entityLabel={removeConfirm.name}
          confirmText={'Remove from ' + crew.name}
          body={
            <div className="muted small">
              Removes {removeConfirm.name} from {crew.name}.
              {removeConfirm.defaultCrew === crew.id && (
                <> Their default crew will be cleared.</>
              )}
            </div>
          }
          onCancel={() => setRemoveConfirm(null)}
          onConfirm={() => removeMember(removeConfirm)}
        />
      )}
    </div>
  );
}
