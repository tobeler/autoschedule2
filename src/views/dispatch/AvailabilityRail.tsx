// =============================================================
// AvailabilityRail — surfaces field techs with NO jobs on the
// selected date so dispatchers can quickly see "who's free?"
//
// Renders below the UnscheduledRail in DispatchView. Two display
// states:
//   - Collapsed: 14px header strip (icon + count badge) like the
//     UnscheduledRail's CollapsedRailStub, but vertical and below
//     the rail header so it doesn't fight for left-edge real estate.
//   - Expanded: a list of avatar rows, one per available person.
//
// The "available on this date" predicate considers both the v1
// slot.assignedTo path and the v2 assignedTechIds path on the job.
// Office / admin / non-field roles are filtered out — only roles
// in FIELD_ROLES are considered dispatchable.
//
// Region filter (via useRegionFilter) narrows by the person's
// primary crew's name prefix (e.g. crew "CO Install" → CO). When
// no region is active, all field techs are considered.
//
// Day view only. In Week / Month, the rail collapses with a hint
// to switch to Day view (predicate would need a per-day breakdown
// otherwise — out of scope for v1).
// =============================================================
import { useMemo } from 'react';
import type { Crew, Job, Person, RoleKey } from '../../types';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { roleShort } from '../../data/selectors';
import {
  regionPrefixFromTeamName,
  useRegionFilter,
  type RegionPrefix,
} from '../../lib/region-filter';

const FIELD_ROLES: ReadonlySet<RoleKey> = new Set<RoleKey>([
  'hvac_lead',
  'hvac_installer',
  'apprentice',
  'electrician',
  'plumber',
  // 'fsm' = field-service manager. Erik wanted only field-dispatchable
  // techs here; FSMs aren't booked into job slots in this app's model,
  // so they stay out of the availability list.
]);

interface AvailabilityRailProps {
  /** Currently selected dispatch date (Day view). */
  date: string;
  /** Whether the dispatch view is in Day calendar mode. */
  dayMode: boolean;
  /** All people from the store. */
  people: Person[];
  /** All crews from the store (used for region + primary-crew chip). */
  crews: Crew[];
  /** All jobs in the active filter (filteredJobs) — region/type already applied. */
  jobs: Job[];
  /** Open/collapsed state lifted to DispatchView so it persists. */
  open: boolean;
  setOpen: (next: boolean) => void;
  /** Called when a row is clicked. DispatchView decides what to do
   *  (highlight in calendar, scroll to row, etc.). */
  onPersonClick?: (personId: string) => void;
}

