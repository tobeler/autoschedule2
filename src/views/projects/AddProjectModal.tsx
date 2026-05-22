// =============================================================
// AddProjectModal — create a new Project tied to a customer.
// Fields mirror HubSpot deal: name, customer, type, status, sold
// date, target completion, value, primary crew, description, notes.
// Saves via useStore().addProject(project).
// =============================================================
import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { IconButton } from '../../components/IconButton';
import { useStore } from '../../store';
import type { Project, ProjectStatus } from '../../types';

interface AddProjectModalProps {
  onClose: () => void;
  /** Optional preselect when launched from a customer context. */
  defaultCustomerId?: string;
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

export function AddProjectModal({ onClose, defaultCustomerId }: AddProjectModalProps) {
  const customers = useStore((s) => s.customers);
  const crews = useStore((s) => s.crews);
  const addProject = useStore((s) => s.addProject);
  const pushToast = useStore((s) => s.pushToast);

  const [name, setName] = useState('');
  const [customer, setCustomer] = useState<string>(
    defaultCustomerId ?? customers[0]?.id ?? '',
  );
  const [type, setType] = useState<string>('install');
  const [status, setStatus] = useState<ProjectStatus>('proposed');
  const [soldDate, setSoldDate] = useState<string>('');
  const [targetCompletion, setTargetCompletion] = useState<string>('');
  const [value, setValue] = useState<string>('');
  const [primaryCrew, setPrimaryCrew] = useState<string>('');
  const [description, setDescription] = useState('');
  const [designNotes, setDesignNotes] = useState('');

  const canSave = name.trim().length > 0 && customer.length > 0;

  function save() {
    if (!canSave) return;
    const project: Project = {
      id: 'PRJ-' + Date.now().toString(36).toUpperCase(),
      customer,
      name: name.trim(),
      type,
      status,
      soldDate: soldDate || null,
      targetCompletion: targetCompletion || null,
      value: value ? Number(value) : null,
      hubspotDealId: null,
      primaryCrew: primaryCrew || null,
      description: description.trim() || undefined,
      designNotes: designNotes.trim() || undefined,
    };
    addProject(project);
    pushToast('Added ' + project.name);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640 }}
        role="dialog"
        aria-label="Add project"
      >
        <div className="modal-header">
          <Icon name="briefcase" size={18} />
          <div>
            <div className="eyebrow-sm">Projects</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>New project</div>
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
                placeholder="e.g. Whole-home heat pump retrofit"
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
                placeholder="14995"
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

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Description</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Scope of work"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="label">Design notes</label>
              <textarea
                className="input"
                rows={3}
                placeholder="Anything the install crew should know"
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
            <Icon name="check" size={14} /> Create project
          </button>
        </div>
      </div>
    </div>
  );
}
