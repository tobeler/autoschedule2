/* eslint-disable */
/* Customizable Checklist System
   - Form templates per job type (and ad-hoc)
   - Field types: bool, text, longtext, number, select, multiselect, photo, photoset, signature, rating
   - Used on tech mobile + viewable as completed from the back office
*/

// =============================================================
// FIELD TYPE DEFINITIONS
// =============================================================
const FIELD_TYPES = {
  bool:        { label: 'Yes / No',          icon: 'check' },
  text:        { label: 'Short text',         icon: 'info' },
  longtext:    { label: 'Long text / Notes',  icon: 'info' },
  number:      { label: 'Number',             icon: 'mono' },
  select:      { label: 'Single select',      icon: 'chevron_down' },
  multiselect: { label: 'Multi-select',       icon: 'layers' },
  photo:       { label: 'Single photo',       icon: 'camera' },
  photoset:    { label: 'Photo set',          icon: 'grid' },
  signature:   { label: 'Customer signature', icon: 'user' },
  rating:      { label: 'Star rating',        icon: 'sparkle' },
};

// =============================================================
// FORM TEMPLATES — one per job type, fully editable in Settings
// =============================================================
const FORM_TEMPLATES = {
  heatpump: {
    id: 'tpl-hp-v3',
    name: 'Heat pump install · completion form',
    version: 3,
    sections: [
      {
        id: 'sec-pre',
        title: 'Pre-install',
        fields: [
          { id:'f1', type:'bool',     label:'Confirm equipment matches sales order', required: true },
          { id:'f2', type:'bool',     label:'Walked customer through scope of work', required: true },
          { id:'f3', type:'bool',     label:'Floor protection laid down',            required: true },
          { id:'f4', type:'bool',     label:'Existing system locked-out/tagged-out', required: true },
          { id:'f5', type:'photoset', label:'Pre-install photos', minPhotos: 4, hint: 'Outdoor unit area, indoor unit area, panel, thermostat location' },
        ],
      },
      {
        id: 'sec-mech',
        title: 'Mechanical',
        fields: [
          { id:'f10', type:'bool',     label:'Refrigerant recovered to EPA spec', required: true },
          { id:'f11', type:'bool',     label:'Old condenser + air handler removed', required: true },
          { id:'f12', type:'bool',     label:'New outdoor unit secured on pad',  required: true },
          { id:'f13', type:'bool',     label:'New air handler installed',         required: true },
          { id:'f14', type:'select',   label:'Refrigerant line set length',
            options:['15 ft','20 ft','25 ft','30 ft','35 ft','50 ft','Custom'] },
          { id:'f15', type:'number',   label:'Vacuum reading (microns)', unit:'µm', required: true,
            validation: { max: 500, hint:'Must be ≤ 500 µm' } },
          { id:'f16', type:'bool',     label:'Pressure test passed',  required: true },
          { id:'f17', type:'photoset', label:'Mid-job photos', minPhotos: 6, hint:'Line set runs, condensate trap, pad install, indoor mount' },
        ],
      },
      {
        id: 'sec-elec',
        title: 'Electrical handoff',
        fields: [
          { id:'f20', type:'bool',     label:'Dedicated 240V circuit landed' },
          { id:'f21', type:'select',   label:'Breaker size',
            options:['20A','30A','40A','50A','60A'] },
          { id:'f22', type:'bool',     label:'Disconnect installed within sight' },
          { id:'f23', type:'bool',     label:'Grounding verified' },
          { id:'f24', type:'photo',    label:'Photo of energized breaker label' },
        ],
      },
      {
        id: 'sec-comm',
        title: 'Commissioning',
        fields: [
          { id:'f30', type:'bool',        label:'Charged to manufacturer spec',     required: true },
          { id:'f31', type:'number',      label:'Indoor temperature split (°F)',     unit:'°F' },
          { id:'f32', type:'number',      label:'Outdoor unit current draw (A)',     unit:'A' },
          { id:'f33', type:'bool',        label:'Jetson thermostat paired',          required: true },
          { id:'f34', type:'multiselect', label:'Modes tested',
            options:['Cooling','Heating','Aux/Emergency heat','Defrost','Fan'] },
          { id:'f35', type:'longtext',    label:'Commissioning notes',
            placeholder:'Anything unusual, deviations from plan, follow-up needed…' },
          { id:'f36', type:'photoset',    label:'Post-install photos', minPhotos: 2, hint:'Clean job site, final outdoor unit, indoor finish' },
          { id:'f37', type:'rating',      label:'Customer satisfaction (after walk-through)' },
          { id:'f38', type:'signature',   label:'Customer sign-off', required: true },
        ],
      },
    ],
  },

  service: {
    id: 'tpl-srv-v2',
    name: 'Service call · completion form',
    version: 2,
    sections: [
      { id:'sec-diag', title:'Diagnosis', fields: [
        { id:'sf1', type:'longtext',   label:'Customer-reported issue', required: true },
        { id:'sf2', type:'longtext',   label:'Root cause identified',  required: true },
        { id:'sf3', type:'photoset',   label:'Diagnostic photos',      minPhotos: 2 },
        { id:'sf4', type:'multiselect',label:'Tests performed',
          options:['Refrigerant pressures','Static pressure','Temperature split','Capacitor test','Contactor test','Drain inspection'] },
      ]},
      { id:'sec-rep', title:'Repair', fields: [
        { id:'sf5', type:'longtext', label:'Repair performed', required: true },
        { id:'sf6', type:'bool',     label:'System retested after repair', required: true },
        { id:'sf7', type:'bool',     label:'Customer informed of work',    required: true },
        { id:'sf8', type:'signature',label:'Customer sign-off',            required: true },
      ]},
    ],
  },

  water: {
    id: 'tpl-hpwh-v1',
    name: 'Heat pump water heater · completion form',
    version: 1,
    sections: [
      { id:'sec-pre', title:'Pre-install', fields: [
        { id:'wf1', type:'bool', label:'Water supply shut off, old tank drained', required: true },
        { id:'wf2', type:'bool', label:'Dedicated circuit confirmed', required: true },
        { id:'wf3', type:'photoset', label:'Before photos', minPhotos: 3 },
      ]},
      { id:'sec-inst', title:'Install', fields: [
        { id:'wf4', type:'bool', label:'Old water heater removed' },
        { id:'wf5', type:'bool', label:'New HPWH positioned + leveled' },
        { id:'wf6', type:'bool', label:'Supply + drain lines connected' },
        { id:'wf7', type:'bool', label:'Condensate drain run' },
      ]},
      { id:'sec-comm', title:'Commissioning', fields: [
        { id:'wf8', type:'bool',   label:'Power on, operation verified', required: true },
        { id:'wf9', type:'number', label:'Tank temp setpoint', unit:'°F', validation:{ min: 115, max: 125 } },
        { id:'wf10', type:'photoset', label:'After photos', minPhotos: 2 },
        { id:'wf11', type:'signature', label:'Customer sign-off', required: true },
      ]},
    ],
  },

  callback: {
    id: 'tpl-cb-v1',
    name: 'Callback · resolution form',
    version: 1,
    sections: [
      { id:'cb-1', title:'Resolution', fields: [
        { id:'cbf1', type:'longtext', label:'What was wrong', required: true },
        { id:'cbf2', type:'longtext', label:'How it was fixed', required: true },
        { id:'cbf3', type:'select',   label:'Cause category',
          options:['Install error','Defective part','Customer-misuse','Software/control','Other'], required: true },
        { id:'cbf4', type:'bool',     label:'Verified fix held for 15 min', required: true },
        { id:'cbf5', type:'signature',label:'Customer sign-off', required: true },
      ]},
    ],
  },

  retrofit: {
    id: 'tpl-rt-v1', name: 'Smart system retrofit · form', version: 1,
    sections: [
      { id:'rt-1', title:'Install', fields: [
        { id:'rtf1', type:'bool', label:'Old thermostat removed', required: true },
        { id:'rtf2', type:'bool', label:'New thermostat paired',  required: true },
        { id:'rtf3', type:'bool', label:'Wi-Fi connected',         required: true },
        { id:'rtf4', type:'photoset', label:'Before/after photos', minPhotos: 2 },
        { id:'rtf5', type:'signature', label:'Customer sign-off',  required: true },
      ]},
    ],
  },
};

