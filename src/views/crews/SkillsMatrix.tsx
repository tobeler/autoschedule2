// =============================================================
// SkillsMatrix — table of every technician with their primary
// role, level, default crew, certifications, and weekly hours.
// =============================================================
import { Avatar } from '../../components/Avatar';
import { useStore } from '../../store';
import { getCrew, roleLabel } from '../../data/selectors';
import type { Person } from '../../types';

interface SkillsMatrixProps {
  /** Total hours worked this week, keyed by person id. */
  hoursByPerson?: Record<string, number>;
}

export function SkillsMatrix({ hoursByPerson }: SkillsMatrixProps) {
  const people = useStore((s) => s.people);
  const crews = useStore((s) => s.crews);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="table">
        <thead>
          <tr>
            <th>Technician</th>
            <th>Primary role</th>
            <th>Level</th>
            <th>Default crew</th>
            <th>Certifications</th>
            <th style={{ textAlign: 'right' }}>Hrs (this wk)</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => {
            const crew = getCrew(crews, p.defaultCrew);
            const hours = hoursByPerson?.[p.id] ?? estimateWeeklyHours(p);
            return (
              <tr key={p.id}>
                <td>
                  <div className="row" style={{ gap: 10 }}>
                    <Avatar person={p} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="muted small mono">{p.id.toUpperCase()}</div>
                    </div>
                  </div>
                </td>
                <td>{roleLabel(p.roles[0])}</td>
                <td>
                  <span
                    className="tag"
                    style={{
                      background:
                        p.level === 'L3'
                          ? 'var(--lime)'
                          : p.level === 'L2'
                            ? 'var(--jt-water-bg)'
                            : 'var(--bg-muted)',
                    }}
                  >
                    {p.level}
                  </span>
                </td>
                <td>{crew ? crew.name : '—'}</td>
                <td>
                  {p.certs && p.certs.length > 0 ? (
                    p.certs.map((c) => (
                      <span
                        key={c}
                        className="tag"
                        style={{ marginRight: 4 }}
                      >
                        {c}
                      </span>
                    ))
                  ) : (
                    <span className="muted small">—</span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }} className="mono">
                  {hours}h
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Stable per-person hours estimate when no live timesheet data is provided. */
function estimateWeeklyHours(p: Person): number {
  // Hash person id for a stable pseudo-random offset 0..7
  let h = 0;
  for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) >>> 0;
  return 32 + (h % 8);
}
