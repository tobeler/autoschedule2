// =============================================================
// Wizard / SuggestTimePicker / VehiclePicker styles
// Inlined here (not in app-views.css) because Phase 5 owner cannot
// modify files outside src/modals/. Mounted once via <WizardStyles/>
// from the wizard shell and the standalone overlay.
// =============================================================
const CSS = `
/* ===== WIZARD STEP STRIP ===== */
.wiz-steps {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
}
.wiz-step {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--fg-muted);
  font-family: var(--font-subhead);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.02em;
  cursor: default;
  transition: all var(--dur-fast);
}
.wiz-step.clickable { cursor: pointer; }
.wiz-step.clickable:hover { background: var(--surface-card); color: var(--fg); }
.wiz-step.active {
  background: var(--surface-card);
  color: var(--fg);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}
.wiz-step.done { color: var(--fern); }
.wiz-step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--bg-muted);
  color: var(--fg-muted);
  font-size: 11px;
  font-weight: 800;
  flex-shrink: 0;
}
.wiz-step.active .wiz-step-num {
  background: var(--jetson-green);
  color: var(--forest);
}
.wiz-step.done .wiz-step-num {
  background: var(--fern);
  color: var(--off-white);
}

/* ===== WIZARD SECTION HEADER ===== */
.wiz-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

/* ===== WIZARD JOB-TYPE GRID ===== */
.wiz-type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}
.wiz-type-card {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 4px 10px;
  padding: 12px 14px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  background: var(--surface-card);
  text-align: left;
  cursor: pointer;
  transition: all var(--dur-fast);
  font-family: inherit;
  color: inherit;
}
.wiz-type-card:hover { border-color: var(--border-strong); box-shadow: var(--shadow-sm); }
.wiz-type-card.selected {
  border-color: var(--jetson-green);
  background: rgba(60,213,103,0.06);
  box-shadow: 0 0 0 2px rgba(60,213,103,0.15);
}
.wiz-type-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 5px;
  grid-row: 1 / span 2;
}
.wiz-type-name {
  font-family: var(--font-subhead);
  font-weight: 700;
  font-size: 13px;
  line-height: 1.15;
  color: var(--fg);
}
.wiz-type-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--fg-muted);
  font-weight: 600;
}
.wiz-type-meta-sep { opacity: 0.5; padding: 0 1px; }
.wiz-type-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  background: rgba(60,213,103,0.18);
  color: #1A6F2E;
  padding: 2px 6px;
  border-radius: 999px;
}
.wiz-type-check {
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--jetson-green);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* ===== WIZARD JOB-TYPE PREVIEW ===== */
.wiz-type-preview {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  background: var(--bg-subtle);
}
.wiz-type-preview-slots {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.wiz-type-preview-slot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--surface-card);
  border-radius: 8px;
  font-size: 12px;
}
.wiz-type-preview-slot-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--bg-muted);
  color: var(--fg-muted);
  font-size: 10px;
  font-weight: 800;
  flex-shrink: 0;
}

/* ===== TEMPLATE EDITOR ===== */
.template-editor {
  border: 1.5px dashed var(--jetson-green);
  border-radius: 14px;
  padding: 16px;
  background: rgba(60,213,103,0.04);
}
.template-slot-row {
  display: grid;
  grid-template-columns: 22px 1fr 90px 110px 110px auto auto;
  gap: 8px;
  align-items: center;
  padding: 6px 8px;
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.template-slot-row .num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--bg-muted);
  color: var(--fg-muted);
  font-size: 11px;
  font-weight: 800;
}
.template-slot-num {
  position: relative;
}
.template-slot-num .input { padding-right: 38px; }
.template-slot-num .suffix {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  color: var(--fg-muted);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  pointer-events: none;
}
.template-slot-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--fg-muted);
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}

/* ===== CUSTOMER LOOKUP ROWS (Step 1) ===== */
.lookup-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-card);
  cursor: pointer;
  transition: all var(--dur-fast);
}
.lookup-row:hover { border-color: var(--border-strong); }
.lookup-row.selected {
  border-color: var(--jetson-green);
  background: rgba(60,213,103,0.06);
  box-shadow: 0 0 0 2px rgba(60,213,103,0.15);
}

/* ===== SUGGEST PICKER ===== */
.suggest-picker {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface-card);
}
.suggest-mode-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
}
.suggest-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.suggest-body {
  flex: 1;
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 0;
  overflow: hidden;
}

/* sidebar */
.suggest-sidebar {
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-subtle);
}
.suggest-sidebar-header {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}
.suggest-sidebar-list {
  flex: 1;
  overflow: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.suggest-slot {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: var(--surface-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all var(--dur-fast);
}
.suggest-slot:hover { border-color: var(--border-strong); }
.suggest-slot.best { border-color: var(--jetson-green); background: rgba(60,213,103,0.04); }
.suggest-slot.selected { border-color: var(--forest); box-shadow: 0 0 0 2px rgba(60,213,103,0.2); }
.suggest-slot-rank {
  font-family: var(--font-subhead);
  font-weight: 900;
  font-size: 16px;
  color: var(--fg-muted);
  width: 26px;
  text-align: center;
  flex-shrink: 0;
}
.suggest-slot.best .suggest-slot-rank { color: var(--jetson-green); }
.suggest-slot-when {
  font-weight: 700;
  font-size: 12px;
  line-height: 1.2;
}
.suggest-slot-endhour { color: var(--fg-muted); font-weight: 500; }
.suggest-slot-crew {
  font-size: 11px;
  color: var(--fg-muted);
  margin-top: 2px;
}
.suggest-slot-spandays {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--fern);
  background: rgba(60,213,103,0.15);
  padding: 1px 5px;
  border-radius: 999px;
  margin-left: 4px;
}

/* grid */
.suggest-grid {
  overflow: auto;
  min-height: 0;
  background: var(--surface-card);
}
.suggest-grid-inner {
  display: grid;
  grid-template-columns: 180px repeat(var(--day-count), minmax(120px, 1fr));
}
.suggest-day-header {
  padding: 8px;
  border-bottom: 1px solid var(--border);
  border-left: 1px solid var(--border);
  text-align: center;
  background: var(--bg-subtle);
}
.suggest-day-header.today {
  background: rgba(60,213,103,0.08);
  color: var(--forest);
}
.suggest-crew-row-label {
  display: flex;
  gap: 6px;
  padding: 0 0 0 4px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-card);
}
.suggest-crew-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  padding: 8px 10px;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  color: inherit;
}
.suggest-crew-toggle:hover { background: var(--bg-subtle); }
.suggest-cell {
  position: relative;
  min-height: 64px;
  padding: 6px;
  border-bottom: 1px solid var(--border);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  transition: background var(--dur-fast);
}
.suggest-cell:hover { background: var(--bg-subtle); }
.suggest-cell.unavailable {
  background: repeating-linear-gradient(
    45deg,
    var(--bg-subtle),
    var(--bg-subtle) 6px,
    transparent 6px,
    transparent 12px
  );
  cursor: default;
}
.suggest-cell.has-fit {
  background: rgba(60,213,103,0.05);
}
.suggest-cell.fit-best {
  background: rgba(60,213,103,0.12);
  outline: 2px solid var(--jetson-green);
  outline-offset: -2px;
}
.suggest-cell.cell-in-span {
  background: repeating-linear-gradient(
    135deg,
    rgba(60,213,103,0.12),
    rgba(60,213,103,0.12) 6px,
    rgba(60,213,103,0.05) 6px,
    rgba(60,213,103,0.05) 12px
  );
}
.suggest-cell-existing {
  display: flex;
  flex-direction: column;
  padding: 2px 6px;
  background: var(--bg-muted);
  border-radius: 4px;
  font-size: 9px;
  line-height: 1.15;
  color: var(--fg-muted);
}
.suggest-cell-existing-time { font-weight: 700; }
.suggest-cell-existing-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.75;
}
.suggest-cell-fit-time {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 700;
  color: var(--forest);
  margin-top: auto;
}
.suggest-cell-fit-time.multiday {
  background: rgba(60,213,103,0.18);
  padding: 2px 6px;
  border-radius: 4px;
}
.suggest-cell-fit-end { font-weight: 500; opacity: 0.75; }
.suggest-cell-fits {
  font-size: 10px;
  color: var(--fg-subtle);
  text-align: center;
  margin: auto 0;
}
.suggest-cell-span {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
}
.suggest-cell-span-bar {
  width: 4px;
  height: 80%;
  background: var(--jetson-green);
  border-radius: 999px;
}
.suggest-cell-span-label {
  font-size: 10px;
  color: var(--forest);
  font-weight: 700;
}

/* crew row expanded panel */
.suggest-crew-expanded {
  padding: 10px;
  background: var(--bg-subtle);
  border-bottom: 1px solid var(--border);
}
.suggest-crew-expanded-inner {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
}
.suggest-crew-member {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--surface-card);
  border-radius: 8px;
  border: 1px solid var(--border);
}
.suggest-crew-member-lead {
  display: inline-block;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: var(--forest);
  background: rgba(60,213,103,0.2);
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: 4px;
}
.suggest-crew-member-pto {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 9px;
  font-weight: 700;
  color: #6F4400;
  background: rgba(255,182,39,0.18);
  padding: 2px 6px;
  border-radius: 4px;
}
.suggest-crew-truck-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--bg-muted);
  color: var(--fg-muted);
}

/* ===== EXACT TIME PANEL ===== */
.exact-time-panel {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  overflow: auto;
}
.exact-time-fields {
  display: grid;
  grid-template-columns: 1fr 1fr 1.4fr;
  gap: 12px;
}
.exact-time-status {
  min-height: 60px;
}
.exact-time-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px;
  background: var(--bg-subtle);
  border-radius: 10px;
  font-size: 12px;
  color: var(--fg-muted);
}
.exact-time-ok {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(60,213,103,0.06);
  border: 1px solid rgba(60,213,103,0.4);
  border-radius: 10px;
}
.exact-time-conflict {
  border: 1px solid rgba(197,48,48,0.35);
  background: rgba(197,48,48,0.05);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.exact-time-conflict-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.exact-time-conflict-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.exact-time-conflict-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: var(--surface-card);
  border-radius: 6px;
  font-size: 12px;
}
.exact-time-conflict-time {
  display: inline-block;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 800;
  color: var(--fg);
  background: var(--bg-muted);
  padding: 2px 6px;
  border-radius: 4px;
  min-width: 70px;
  text-align: center;
}
.exact-time-allow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--fg);
  cursor: pointer;
  user-select: none;
}
.exact-time-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* ===== VEHICLE PICKER ===== */
.vehicle-picker {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-subtle);
}
.vehicle-picker-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.vehicle-picker-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.vehicle-option {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  background: var(--surface-card);
  cursor: pointer;
  transition: all var(--dur-fast);
  text-align: left;
  font-family: inherit;
  color: inherit;
}
.vehicle-option:hover { border-color: var(--border-strong); }
.vehicle-option.selected {
  border-color: var(--jetson-green);
  background: rgba(60,213,103,0.06);
  box-shadow: 0 0 0 2px rgba(60,213,103,0.15);
}
.vehicle-option.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.vehicle-option-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--bg-muted);
  color: var(--fg);
  flex-shrink: 0;
}
.vehicle-option-label {
  font-weight: 700;
  font-size: 13px;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vehicle-option-meta {
  font-size: 11px;
  color: var(--fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vehicle-option-check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--jetson-green);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.vehicle-picker-driver {
  margin-top: 10px;
}

/* ===== BUTTON DISABLED ("greige" treatment) ===== */
.btn.btn-greige,
.btn[disabled].btn-primary {
  background: var(--bg-muted) !important;
  color: var(--fg-muted) !important;
  box-shadow: none !important;
  cursor: not-allowed;
}
.btn[disabled] { cursor: not-allowed; }

/* ===== SUGGEST OVERLAY ===== */
.suggest-overlay {
  position: fixed; inset: 0;
  background: rgba(15,31,13,0.5);
  backdrop-filter: blur(4px);
  z-index: 60;
  display: flex; align-items: center; justify-content: center;
}
.suggest-card-modal {
  background: var(--surface-card);
  border-radius: 20px;
  width: 1080px;
  max-width: 96vw;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
  overflow: hidden;
}

@media (max-width: 720px) {
  .suggest-body { grid-template-columns: 1fr; }
  .suggest-sidebar { border-right: 0; border-bottom: 1px solid var(--border); max-height: 200px; }
  .vehicle-picker-options { grid-template-columns: 1fr; }
  .exact-time-fields { grid-template-columns: 1fr; }
}
`;

let mounted = false;
let mountedCount = 0;

export function WizardStyles() {
  // Each mount increments a counter and only injects DOM once.
  // (React StrictMode mounts twice in dev — keep the style around.)
  if (typeof document !== 'undefined' && !mounted) {
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-wizard-styles', 'true');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
    mounted = true;
  }
  mountedCount += 1;
  return null;
}
