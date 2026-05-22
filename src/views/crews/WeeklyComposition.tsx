// =============================================================
// WeeklyComposition — editable Crew × Mon-Fri roster grid.
//
// Default crews stay permanent. This view writes date-scoped
// CrewRosterOverride rows for temporary loans, sick coverage, and
// service-tech pairings.
// =============================================================
import { useMemo, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useStore } from '../../store';
import { TODAY, addDays, dateKey, fmtDate, fmtTime } from '../../data/helpers';
import { getCrew, getPerson, roleLabel } from '../../data/selectors';
import {
  effectiveCrewMemberIds,
  leadPersonForJob,
} from '../../lib/crewEffective';
import type { Crew, CrewRosterOverride, Person } from '../../types';

interface WeeklyCompositionProps {
  /** Monday-anchored start of the week to render. */
  weekStart: Date;
}

interface MoveDraft {
  targetCrewId: string;
  date: string;
  personId: string;
  throughFriday: boolean;
  partialDay: boolean;
  startHour: number;
  endHour: number;
  note: string;
}

const LEAD_ROLES = ['hvac_lead', 'electrician', 'plumber', 'fsm', 'service_tech'];

export function WeeklyComposition({ weekStart }: WeeklyCompositionProps) {
  const jobs = useStore((s) => s.jobs);
  const crews = useStore((s) => s.crews);
  const people = useStore((s) => s.people);
  const overrides = useStore((s) => s.crewRosterOverrides);
  const addOverride = useStore((s) => s.addCrewRosterOverride);
  const removeOverride = useStore((s) => s.removeCrewRosterOverride);
  const pushToast = useStore((s) => s.pushToast);

  const [draft, setDraft] = useState<MoveDraft | null>(null);

  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekKeys = useMemo(() => weekDays.map(dateKey), [weekDays]);

  const activeOverrides = useMemo(
    () => overrides.filter((r) => weekKeys.includes(r.date)),
    [overrides, weekKeys],
  );

  const movedPeople = useMemo(() => {
    const ids = new Set(activeOverrides.map((r) => r.personId));
    return people.filter((p) => ids.has(p.id));
  }, [activeOverrides, people]);

  function overridesForPersonDay(personId: string, dk: string): CrewRosterOverride[] {
    return overrides.filter((r) => r.personId === personId && r.date === dk);
  }

  function openMove(targetCrewId: string, dk: string, personId = '') {
    setDraft({
      targetCrewId,
      date: dk,
      personId,
      throughFriday: false,
      partialDay: false,
      startHour: 8,
      endHour: 17,
      note: '',
    });
  }

  function saveMove() {
    if (!draft?.personId) return;
    const startIdx = weekKeys.indexOf(draft.date);
    const days = draft.throughFriday ? weekKeys.slice(startIdx) : [draft.date];
    let created = 0;
    for (const dk of days) {
      const existingRows = overridesForPersonDay(draft.personId, dk);
      const person = getPerson(people, draft.personId);
      const sourceCrewId =
        existingRows[0]?.sourceCrewId ??
        person?.defaultCrew ??
        null;
      for (const existing of existingRows) {
        removeOverride(existing.id);
      }
      if (sourceCrewId === draft.targetCrewId) continue;
      const target = getCrew(crews, draft.targetCrewId);
      const reason: CrewRosterOverride['reason'] =
        target?.type === 'service' ? 'service_pair' : 'loan';
      addOverride({
        id: `cro-${Date.now().toString(36)}-${created}`,
        date: dk,
        personId: draft.personId,
        sourceCrewId,
        targetCrewId: draft.targetCrewId,
        startHour: draft.partialDay ? draft.startHour : null,
        endHour: draft.partialDay ? draft.endHour : null,
        reason,
        note: draft.note.trim() || undefined,
      });
      created++;
    }
    const person = getPerson(people, draft.personId);
    const target = getCrew(crews, draft.targetCrewId);
    pushToast(
      `${person?.name ?? 'Tech'} moved to ${target?.name ?? 'crew'}${draft.throughFriday ? ' through Friday' : ''}`,
    );
    setDraft(null);
  }

  function returnHome(personId: string, dk: string) {
    const rows = overridesForPersonDay(personId, dk);
    rows.forEach((r) => removeOverride(r.id));
    const person = getPerson(people, personId);
    pushToast(`${person?.name ?? 'Tech'} returned to default crew`);
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-subhead)',
              fontWeight: 700,
              fontSize: 16,
              marginBottom: 2,
            }}
          >
            This week · {fmtDate(weekStart, { month: 'short', day: 'numeric' })}–
            {fmtDate(addDays(weekStart, 4), { month: 'short', day: 'numeric' })}
          </h3>
          <span className="muted small">
            Plan temporary moves here. Job drawer slot swaps remain job-only staffing.
          </span>
        </div>
      </div>

      {movedPeople.length > 0 && (
        <div className="crew-wanderers">
          <div className="crew-wanderers-head">
            <Icon name="refresh" size={14} stroke="#8A5500" />
            <span>
              {movedPeople.length} tech{movedPeople.length === 1 ? '' : 's'} temporarily moved this week
            </span>
          </div>
          <div className="crew-wanderers-list">
            {movedPeople.map((p) => (
              <div key={p.id} className="crew-wanderer-row">
                <Avatar person={p} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    Home crew: {getCrew(crews, p.defaultCrew)?.name || '—'}
                  </div>
                </div>
                <div className="row" style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {activeOverrides
                    .filter((r) => r.personId === p.id)
                    .map((r) => (
                      <span key={r.id} className="lead-pair-chip on-loan">
                        {r.date.slice(5)} · {getCrew(crews, r.targetCrewId)?.name ?? 'crew'}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="crew-week-grid">
        <div className="crew-week-grid-head">
          <div className="crew-week-grid-corner">Crew</div>
          {weekDays.map((d) => {
            const isToday = dateKey(d) === dateKey(TODAY);
            return (
              <div
                key={dateKey(d)}
                className={'crew-week-grid-day' + (isToday ? ' today' : '')}
              >
                <div className="weekday">
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className="date">{d.getDate()}</div>
              </div>
            );
          })}
        </div>

        {crews.map((crew) => (
          <CrewWeekRow
            key={crew.id}
            crew={crew}
            people={people}
            crews={crews}
            jobs={jobs}
            overrides={overrides}
            weekDays={weekDays}
            openMove={openMove}
            returnHome={returnHome}
          />
        ))}
      </div>

      <div
        className="row"
        style={{
          marginTop: 14,
          gap: 18,
          fontSize: 11,
          color: 'var(--fg-muted)',
        }}
      >
        <span
          style={{
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: 10,
          }}
        >
          Legend
        </span>
        <span className="lead-pair-chip">Default roster</span>
        <span className="lead-pair-chip on-loan">
          <Icon name="refresh" size={9} stroke="#8A5500" />
          Temporary move
        </span>
        <span className="lead-pair-chip" style={{ background: 'rgba(79,179,232,0.14)' }}>
          Job-only slot
        </span>
      </div>

      {draft && (
        <MoveRosterModal
          draft={draft}
          people={people}
          crews={crews}
          overrides={overrides}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={saveMove}
        />
      )}
    </>
  );
}

function CrewWeekRow({
  crew,
  people,
  crews,
  jobs,
  overrides,
  weekDays,
  openMove,
  returnHome,
}: {
  crew: Crew;
  people: Person[];
  crews: Crew[];
  jobs: import('../../types').Job[];
  overrides: CrewRosterOverride[];
  weekDays: Date[];
  openMove: (targetCrewId: string, date: string, personId?: string) => void;
  returnHome: (personId: string, date: string) => void;
}) {
  return (
    <div className="crew-week-grid-row">
      <div className="crew-week-grid-label">
        <div className="stripe" style={{ background: crew.color }}></div>
        <div style={{ minWidth: 0 }}>
          <div className="name">{crew.name}</div>
          <div className="muted small" style={{ fontSize: 10 }}>
            {getPerson(people, crew.lead)?.name} · {crew.type}
          </div>
        </div>
      </div>
      {weekDays.map((d) => {
        const dk = dateKey(d);
        const memberIds = effectiveCrewMemberIds({
          crews,
          people,
          overrides,
          date: dk,
          crewId: crew.id,
        });
        const jobOnlyIds = Array.from(
          new Set(
            jobs
              .filter((j) => j.date === dk && j.crewId === crew.id)
              .flatMap((j) => j.slots.map((s) => s.assignedTo).filter(Boolean) as string[])
              .filter((personId) => !memberIds.includes(personId)),
          ),
        );
        return (
          <div key={dk + crew.id} className="crew-week-grid-cell" style={{ alignItems: 'stretch' }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {memberIds.map((mid) => {
                const m = getPerson(people, mid);
                if (!m) return null;
                const movedHere = overrides.some(
                  (r) => r.date === dk && r.personId === mid && r.targetCrewId === crew.id,
                );
                return (
                  <WeekMemberChip
                    key={mid}
                    person={m}
                    home={m.defaultCrew === crew.id && !movedHere}
                    movedHere={movedHere}
                    fromCrewName={getCrew(crews, m.defaultCrew)?.name}
                    onReturn={movedHere ? () => returnHome(mid, dk) : undefined}
                  />
                );
              })}
              {memberIds.length === 0 && (
                <span className="muted small" style={{ fontSize: 10 }}>
                  —
                </span>
              )}
            </div>
            {jobOnlyIds.length > 0 && (
              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {jobOnlyIds.map((personId) => {
                  const p = getPerson(people, personId);
                  if (!p) return null;
                  const leadIds = jobs
                    .filter((j) => j.date === dk && j.crewId === crew.id)
                    .map(leadPersonForJob)
                    .filter((id): id is string => !!id && id !== personId);
                  return (
                    <span
                      key={personId}
                      className="lead-pair-chip"
                      style={{ background: 'rgba(79,179,232,0.14)', color: '#1C5F78' }}
                      title={`${p.name} is assigned by job slot only${leadIds.length ? ' with ' + leadIds.map((id) => getPerson(people, id)?.name).filter(Boolean).join(', ') : ''}`}
                    >
                      <Avatar person={p} size="xs" />
                      <span>{p.name.split(' ')[0]}</span>
                    </span>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 6, alignSelf: 'flex-start', padding: '3px 6px', fontSize: 10 }}
              onClick={() => openMove(crew.id, dk)}
            >
              <Icon name="plus" size={10} /> Move in
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MoveRosterModal({
  draft,
  people,
  crews,
  overrides,
  onChange,
  onCancel,
  onSave,
}: {
  draft: MoveDraft;
  people: Person[];
  crews: Crew[];
  overrides: CrewRosterOverride[];
  onChange: (draft: MoveDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const target = getCrew(crews, draft.targetCrewId);
  const memberIds = target
    ? effectiveCrewMemberIds({
        crews,
        people,
        overrides,
        date: draft.date,
        crewId: target.id,
      })
    : [];
  const candidates = people
    .filter((p) => !memberIds.includes(p.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520 }}
        role="dialog"
        aria-label="Move crew member"
      >
        <div className="modal-header">
          <Icon name="refresh" size={18} />
          <div>
            <div className="eyebrow-sm">{draft.date}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              Move into {target?.name ?? 'crew'}
            </div>
          </div>
        </div>
        <div className="modal-body">
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="label">Technician</label>
            <select
              className="select"
              value={draft.personId}
              onChange={(e) => onChange({ ...draft, personId: e.target.value })}
            >
              <option value="">— Pick a person —</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {roleLabel(p.roles[0])} · home: {getCrew(crews, p.defaultCrew)?.name ?? '—'}
                </option>
              ))}
            </select>
          </div>
          <label className="row" style={{ gap: 8, marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={draft.throughFriday}
              onChange={(e) => onChange({ ...draft, throughFriday: e.target.checked })}
            />
            <span className="small">Apply this move through Friday</span>
          </label>
          <label className="row" style={{ gap: 8, marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={draft.partialDay}
              onChange={(e) => onChange({ ...draft, partialDay: e.target.checked })}
            />
            <span className="small">Partial day only</span>
          </label>
          {draft.partialDay && (
            <div className="row" style={{ gap: 10, marginBottom: 12 }}>
              <label className="field" style={{ flex: 1 }}>
                <span className="label">Start</span>
                <select
                  className="select"
                  value={draft.startHour}
                  onChange={(e) =>
                    onChange({ ...draft, startHour: Number(e.target.value) })
                  }
                >
                  {[7, 8, 9, 10, 11, 12, 13, 14, 15].map((h) => (
                    <option key={h} value={h}>
                      {fmtTime(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span className="label">End</span>
                <select
                  className="select"
                  value={draft.endHour}
                  onChange={(e) =>
                    onChange({ ...draft, endHour: Number(e.target.value) })
                  }
                >
                  {[9, 10, 11, 12, 13, 14, 15, 16, 17].map((h) => (
                    <option key={h} value={h}>
                      {fmtTime(h)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <label className="field">
            <span className="label">Note</span>
            <textarea
              className="input"
              value={draft.note}
              onChange={(e) => onChange({ ...draft, note: e.target.value })}
              placeholder="Reason for dispatch context"
              rows={3}
            />
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={onSave}
            disabled={!draft.personId || (draft.partialDay && draft.endHour <= draft.startHour)}
          >
            <Icon name="check" size={14} /> Save move
          </button>
        </div>
      </div>
    </div>
  );
}

interface WeekMemberChipProps {
  person: Person;
  home: boolean;
  movedHere: boolean;
  fromCrewName?: string;
  onReturn?: () => void;
}

function WeekMemberChip({
  person,
  home,
  movedHere,
  fromCrewName,
  onReturn,
}: WeekMemberChipProps) {
  return (
    <div
      className={'crew-week-member' + (movedHere ? ' on-loan' : '')}
      title={
        person.name + (home ? '' : ' · temporary from ' + (fromCrewName || 'another crew'))
      }
      style={{ paddingRight: 3 }}
    >
      <Avatar person={person} size="xs" />
      <span className="name">{person.name.split(' ')[0]}</span>
      {LEAD_ROLES.includes(person.roles[0]) && (
        <span style={{ fontSize: 8, fontWeight: 800, opacity: 0.65 }}>L</span>
      )}
      {movedHere && <Icon name="refresh" size={9} stroke="#8A5500" />}
      {onReturn && (
        <button
          type="button"
          onClick={onReturn}
          title={'Return ' + person.name + ' home'}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            padding: 0,
            display: 'flex',
            cursor: 'pointer',
          }}
        >
          <Icon name="x" size={10} />
        </button>
      )}
    </div>
  );
}