// =============================================================
// SAMPLE COMPLETED SUBMISSION — for jobs that are already 'complete'
// =============================================================
const FORM_SUBMISSIONS = {
  // job J-2580 — yesterday's complete heatpump install
  'J-2580': {
    templateId: 'tpl-hp-v3',
    submittedAt: '2026-05-20 17:42',
    submittedBy: 'p2',
    durationMin: 478,
    answers: {
      f1: true, f2: true, f3: true, f4: true,
      f5: { photos: 4 },
      f10: true, f11: true, f12: true, f13: true,
      f14: '25 ft',
      f15: 412,
      f16: true,
      f17: { photos: 7 },
      f20: true, f21: '30A', f22: true, f23: true,
      f24: { photos: 1 },
      f30: true, f31: 21, f32: 14.2, f33: true,
      f34: ['Cooling','Heating','Defrost','Fan'],
      f35: 'Tight install — customer wanted the line set hidden behind cabinet. Routed inside soffit, looks clean. Reviewed Jetson app onboarding.',
      f36: { photos: 3 },
      f37: 5,
      f38: { signed: true, name: 'Lin Family', at: '2026-05-20 17:38' },
    },
  },
  // J-2581 — yesterday's complete service
  'J-2581': {
    templateId: 'tpl-srv-v2',
    submittedAt: '2026-05-20 16:05',
    submittedBy: 'p9',
    durationMin: 92,
    answers: {
      sf1: 'Cooling not blowing cold — customer reports lukewarm air last 3 days',
      sf2: 'Run capacitor on outdoor fan motor failed (35/5 µF, reading 22/2)',
      sf3: { photos: 3 },
      sf4: ['Refrigerant pressures','Capacitor test','Temperature split'],
      sf5: 'Replaced 35/5 µF dual-run capacitor with new Jetson stocked part. Verified pressures + retested cooling.',
      sf6: true, sf7: true,
      sf8: { signed: true, name: 'Sondheim, R.', at: '2026-05-20 16:02' },
    },
  },
};

