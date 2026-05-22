// =============================================================
// EditProjectModal — mirrors AddProjectModal, prefilled. Saves
// via useStore().updateProject(project).
// =============================================================
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { useStore } from '../../store';
import type { Project, ProjectStatus } from '../../types';

interface EditProjectModalProps {
  project: Project;
  onClose: () => void;
}

const PROJECT_STATUSES: ProjectStatus[] = [
  'proposed',
  'sold',
  'in_progress',
  'complete',
  'warranty',
  'cancelled',
];

const PROJECT_TYPES: string[] = [
  'install',
  'retrofit',
  'service',
  'walkthrough',
  'electrical',
  'plumbing',
];

export function EditProjectModal({ project, onClose }: EditProjectModalProps) {
  const customers = useStore((s) => s.customers);
  const crews = useStore((s) => s.crews);
  const updateProject = useStore((s) => s.updateProject);
  const pushToast = useStore((s) => s.pushToast);

  const [name, setName] = useState(project.name);
  const [customer, setCustomer] = useState<string>(project.customer);
  const [type, setType] = useState<string>(project.type);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [soldDate, setSoldDate] = useState<string>(project.soldDate ?? '');
  const [targetCompletion, setTargetCompletion] = useState<string>(
    project.targetCompletion ?? '',
  );
  const [value, setValue] = useState<string>(
    project.value != null ? String(project.value) : '',
  );
  const [primaryCrew, setPrimaryCrew] = useState<string>(project.primaryCrew ?? '');
  const [description, setDescription] = useState(project.description ?? '');
  const [designNotes, setDesignNotes] = useState(project.designNotes ?? '');
  const [hubspotDealId, setHubspotDealId] = useState<string>(
    project.hubspotDealId ?? '',
  );

  const canSave = name.trim().length > 0 && customer.length > 0;

  function save() {
    if (!canSave) return;
    const next: Project = {
      ...project,
      customer,
      name: name.trim(),
      type,
      status,
      soldDate: soldDate || null,
      targetCompletion: targetCompletion || null,
      value: value ? Number(value) : null,
      primaryCrew: primaryCrew || null,
      description: description.trim() || undefined,
      designNotes: designNotes.trim() || undefined,
      hubspotDealId: hubspotDealId.trim() || null,
    };
    updateProject(next);
    pushToast('Saved ' + next.name);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640 }}
        role="dialog"
        aria-label="Edit project"
      >
        <div className="modal-header">
          <Icon name="briefcase" size={18} />
          <div>
            <div className="eyebrow-sm">Projects</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Edit {project.name}</div>
          </div>
          <div className="topbar-spacer" />
          <IconButton icon="x" label="Close" onClick={onClose} />
        </div>

        <div className="modal-body">
          <div className="modal-form-grid">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Project name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Customer</label>
              <select
                className="select"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.address}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label">Project type</label>
              <select
                className="select"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label">Status</label>
              <select
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label">Sold date</label>
              <input
                className="input"
                type="date"
                value={soldDate}
                onChange={(e) => setSoldDate(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">Target completion</label>
              <input
                className="input"
                type="date"
                value={targetCompletion}
                onChange={(e) => setTargetCompletion(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">Value ($)</label>
              <input
                className="input"
                type="number"
                step="100"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>

            <div className="field">
              <label className="label">Primary crew</label>
              <select
                className="select"
                value={primaryCrew}
                onChange={(e) => setPrimaryCrew(e.target.value)}
              >
                <option value="">— None —</option>
                {crews.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.type}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label">HubSpot deal id</label>
              <input
                className="input mono"
                placeholder="DEAL-44218"
                value={hubspotDealId}
                onChange={(e) => setHubspotDealId(e.target.value)}
              />
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Description</label>
              <textarea
                className="input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Design notes</label>
              <textarea
                className="input"
                rows={3}
                value={designNotes}
                onChange={(e) => setDesignNotes(e.target.value)}
              />
            </div>
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
            <Icon name="check" size={14} /> Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
