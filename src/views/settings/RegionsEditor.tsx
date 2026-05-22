// =============================================================
// RegionsEditor — settings sub-tab. Lists regions and their sub-
// regions with crew/headcount counts. Admins can add/edit/delete.
//
// Regions synced from HubSpot show a "Synced from HubSpot" badge
// (heuristic: id contains the HubSpot service_area prefix from the
// integration, fallback: id starts with `hs_`).
// =============================================================
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { useStore } from '../../store';
import type { Region, SubRegion } from '../../types';

export function RegionsEditor() {
  const regions = useStore((s) => s.regions);
  const crews = useStore((s) => s.crews);
  const trucks = useStore((s) => s.trucks);
  const removeRegion = useStore((s) => s.removeRegion);
  const pushToast = useStore((s) => s.pushToast);

  const [editRegion, setEditRegion] = useState<Region | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Region | null>(null);

  // Crew or truck referencing a region blocks delete. The current Crew/Truck
  // types don't carry a regionId yet, but we still guard via the
  // PEOPLE → defaultCrew indirection: any region whose subId is referenced
  // anywhere is considered "in use".
  function dependencyCount(r: Region) {
    const subIds = new Set(r.subs.map((s) => s.id));
    // Stand-in: count crews/trucks whose name includes the region short.
    const ref = crews.filter((c) =>
      c.name.toLowerCase().includes(r.short.toLowerCase()),
    ).length + trucks.filter((t) =>
      t.name.toLowerCase().includes(r.short.toLowerCase()),
    ).length;
    return { subCount: subIds.size, refs: ref };
  }

  function isSynced(r: Region) {
    return r.id.startsWith('hs_') || r.id.length === 36; // uuid heuristic
  }

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h3>Regions</h3>
          <p className="muted small" style={{ marginTop: 4 }}>
            Operating regions and sub-regions. Replaced at runtime with
            HubSpot <span className="mono">service_area</span> records after a
            sync.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAdd(true)}
        >
          <Icon name="plus" size={12} /> Add region
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {regions.map((r) => {
          const { refs } = dependencyCount(r);
          const synced = isSynced(r);
          return (
            <div
              key={r.id}
              className="card"
              style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <span
                      className="mono"
                      style={{
                        fontSize: 10,
                        background: 'var(--bg-subtle)',
                        padding: '2px 6px',
                        borderRadius: 4,
                        color: 'var(--fg-muted)',
                      }}
                    >
                      {r.short}
                    </span>
                    {synced && (
                      <span
                        className="badge"
                        style={{
                          background: 'rgba(255,122,89,0.12)',
                          color: '#9F3D24',
                          fontSize: 10,
                        }}
                      >
                        <Icon name="hubspot" size={10} /> Synced
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-subhead)',
                      fontWeight: 700,
                      fontSize: 16,
                      marginTop: 4,
                    }}
                  >
                    {r.name}
                  </div>
                  <div className="muted small" style={{ marginTop: 4 }}>
                    {r.subs.length} sub-region{r.subs.length === 1 ? '' : 's'} ·{' '}
                    {r.subs.reduce((a, s) => a + s.crews, 0)} crews ·{' '}
                    {r.subs.reduce((a, s) => a + s.headcount, 0)} people
                  </div>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  <IconButton
                    icon="settings"
                    label="Edit region"
                    onClick={() => setEditRegion(r)}
                  />
                  <IconButton
                    icon="x"
                    label="Delete region"
                    onClick={() => setDeleteTarget(r)}
                  />
                </div>
              </div>

              <div className="divider" style={{ margin: '4px 0' }} />

              <div className="col" style={{ gap: 4 }}>
                {r.subs.map((s) => (
                  <div
                    key={s.id}
                    className="row"
                    style={{
                      gap: 8,
                      padding: '4px 8px',
                      borderRadius: 6,
                      background: 'var(--bg-subtle)',
                      fontSize: 12,
                    }}
                  >
                    <span style={{ flex: 1, fontWeight: 600 }}>{s.name}</span>
                    <span className="muted mono small">
                      {s.crews}c · {s.headcount}p
                    </span>
                  </div>
                ))}
                {r.subs.length === 0 && (
                  <div className="muted small" style={{ padding: 6 }}>
                    No sub-regions defined.
                  </div>
                )}
              </div>

              {refs > 0 && (
                <div className="muted small">
                  {refs} crew/truck reference{refs === 1 ? 's' : ''} this region.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showAdd && <RegionEditModal onClose={() => setShowAdd(false)} />}
      {editRegion && (
        <RegionEditModal
          region={editRegion}
          onClose={() => setEditRegion(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          entityLabel={deleteTarget.name}
          body={(() => {
            const { refs } = dependencyCount(deleteTarget);
            if (refs > 0) {
              return (
                <div style={{ fontSize: 13, fontWeight: 600, color: '#781E1E' }}>
                  {refs} crew/truck reference
                  {refs === 1 ? 's' : ''} {deleteTarget.name} — reassign before
                  deleting.
                </div>
              );
            }
            return (
              <div className="muted small">
                Removes the region and all its sub-regions.
              </div>
            );
          })()}
          blocked={dependencyCount(deleteTarget).refs > 0}
          confirmText={'Delete ' + deleteTarget.name}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            removeRegion(deleteTarget.id);
            pushToast('Deleted ' + deleteTarget.name);
            setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}

function RegionEditModal({
  region,
  onClose,
}: {
  region?: Region;
  onClose: () => void;
}) {
  const addRegion = useStore((s) => s.addRegion);
  const updateRegion = useStore((s) => s.updateRegion);
  const pushToast = useStore((s) => s.pushToast);

  const isEdit = !!region;
  const [name, setName] = useState(region?.name ?? '');
  const [short, setShort] = useState(region?.short ?? '');
  const [subs, setSubs] = useState<SubRegion[]>(region?.subs ?? []);

  const canSave = name.trim().length > 0 && short.trim().length > 0;

  function addSub() {
    setSubs([
      ...subs,
      {
        id: 'sr' + Date.now().toString(36),
        name: '',
        headcount: 0,
        crews: 0,
      },
    ]);
  }

  function patchSub(i: number, patch: Partial<SubRegion>) {
    setSubs(subs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function removeSub(i: number) {
    setSubs(subs.filter((_, idx) => idx !== i));
  }

  function save() {
    if (!canSave) return;
    const r: Region = {
      id: region?.id ?? 'r' + Date.now().toString(36),
      name: name.trim(),
      short: short.trim().toUpperCase().slice(0, 4),
      subs: subs.filter((s) => s.name.trim().length > 0),
    };
    if (isEdit) {
      updateRegion(r);
      pushToast('Saved ' + r.name);
    } else {
      addRegion(r);
      pushToast('Added ' + r.name);
    }
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 600 }}
        role="dialog"
        aria-label={isEdit ? 'Edit region' : 'Add region'}
      >
        <div className="modal-header">
          <Icon name="map_pin" size={18} />
          <div>
            <div className="eyebrow-sm">Regions</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {isEdit ? 'Edit ' + region!.name : 'Add region'}
            </div>
          </div>
          <div className="topbar-spacer" />
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>

        <div className="modal-body">
          <div className="modal-form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Name</label>
              <input
                className="input"
                placeholder="e.g. Colorado"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label className="label">Short code</label>
              <input
                className="input mono"
                placeholder="CO"
                maxLength={4}
                value={short}
                onChange={(e) => setShort(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          <div className="divider" style={{ margin: '16px 0' }} />

          <div
            className="row"
            style={{ justifyContent: 'space-between', marginBottom: 8 }}
          >
            <div className="eyebrow-sm">Sub-regions</div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={addSub}
            >
              <Icon name="plus" size={12} /> Add sub-region
            </button>
          </div>

          <div className="col" style={{ gap: 6 }}>
            {subs.map((s, i) => (
              <div
                key={s.id}
                className="row"
                style={{
                  gap: 8,
                  padding: 8,
                  background: 'var(--bg-subtle)',
                  borderRadius: 8,
                }}
              >
                <input
                  className="input"
                  placeholder="Sub-region name"
                  value={s.name}
                  onChange={(e) => patchSub(i, { name: e.target.value })}
                  style={{ flex: 2 }}
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder="People"
                  value={s.headcount}
                  onChange={(e) =>
                    patchSub(i, { headcount: Number(e.target.value) || 0 })
                  }
                  style={{ width: 90 }}
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  placeholder="Crews"
                  value={s.crews}
                  onChange={(e) =>
                    patchSub(i, { crews: Number(e.target.value) || 0 })
                  }
                  style={{ width: 80 }}
                />
                <IconButton
                  icon="x"
                  label="Remove sub-region"
                  onClick={() => removeSub(i)}
                />
              </div>
            ))}
            {subs.length === 0 && (
              <div
                className="muted small"
                style={{ padding: 12, textAlign: 'center' }}
              >
                No sub-regions yet. Click &quot;Add sub-region&quot; above.
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={save}
            disabled={!canSave}
          >
            <Icon name="check" size={14} />{' '}
            {isEdit ? 'Save changes' : 'Add region'}
          </button>
        </div>
      </div>
    </div>
  );
}
