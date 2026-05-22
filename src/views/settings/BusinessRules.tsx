import { useState, type ReactNode } from 'react';

interface Rule {
  id: string;
  title: string;
  sub: string;
  on: boolean;
  extra?: ReactNode;
}

const ASSIGNMENT_RULES_INITIAL: Rule[] = [
  {
    id: 'prefer_default_crew',
    title: 'Prefer default crew members',
    sub: "When filling slots, prioritize a job's assigned crew's default people before borrowing from other crews.",
    on: true,
  },
  {
    id: 'skill_match',
    title: 'Match minimum skill level',
    sub: "Don't suggest a tech below the required level (e.g. don't pick an L1 for an L2 slot).",
    on: true,
  },
  {
    id: 'honor_time_off',
    title: 'Honor time-off requests',
    sub: 'Skip techs marked off, sick, or in training on that date.',
    on: true,
  },
  {
    id: 'respect_40h',
    title: 'Respect 40-hour weekly cap',
    sub: "Don't suggest techs who would cross 40h that week — flag if no alternative.",
    on: false,
  },
  {
    id: 'same_lead_callbacks',
    title: 'Same lead for callbacks',
    sub: 'When a callback comes in for a recent install, suggest the original lead.',
    on: true,
  },
];

const ROUTING_RULES_INITIAL: Rule[] = [
  {
    id: 'optimize_route',
    title: 'Optimize daily route order',
    sub: "Re-sequence a crew's jobs each morning to minimize drive time. Honors fixed-time arrivals.",
    on: true,
  },
  {
    id: 'suggest_nearest',
    title: 'Suggest nearest available crew',
    sub: 'When new jobs are created, surface the closest crew with capacity in the unscheduled rail.',
    on: true,
  },
  {
    id: 'show_drive_time',
    title: 'Show drive-time on calendar',
    sub: 'Overlay travel gaps between jobs in the day calendar.',
    on: false,
  },
  {
    id: 'service_radius',
    title: 'Service-radius limit',
    sub: "Don't suggest crews more than X miles from the job site.",
    on: true,
  },
];

export function BusinessRules() {
  const [assignment, setAssignment] = useState<Rule[]>(ASSIGNMENT_RULES_INITIAL);
  const [routing, setRouting] = useState<Rule[]>(ROUTING_RULES_INITIAL);
  const [radius, setRadius] = useState<number>(25);

  function toggle(list: 'a' | 'r', id: string) {
    if (list === 'a') {
      setAssignment((rs) => rs.map((r) => (r.id === id ? { ...r, on: !r.on } : r)));
    } else {
      setRouting((rs) => rs.map((r) => (r.id === id ? { ...r, on: !r.on } : r)));
    }
  }

  return (
    <>
      <div>
        <h3>Business rules</h3>
        <p className="muted small">Logic that runs when scheduling, auto-assigning, or routing.</p>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: 12 }}>Auto-assignment</h4>
        <div className="col" style={{ gap: 14 }}>
          {assignment.map((r) => (
            <div key={r.id} className="row" style={{ alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={r.on}
                onChange={() => toggle('a', r.id)}
                style={{ marginTop: 4 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div>
                <div className="muted small">{r.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h4 style={{ marginBottom: 12 }}>Auto-routing</h4>
        <div className="col" style={{ gap: 14 }}>
          {routing.map((r) => (
            <div key={r.id} className="row" style={{ alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={r.on}
                onChange={() => toggle('r', r.id)}
                style={{ marginTop: 4 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div>
                <div className="muted small">{r.sub}</div>
              </div>
              {r.id === 'service_radius' && (
                <input
                  className="input"
                  type="number"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  style={{ width: 70 }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="muted small">
        Note: business-rule toggles persist within the session only. Wire to the store once a `setBusinessRule`
        action is added.
      </div>
    </>
  );
}