// =============================================================
// HELPERS
// =============================================================
function getTemplate(jobType) {
  return FORM_TEMPLATES[jobType] || FORM_TEMPLATES.service;
}
function getSubmission(jobId) {
  return FORM_SUBMISSIONS[jobId] || null;
}
function totalFields(tpl) {
  return tpl.sections.reduce((a, s) => a + s.fields.length, 0);
}
function requiredFields(tpl) {
  return tpl.sections.flatMap(s => s.fields).filter(f => f.required);
}
function fieldStatus(field, answer) {
  // returns 'done' | 'partial' | 'empty' | 'fail'
  if (answer === undefined || answer === null) return 'empty';
  if (field.type === 'bool') return answer === true ? 'done' : answer === false ? 'fail' : 'empty';
  if (field.type === 'number') {
    if (typeof answer !== 'number') return 'empty';
    if (field.validation) {
      if (field.validation.max !== undefined && answer > field.validation.max) return 'fail';
      if (field.validation.min !== undefined && answer < field.validation.min) return 'fail';
    }
    return 'done';
  }
  if (field.type === 'text' || field.type === 'longtext') return answer.length > 0 ? 'done' : 'empty';
  if (field.type === 'select') return answer ? 'done' : 'empty';
  if (field.type === 'multiselect') return Array.isArray(answer) && answer.length > 0 ? 'done' : 'empty';
  if (field.type === 'photo' || field.type === 'photoset') {
    const n = answer?.photos || 0;
    if (field.minPhotos && n < field.minPhotos) return 'partial';
    return n > 0 ? 'done' : 'empty';
  }
  if (field.type === 'signature') return answer?.signed ? 'done' : 'empty';
  if (field.type === 'rating') return typeof answer === 'number' && answer > 0 ? 'done' : 'empty';
  return 'empty';
}