function isAvailableOnDate(
  person: Person,
  jobs: Job[],
  date: string,
): boolean {
  for (const j of jobs) {
    if (j.date !== date) continue;
    // v1 slot path
    if (j.slots && j.slots.some((s) => s.assignedTo === person.id)) {
      return false;
    }
    // v2 ad-hoc multi-tech path
    if (j.assignedTechIds && j.assignedTechIds.includes(person.id)) {
      return false;
    }
  }
  return true;
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

export function AvailabilityRail({
  date,
  dayMode,
  people,
  crews,
  jobs,
  open,
  setOpen,
  onPersonClick,
}: AvailabilityRailProps) {
  const { regionSet } = useRegionFilter();
  const regionActive = regionSet.size > 0;

  const crewById = useMemo(() => {
    const m = new Map<string, Crew>();
    for (const c of crews) m.set(c.id, c);
    return m;
  }, [crews]);

  // Helper: does a person belong to one of the active region prefixes?
  // We look at their default/primary crew's name (which mirrors the
  // Zuper team name on the dispatch model).
  function personMatchesRegion(p: Person, regions: Set<RegionPrefix>): boolean {
    if (regions.size === 0) return true;
    const crew = crewById.get(p.defaultCrew);
    const prefix = regionPrefixFromTeamName(crew?.name ?? null);
    if (!prefix) return false;
    return regions.has(prefix);
  }

  // Filter + sort the available list. In Week/Month mode we don't
  // compute anything — the predicate is per-date and the broader
  // ranges aren't meaningful for v1.
  const availablePeople = useMemo<Person[]>(() => {
    if (!dayMode) return [];
    const fieldTechs = people.filter((p) => {
      // person must have at least one field-tech role
      if (!p.roles || p.roles.length === 0) return false;
      if (!p.roles.some((r) => FIELD_ROLES.has(r))) return false;
      return personMatchesRegion(p, regionSet);
    });
    const free = fieldTechs.filter((p) => isAvailableOnDate(p, jobs, date));
    // Sort: primary crew name asc, then last name asc.
    return free.slice().sort((a, b) => {
      const ca = crewById.get(a.defaultCrew)?.name ?? '';
      const cb = crewById.get(b.defaultCrew)?.name ?? '';
      const cmp = ca.localeCompare(cb);
      if (cmp !== 0) return cmp;
      return lastName(a.name).localeCompare(lastName(b.name));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayMode, people, jobs, date, crewById, regionSet]);

  // Total field techs in scope (after region) — used so the "all
  // hands booked" message is accurate (vs. "no field techs at all").
  const fieldTechCount = useMemo(() => {
    return people.filter(
      (p) =>
        p.roles?.some((r) => FIELD_ROLES.has(r)) &&
        personMatchesRegion(p, regionSet),
    ).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, regionSet, crewById]);

  if (!dayMode) {
    // Compact "switch to Day" hint, collapsed shape.
    return (
      <div className="availability-rail collapsed" aria-label="Availability">
        <div
          className="availability-header"
          style={{ cursor: 'default' }}
          title="Availability is only computed in Day view"
        >
          <Icon name="users" size={14} />
          <span className="availability-label muted">Day view only</span>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="availability-rail collapsed availability-toggle"
        onClick={() => setOpen(true)}
        title={`${availablePeople.length} available — expand`}
        aria-label={`Show available techs (${availablePeople.length})`}
      >
        <Icon name="users" size={14} />
        <span className="availability-count-pill">
          {availablePeople.length}
        </span>
        <span className="availability-label">Available</span>
        <Icon name="chevron_down" size={12} style={{ marginLeft: 'auto' }} />
      </button>
    );
  }

  const allBooked = availablePeople.length === 0 && fieldTechCount > 0;
  const noFieldTechs = fieldTechCount === 0;

  return (
    <div className="availability-rail" aria-label="Available techs">
      <div className="availability-header expanded">
        <div style={{ minWidth: 0 }}>
          <div className="availability-title">
            <Icon name="users" size={14} />
            <span>{allBooked ? 'All hands booked' : 'Available'}</span>
            {!allBooked && (
              <span className="availability-count-pill">
                {availablePeople.length}
              </span>
            )}
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            {noFieldTechs
              ? 'No field techs in region'
              : allBooked
              ? 'Every tech is on a job today'
              : `of ${fieldTechCount} field tech${fieldTechCount === 1 ? '' : 's'}${
                  regionActive ? ' in region' : ''
                }`}
          </div>
        </div>
        <IconButton
          icon="chevron_up"
          label="Collapse availability"
          onClick={() => setOpen(false)}
        />
      </div>

      {availablePeople.length > 0 && (
        <div className="availability-list">
          {availablePeople.map((p) => {
            const crew = crewById.get(p.defaultCrew);
            const role = p.roles?.[0];
            return (
              <button
                type="button"
                key={p.id}
                className="availability-row"
                onClick={() => onPersonClick?.(p.id)}
                title={`${p.name} — ${crew?.name ?? 'no crew'}`}
              >
                <Avatar
                  person={p}
                  size="sm"
                  color={crew?.color}
                />
                <div className="availability-row-text">
                  <div className="availability-row-name">{p.name}</div>
                  <div className="availability-row-meta muted">
                    {role && (
                      <span className="availability-chip">
                        {roleShort(role)} · {p.level}
                      </span>
                    )}
                    {crew?.name && (
                      <span className="availability-crew">{crew.name}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
