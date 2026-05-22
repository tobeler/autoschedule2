import { Icon } from '../../components/Icon';
import { ROLES } from '../../data/seed';
import { useStore } from '../../store';
import type { RoleKey } from '../../types';

export function RolesAndSkills() {
  const people = useStore((s) => s.people);

  return (
    <>
      <div>
        <h3>Roles &amp; skill levels</h3>
        <p className="muted small">
          Define what roles exist and how they&apos;re tiered. Levels gate auto-assignment in business rules.
        </p>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Short label</th>
              <th>Levels</th>
              <th>Needs truck</th>
              <th style={{ textAlign: 'right' }}>Headcount</th>
            </tr>
          </thead>
          <tbody>
            {(Object.entries(ROLES) as Array<[RoleKey, (typeof ROLES)[RoleKey]]>).map(([k, r]) => (
              <tr key={k}>
                <td><span style={{ fontWeight: 600 }}>{r.label}</span></td>
                <td className="mono small">{r.short}</td>
                <td>
                  {r.levels.map((l) => (
                    <span key={l} className="tag" style={{ marginRight: 4 }}>
                      {l}
                    </span>
                  ))}
                </td>
                <td>
                  {r.needsTruck ? (
                    <Icon name="check" size={14} stroke="var(--jetson-green)" />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td style={{ textAlign: 'right' }} className="mono">
                  {people.filter((p) => p.roles.includes(k)).length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="muted small">
        Tip: roles are seeded from <code className="mono">src/data/seed.ts</code>. Add or rename roles there;
        certifications attach to individual people via <code className="mono">Person.certs</code>.
      </div>
    </>
  );
}