// =============================================================
// COMPLETED FORM VIEWER — shown in the back-office drawer
// =============================================================
function CompletedFormView({ jobId }) {
  const submission = getSubmission(jobId);
  if (!submission) {
    return (
      <div className="empty">
        <div className="empty-icon"><Icon name="info" size={28} stroke="var(--mid-gray)" /></div>
        <div className="h4">No completion form submitted</div>
        <div className="muted small">Form is filled by the tech in the field on job completion.</div>
      </div>
    );
  }
  const tpl = FORM_TEMPLATES[Object.keys(FORM_TEMPLATES).find(k => FORM_TEMPLATES[k].id === submission.templateId)] || tpl;
  const submitter = getPerson(submission.submittedBy);
  const total = totalFields(tpl);
  const completed = tpl.sections.flatMap(s => s.fields).filter(f => fieldStatus(f, submission.answers[f.id]) === 'done').length;
  const failed = tpl.sections.flatMap(s => s.fields).filter(f => fieldStatus(f, submission.answers[f.id]) === 'fail').length;

  return (
    <>
      <div className="form-summary">
        <div className="form-summary-row">
          <Avatar person={submitter} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{submitter?.name}</div>
            <div className="muted small">Submitted {submission.submittedAt} · {Math.floor(submission.durationMin / 60)}h {submission.durationMin % 60}m on site</div>
          </div>
          <span className="badge badge-onsite"><Icon name="check" size={11} /> Submitted</span>
        </div>
        <div className="form-progress">
          <div className="form-progress-track">
            <div className="form-progress-fill" style={{ width: (completed / total * 100) + '%' }}></div>
          </div>
          <div className="muted small">{completed}/{total} fields complete{failed > 0 ? ' · ' + failed + ' failed' : ''}</div>
        </div>
      </div>

      {tpl.sections.map(sec => {
        const secDone = sec.fields.every(f => fieldStatus(f, submission.answers[f.id]) === 'done' || !f.required);
        const secFails = sec.fields.filter(f => fieldStatus(f, submission.answers[f.id]) === 'fail').length;
        return (
          <div key={sec.id} className="form-section">
            <div className="form-section-header">
              <div className="form-section-title">
                <div className={"form-section-tick" + (secDone && !secFails ? ' done' : secFails ? ' fail' : '')}>
                  {secDone && !secFails ? <Icon name="check" size={12} /> : secFails ? '!' : ''}
                </div>
                {sec.title}
              </div>
              <span className="muted small">{sec.fields.filter(f => fieldStatus(f, submission.answers[f.id]) === 'done').length}/{sec.fields.length}</span>
            </div>
            <div className="form-fields">
              {sec.fields.map(f => (
                <FormFieldDisplay key={f.id} field={f} answer={submission.answers[f.id]} />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function FormFieldDisplay({ field, answer }) {
  const status = fieldStatus(field, answer);

  function renderAnswer() {
    if (status === 'empty') return <span className="muted small">— not answered —</span>;

    if (field.type === 'bool') {
      return answer === true
        ? <span className="row" style={{ color:'#1A6F2E', fontWeight: 600 }}><Icon name="check" size={14} /> Yes</span>
        : <span className="row" style={{ color:'#781E1E', fontWeight: 600 }}><Icon name="x" size={14} /> No</span>;
    }
    if (field.type === 'number') {
      const failed = status === 'fail';
      return (
        <div className="row">
          <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: failed ? '#781E1E' : 'inherit' }}>
            {answer}{field.unit ? ' ' + field.unit : ''}
          </span>
          {failed && <span className="badge badge-callback">Out of range</span>}
        </div>
      );
    }
    if (field.type === 'text' || field.type === 'longtext') {
      return <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{answer}</div>;
    }
    if (field.type === 'select') return <span className="pill">{answer}</span>;
    if (field.type === 'multiselect') return (
      <div className="row" style={{ flexWrap:'wrap', gap: 4 }}>
        {answer.map(v => <span key={v} className="pill" style={{ fontSize: 11 }}>{v}</span>)}
      </div>
    );
    if (field.type === 'photo' || field.type === 'photoset') {
      const n = answer?.photos || 0;
      const partial = field.minPhotos && n < field.minPhotos;
      return (
        <div>
          <div className="tech-photo-grid" style={{ marginBottom: 6 }}>
            {Array.from({ length: Math.min(n, 6) }).map((_, i) => (
              <div key={i} className={"tech-photo " + (i < 2 ? 'tech-photo-pre' : i < 4 ? 'tech-photo-mid' : 'tech-photo-post')}>
                <span className="tech-photo-label">PHOTO</span>
              </div>
            ))}
          </div>
          <div className={"row small" + (partial ? '' : '')}>
            <Icon name="grid" size={12} stroke="var(--fg-muted)" />
            <span className="muted">{n} photo{n === 1 ? '' : 's'}{field.minPhotos ? ' · min ' + field.minPhotos : ''}</span>
            {partial && <span className="badge badge-callback">Below min</span>}
          </div>
        </div>
      );
    }
    if (field.type === 'signature') {
      return (
        <div className="signature-display">
          <svg viewBox="0 0 200 60" style={{ width: '100%', height: 50 }}>
            <path d="M 5 40 Q 20 10 30 32 T 50 28 T 75 32 Q 90 38 110 25 T 140 30 Q 155 35 175 22 T 195 28"
              stroke="var(--forest)" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
          <div className="row" style={{ justifyContent:'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{answer.name}</span>
            <span className="mono small muted">{answer.at}</span>
          </div>
        </div>
      );
    }
    if (field.type === 'rating') {
      return (
        <div className="row" style={{ gap: 2 }}>
          {[1,2,3,4,5].map(i => (
            <span key={i} style={{ fontSize: 20, color: i <= answer ? 'var(--jt-electrical)' : 'var(--border-strong)' }}>★</span>
          ))}
          <span className="muted small" style={{ marginLeft: 6 }}>{answer}/5</span>
        </div>
      );
    }
    return <span className="muted small">—</span>;
  }

  return (
    <div className={"form-field-display" + (status === 'fail' ? ' fail' : '')}>
      <div className="form-field-label">
        <div className={"form-field-tick " + status}>
          {status === 'done' && <Icon name="check" size={11} />}
          {status === 'fail' && '!'}
          {status === 'partial' && '•'}
        </div>
        <span>{field.label}</span>
        {field.required && <span className="muted small" style={{ marginLeft: 4 }}>· required</span>}
      </div>
      <div className="form-field-answer">{renderAnswer()}</div>
    </div>
  );
}

// =============================================================
// FORM BUILDER — used in Settings to edit per-type templates
// =============================================================
function FormBuilder({ jobType, onChange }) {
  const [tpl, setTpl] = React.useState(getTemplate(jobType));
  const [activeSection, setActiveSection] = React.useState(tpl.sections[0]?.id);

  React.useEffect(() => {
    setTpl(getTemplate(jobType));
    setActiveSection(getTemplate(jobType).sections[0]?.id);
  }, [jobType]);

  const sec = tpl.sections.find(s => s.id === activeSection);

  return (
    <div className="form-builder">
      <div className="form-builder-sections">
        <div className="eyebrow-sm" style={{ padding: '4px 0 8px' }}>Sections</div>
        {tpl.sections.map(s => (
          <button key={s.id}
            className={"form-builder-section-btn" + (activeSection === s.id ? ' active' : '')}
            onClick={() => setActiveSection(s.id)}>
            <Icon name="layers" size={13} />
            <span>{s.title}</span>
            <span className="muted small" style={{ marginLeft:'auto' }}>{s.fields.length}</span>
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, justifyContent:'flex-start' }}>
          <Icon name="plus" size={12} /> Add section
        </button>
      </div>

      <div className="form-builder-fields">
        {sec && (
          <>
            <div className="row" style={{ marginBottom: 12 }}>
              <input className="input" defaultValue={sec.title} style={{ fontWeight: 700, fontSize: 15, flex: 1 }} />
              <button className="btn btn-outline btn-sm"><Icon name="x" size={12} /> Delete section</button>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
              {sec.fields.map(f => (
                <div key={f.id} className="builder-field-row">
                  <Icon name="drag" size={14} stroke="var(--mid-gray)" />
                  <select className="select" style={{ width: 150, flexShrink: 0 }} defaultValue={f.type}>
                    {Object.entries(FIELD_TYPES).map(([k, t]) => (
                      <option key={k} value={k}>{t.label}</option>
                    ))}
                  </select>
                  <input className="input" defaultValue={f.label} style={{ flex: 1 }} />
                  <label className="row small" style={{ flexShrink: 0 }}>
                    <input type="checkbox" defaultChecked={f.required} />
                    Required
                  </label>
                  <IconButton icon="more" label="Edit" />
                  <IconButton icon="x" label="Remove" />
                </div>
              ))}
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn btn-outline btn-sm"><Icon name="plus" size={12} /> Add field</button>
              <span className="topbar-spacer"></span>
              <span className="muted small">{sec.fields.filter(f => f.required).length} required · {sec.fields.length} total</span>
            </div>

            {/* Library of quick-add field shortcuts */}
            <div className="divider"></div>
            <div className="eyebrow-sm">Quick add</div>
            <div className="row" style={{ flexWrap:'wrap', gap: 6, marginTop: 8 }}>
              {Object.entries(FIELD_TYPES).map(([k, t]) => (
                <button key={k} className="filter-chip">
                  <Icon name={t.icon === 'camera' ? 'grid' : t.icon === 'mono' ? 'info' : t.icon} size={12} />
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window, {
  FIELD_TYPES, FORM_TEMPLATES, FORM_SUBMISSIONS,
  getTemplate, getSubmission, totalFields, requiredFields, fieldStatus,
  CompletedFormView, FormFieldDisplay, FormBuilder,
});
