// =============================================================
// Fleet view — trucks/vans table with utilization bars, today's
// jobs, in-shop/available status and assigned crew.
//
// Phase 16 adds: "+ Add vehicle" button → AddTruckModal, per-row
// menu (Edit / Delete) with referential delete-guard.
// =============================================================
import { useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { JobTypeTag } from '../../components/JobTypeTag';
import { PageHeader } from '../../components/PageHeader';
import { SortableHeader } from '../../components/SortableHeader';
import { ConfirmDeleteModal } from '../../components/ConfirmDeleteModal';
import { useStore } from '../../store';
import { TODAY, dateKey, fmtTime } from '../../data/helpers';
import { getCrew } from '../../data/selectors';
import {
  chipMatches,
  makeSorter,
  nextSort,
  type SortState,
} from '../../lib/table';
import type { Truck, TruckKind, TruckStatus } from '../../types';
import { AddTruckModal } from './AddTruckModal';
import { EditTruckModal } from './EditTruckModal';

type TruckSortKey =
  | 'name'
  | 'plate'
  | 'kind'
  | 'capacity'
  | 'assignedCrew'
  | 'status'
  | 'utilization';

const TRUCK_STATUS_FILTERS: TruckStatus[] = ['available', 'shop', 'assigned'];
const TRUCK_STATUS_LABEL: Record<TruckStatus, string> = {
  available: 'Available',
  shop: 'In shop',
  assigned: 'Assigned',
};
const TRUCK_KIND_FILTERS: TruckKind[] = ['install', 'electrical', 'plumbing'];

function effectiveStatus(t: Truck): TruckStatus {
  return t.status ?? 'assigned';
}

export function FleetView() {
  const trucks = useStore((s) => s.trucks);
  const crews = useStore((s) => s.crews);
  const jobs = useStore((s) => s.jobs);
  const removeTruck = useStore((s) => s.removeTruck);
  const pushToast = useStore((s) => s.pushToast);

  const [showAdd, setShowAdd] = useState(false);
  const [editTruck, setEditTruck] = useState<Truck | null>(null);
  const [deleteTruck, setDeleteTruck] = useState<Truck | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TruckStatus | 'all'>('all');
  const [kindFilter, setKindFilter] = useState<TruckKind | 'all'>('all');
  const [sort, setSort] = useState<SortState<TruckSortKey> | null>({
    key: 'name',
    dir: 'asc',
  });

  const todayDk = dateKey(TODAY);

  // Stable utilization per-truck (deterministic, derived from id hash + jobs today)
  const utilization = useMemo(() => {
    const map: Record<string, number> = {};
    trucks.forEach((t) => {
      let h = 0;
      for (let i = 0; i < t.id.length; i++) h = (h * 31 + t.id.charCodeAt(i)) >>> 0;
      const base = 55 + (h % 40);
      const todayBoost = jobs.filter(
        (j) => j.truckId === t.id && j.date === todayDk,
      ).length;
      map[t.id] = Math.min(99, base + todayBoost * 3);
    });
    return map;
  }, [trucks, jobs, todayDk]);

  const activeCount = trucks.filter((t) => !t.status || t.status === 'assigned').length;
  const shopCount = trucks.filter((t) => t.status === 'shop').length;
  const availableCount = trucks.filter((t) => t.status === 'available').length;

  const fleetAvg = useMemo(() => {
    const vals = Object.values(utilization);
    if (vals.length === 0) return 0;
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }, [utilization]);

  // Referential check: a truck can't be deleted while it's on a non-complete job.
  function activeJobsForTruck(truckId: string) {
    return jobs.filter(
      (j) => j.truckId === truckId && j.status !== 'complete',
    );
  }

  const activeStatuses = useMemo<Set<TruckStatus>>(
    () => (statusFilter === 'all' ? new Set() : new Set([statusFilter])),
    [statusFilter],
  );
  const activeKinds = useMemo<Set<TruckKind>>(
    () => (kindFilter === 'all' ? new Set() : new Set([kindFilter])),
    [kindFilter],
  );

  const visibleTrucks = useMemo(() => {
    const filtered = trucks.filter((t) => {
      if (!chipMatches(activeStatuses, effectiveStatus(t))) return false;
      if (!chipMatches(activeKinds, t.kind)) return false;
      return true;
    });
    const sorter = makeSorter<Truck, TruckSortKey>(sort, {
      name: (t) => t.name,
      plate: (t) => t.plate,
      kind: (t) => t.kind,
      capacity: (t) => t.capacity,
      assignedCrew: (t) => getCrew(crews, t.assignedCrew)?.name ?? '',
      status: (t) => effectiveStatus(t),
      utilization: (t) => utilization[t.id] ?? 0,
    });
    return filtered.slice().sort(sorter);
  }, [trucks, crews, utilization, activeStatuses, activeKinds, sort]);

  function toggleSort(k: TruckSortKey) {
    setSort((prev) => nextSort(prev, k));
  }

  function confirmDelete(truck: Truck) {
    const blockers = activeJobsForTruck(truck.id);
    if (blockers.length > 0) return; // button is disabled
    removeTruck(truck.id);
    pushToast('Deleted ' + truck.name);
    setDeleteTruck(null);
  }

  return (
    <>
      <PageHeader
        eyebrow="Resources"
        title="Trucks & vans"
        subtitle={
          trucks.length +
          ' vehicles · ' +
          activeCount +
          ' active, ' +
          shopCount +
          ' in shop, ' +
          availableCount +
          ' available'
        }
      >
        <button className="btn btn-outline btn-sm" disabled title="Map view available when truck telematics is connected">
          <Icon name="grid" size={14} /> Map view
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAdd(true)}
        >
          <Icon name="plus" size={14} /> Add vehicle
        </button>
      </PageHeader>

      <div className="view-pad">
        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-label">Active vehicles</div>
            <div className="kpi-value">{activeCount}</div>
            <div className="kpi-meta">
              {trucks.filter((t) => t.kind === 'install').length} install ·{' '}
              {trucks.filter((t) => t.kind === 'electrical').length} electrical ·{' '}
              {trucks.filter((t) => t.kind === 'plumbing').length} plumbing
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Fleet utilization</div>
            <div className="kpi-value">{fleetAvg}%</div>
            <div className="kpi-meta up">7-day avg</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">In shop</div>
            <div className="kpi-value">{shopCount}</div>
            <div className="kpi-meta">
              {trucks.find((t) => t.status === 'shop')
                ? trucks.find((t) => t.status === 'shop')!.name +
                  ' · service · back Thu'
                : '—'}
            </div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Available pool</div>
            <div className="kpi-value">{availableCount}</div>
            <div className="kpi-meta">
              {trucks.find((t) => t.status === 'available')
                ? trucks.find((t) => t.status === 'available')!.name +
                  ' — assignable on demand'
                : '—'}
            </div>
          </div>
        </div>

        <div
          className="row"
          style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}
        >
          <button
            className={'filter-chip ' + (statusFilter === 'all' ? 'active' : '')}
            onClick={() => setStatusFilter('all')}
          >
            All statuses
          </button>
          {TRUCK_STATUS_FILTERS.map((st) => (
            <button
              key={st}
              className={'filter-chip ' + (statusFilter === st ? 'active' : '')}
              onClick={() => setStatusFilter(st)}
            >
              {TRUCK_STATUS_LABEL[st]}
            </button>
          ))}
          <span
            aria-hidden
            style={{
              width: 1,
              height: 18,
              background: 'var(--border, rgba(15,31,13,0.12))',
              margin: '0 4px',
            }}
          />
          <button
            className={'filter-chip ' + (kindFilter === 'all' ? 'active' : '')}
            onClick={() => setKindFilter('all')}
          >
            All kinds
          </button>
          {TRUCK_KIND_FILTERS.map((k) => (
            <button
              key={k}
              className={'filter-chip ' + (kindFilter === k ? 'active' : '')}
              onClick={() => setKindFilter(k)}
              style={{ textTransform: 'capitalize' }}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <SortableHeader<TruckSortKey>
                  label="Vehicle"
                  sortKey="name"
                  state={sort}
                  onClick={toggleSort}
                />
                <SortableHeader<TruckSortKey>
                  label="Type"
                  sortKey="kind"
                  state={sort}
                  onClick={toggleSort}
                />
                <SortableHeader<TruckSortKey>
                  label="Plate"
                  sortKey="plate"
                  state={sort}
                  onClick={toggleSort}
                />
                <SortableHeader<TruckSortKey>
                  label="Capacity"
                  sortKey="capacity"
                  state={sort}
                  onClick={toggleSort}
                />
                <SortableHeader<TruckSortKey>
                  label="Assigned crew"
                  sortKey="assignedCrew"
                  state={sort}
                  onClick={toggleSort}
                />
                <th>Today</th>
                <SortableHeader<TruckSortKey>
                  label="Utilization (7d)"
                  sortKey="utilization"
                  state={sort}
                  onClick={toggleSort}
                />
                <SortableHeader<TruckSortKey>
                  label="Status"
                  sortKey="status"
                  state={sort}
                  onClick={toggleSort}
                />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleTrucks.map((t) => {
                const crew = getCrew(crews, t.assignedCrew);
                const todayJobs = jobs.filter(
                  (j) => j.truckId === t.id && j.date === todayDk,
                );
                const u = utilization[t.id];
                return (
                  <tr key={t.id} className="clickable">
                    <td>
                      <div className="row">
                        <div className="row-icon-bg">
                          <Icon name={iconForKind(t.kind)} size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700 }}>{t.name}</div>
                          {t.vin ? (
                            <div className="muted small mono">VIN {t.vin.slice(-6)}</div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className="tag"
                        style={{ textTransform: 'capitalize' }}
                      >
                        {t.kind}
                      </span>
                    </td>
                    <td className="mono small">{t.plate}</td>
                    <td className="small">{t.capacity}</td>
                    <td>
                      {crew ? (
                        crew.name
                      ) : (
                        <span className="muted">— Unassigned —</span>
                      )}
                    </td>
                    <td>
                      {todayJobs.length === 0 && (
                        <span className="muted small">No jobs</span>
                      )}
                      {todayJobs.map((j) => (
                        <div
                          key={j.id}
                          className="row"
                          style={{ gap: 4, marginBottom: 2 }}
                        >
                          <JobTypeTag type={j.type} />
                          <span className="mono small muted">
                            {j.startHour != null ? fmtTime(j.startHour) : '—'}
                          </span>
                        </div>
                      ))}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <div
                          style={{
                            width: 100,
                            height: 6,
                            background: 'var(--bg-muted)',
                            borderRadius: 999,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: u + '%',
                              height: '100%',
                              background:
                                u > 90 ? 'var(--jt-callback)' : 'var(--jetson-green)',
                            }}
                          ></div>
                        </div>
                        <span className="mono small">{u}%</span>
                      </div>
                    </td>
                    <td>
                      {t.status === 'shop' && (
                        <span className="badge badge-callback">In shop</span>
                      )}
                      {t.status === 'available' && (
                        <span className="badge badge-scheduled">Available</span>
                      )}
                      {(!t.status || t.status === 'assigned') && (
                        <span className="badge badge-onsite">Active</span>
                      )}
                    </td>
                    <td style={{ position: 'relative' }}>
                      <IconButton
                        icon="more"
                        label="Actions"
                        onClick={() =>
                          setOpenMenuId(openMenuId === t.id ? null : t.id)
                        }
                      />
                      {openMenuId === t.id && (
                        <RowMenu
                          onEdit={() => {
                            setEditTruck(t);
                            setOpenMenuId(null);
                          }}
                          onDelete={() => {
                            setDeleteTruck(t);
                            setOpenMenuId(null);
                          }}
                          onClose={() => setOpenMenuId(null)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <AddTruckModal onClose={() => setShowAdd(false)} />}
      {editTruck && (
        <EditTruckModal
          truck={editTruck}
          onClose={() => setEditTruck(null)}
        />
      )}
      {deleteTruck && (
        <ConfirmDeleteModal
          entityLabel={deleteTruck.name}
          body={(() => {
            const active = activeJobsForTruck(deleteTruck.id);
            if (active.length > 0) {
              return (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#781E1E' }}>
                    {deleteTruck.name} is on {active.length} active job
                    {active.length === 1 ? '' : 's'} — cancel or reassign first.
                  </div>
                  <ul style={{ marginTop: 8, paddingLeft: 18, fontSize: 12 }}>
                    {active.slice(0, 5).map((j) => (
                      <li key={j.id}>
                        {j.title ? j.title.split(/\s[-|]\s/)[0].trim() : 'Untitled'} · {j.date ?? 'unscheduled'} · {j.status}
                      </li>
                    ))}
                    {active.length > 5 && (
                      <li className="muted">+{active.length - 5} more…</li>
                    )}
                  </ul>
                </div>
              );
            }
            return (
              <div className="muted small">
                Vehicle records are removed from the fleet table and any crews
                referencing this truck will be cleared.
              </div>
            );
          })()}
          blocked={activeJobsForTruck(deleteTruck.id).length > 0}
          confirmText={'Delete ' + deleteTruck.name}
          onCancel={() => setDeleteTruck(null)}
          onConfirm={() => confirmDelete(deleteTruck)}
        />
      )}
    </>
  );
}

function RowMenu({
  onEdit,
  onDelete,
  onClose,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
        }}
      />
      <div
        role="menu"
        style={{
          position: 'absolute',
          right: 8,
          top: 36,
          minWidth: 140,
          background: 'var(--surface-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.1))',
          padding: 4,
          zIndex: 51,
        }}
      >
        <MenuItem onClick={onEdit} icon="settings">
          Edit
        </MenuItem>
        <MenuItem onClick={onDelete} icon="x" danger>
          Delete
        </MenuItem>
      </div>
    </>
  );
}

function MenuItem({
  onClick,
  icon,
  danger,
  children,
}: {
  onClick: () => void;
  icon: 'settings' | 'x';
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        cursor: 'pointer',
        fontSize: 12,
        borderRadius: 6,
        color: danger ? '#C53030' : 'var(--fg)',
      }}
    >
      <Icon name={icon} size={12} />
      <span>{children}</span>
    </button>
  );
}

function iconForKind(kind: Truck['kind']) {
  if (kind === 'electrical') return 'bolt' as const;
  if (kind === 'plumbing') return 'droplet' as const;
  return 'truck' as const;
}
