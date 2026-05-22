/* eslint-disable */
/* Jetson Schedule + Dispatch — seed data + helpers
   Loaded as plain script so it's available to all babel scripts. */

// ============ JOB TYPES + TEMPLATES ============
const JOB_TYPES = {
  heatpump:   { label: 'Heat pump install',         color: 'jt-heatpump',    short: 'HP Install' },
  retrofit:   { label: 'Smart system retrofit',     color: 'jt-retrofit',    short: 'Retrofit' },
  water:      { label: 'HP water heater install',   color: 'jt-water',       short: 'HPWH' },
  electrical: { label: 'Electrical service upgrade',color: 'jt-electrical',  short: 'Panel' },
  service:    { label: 'Service · Care Plus',       color: 'jt-service',     short: 'Service' },
  warranty:   { label: 'Service · Warranty',        color: 'jt-warranty',    short: 'Warranty' },
  callback:   { label: 'Service · Callback',        color: 'jt-callback',    short: 'Callback' },
  walkthrough:{ label: 'Walk-through · Sales',      color: 'jt-walkthrough', short: 'Walk-thru' },
  meeting:    { label: 'Meeting / Training',        color: 'jt-meeting',     short: 'Meeting' },
};

// Roles and the levels each can have
const ROLES = {
  hvac_lead:      { label: 'HVAC Lead',       short: 'Lead',   needsTruck: true,  levels: ['L1','L2','L3'] },
  hvac_installer: { label: 'HVAC Installer',  short: 'Install',needsTruck: false, levels: ['L1','L2'] },
  apprentice:     { label: 'Apprentice',      short: 'Appr.',  needsTruck: false, levels: ['L1'] },
  electrician:    { label: 'Electrician',     short: 'Elec.',  needsTruck: true,  levels: ['L1','L2','L3'] },
  plumber:        { label: 'Plumber',         short: 'Plumb.', needsTruck: true,  levels: ['L1','L2'] },
  fsm:            { label: 'Field Sales',     short: 'FSM',    needsTruck: false, levels: ['L1','L2'] },
};

// Templates — required slots per job type. Editable in Settings.
const JOB_TEMPLATES = {
  heatpump: {
    label: 'Heat pump install',
    slots: [
      { role: 'hvac_lead',      level: 'L2', hours: 8, start: 0 },
      { role: 'hvac_installer', level: 'L1', hours: 8, start: 0 },
      { role: 'apprentice',     level: 'L1', hours: 8, start: 0, optional: true },
      { role: 'electrician',    level: 'L2', hours: 3, start: 4 },
    ],
    truckCount: 1,
  },
  retrofit: {
    label: 'Smart system retrofit',
    slots: [
      { role: 'electrician', level: 'L2', hours: 2, start: 0 },
    ],
    truckCount: 1,
  },
  water: {
    label: 'HP water heater install',
    slots: [
      { role: 'plumber',     level: 'L2', hours: 5, start: 0 },
      { role: 'electrician', level: 'L1', hours: 2, start: 1 },
      { role: 'apprentice',  level: 'L1', hours: 5, start: 0 },
    ],
    truckCount: 1,
  },
  electrical: {
    label: 'Electrical service upgrade',
    slots: [
      { role: 'electrician', level: 'L3', hours: 6, start: 0 },
      { role: 'apprentice',  level: 'L1', hours: 6, start: 0 },
    ],
    truckCount: 1,
  },
  service: {
    label: 'Service · Care Plus',
    slots: [{ role: 'hvac_installer', level: 'L2', hours: 2, start: 0 }],
    truckCount: 1,
  },
  warranty: {
    label: 'Service · Warranty',
    slots: [{ role: 'hvac_installer', level: 'L2', hours: 2, start: 0 }],
    truckCount: 1,
  },
  callback: {
    label: 'Service · Callback',
    slots: [{ role: 'hvac_lead', level: 'L2', hours: 1.5, start: 0 }],
    truckCount: 1,
  },
  walkthrough: {
    label: 'Walk-through · Sales',
    slots: [{ role: 'fsm', level: 'L1', hours: 1.5, start: 0 }],
    truckCount: 0,
  },
  meeting: {
    label: 'Meeting / Training',
    slots: [], // crew composition is whoever's invited
    truckCount: 0,
  },
};

// ============ PEOPLE ============
const PEOPLE = [
  // HVAC Leads
  { id: 'p1',  name: 'Marcus Holloway',  initials: 'MH', roles: ['hvac_lead'], level: 'L3', defaultCrew: 'c1', certs: ['EPA 608','NATE'] },
  { id: 'p2',  name: 'Devon Reyes',      initials: 'DR', roles: ['hvac_lead'], level: 'L3', defaultCrew: 'c2', certs: ['EPA 608'] },
  { id: 'p3',  name: 'Aaliyah Bennett',  initials: 'AB', roles: ['hvac_lead'], level: 'L2', defaultCrew: 'c3', certs: ['EPA 608','NATE'] },
  { id: 'p4',  name: 'Jonas Park',       initials: 'JP', roles: ['hvac_lead'], level: 'L2', defaultCrew: 'c4', certs: ['EPA 608'] },
  { id: 'p5',  name: 'Eli Chen',         initials: 'EC', roles: ['hvac_lead'], level: 'L1', defaultCrew: 'c5', certs: ['EPA 608'] },

  // HVAC Installers
  { id: 'p6',  name: 'Tyree Booker',     initials: 'TB', roles: ['hvac_installer'], level: 'L2', defaultCrew: 'c1' },
  { id: 'p7',  name: 'Sasha Volkov',     initials: 'SV', roles: ['hvac_installer'], level: 'L2', defaultCrew: 'c2' },
  { id: 'p8',  name: 'Ramiro Cortez',    initials: 'RC', roles: ['hvac_installer'], level: 'L2', defaultCrew: 'c3' },
  { id: 'p9',  name: 'Noor Khan',        initials: 'NK', roles: ['hvac_installer'], level: 'L1', defaultCrew: 'c4' },
  { id: 'p10', name: 'Bryce Tanaka',     initials: 'BT', roles: ['hvac_installer'], level: 'L1', defaultCrew: 'c5' },

  // Apprentices
  { id: 'p11', name: 'Mariana Lopes',    initials: 'ML', roles: ['apprentice'], level: 'L1', defaultCrew: 'c1' },
  { id: 'p12', name: 'Wesley Ortiz',     initials: 'WO', roles: ['apprentice'], level: 'L1', defaultCrew: 'c3' },
  { id: 'p13', name: 'Tova Linden',      initials: 'TL', roles: ['apprentice'], level: 'L1', defaultCrew: 'c5' },

  // Electricians
  { id: 'p14', name: 'Garrett Pine',     initials: 'GP', roles: ['electrician'], level: 'L3', defaultCrew: 'c6', certs: ['Master Elec.'] },
  { id: 'p15', name: 'Hadley Brooks',    initials: 'HB', roles: ['electrician'], level: 'L2', defaultCrew: 'c7', certs: ['Journeyman'] },
  { id: 'p16', name: 'Imani Walsh',      initials: 'IW', roles: ['electrician'], level: 'L2', defaultCrew: 'c8', certs: ['Journeyman'] },

  // Plumbers
  { id: 'p17', name: 'Saoirse Doyle',    initials: 'SD', roles: ['plumber'], level: 'L2', defaultCrew: 'c9', certs: ['Master Plumber'] },
  { id: 'p18', name: 'Reuben Marsh',     initials: 'RM', roles: ['plumber'], level: 'L1', defaultCrew: 'c9' },

  // FSMs
  { id: 'p19', name: 'Camille Rivera',   initials: 'CR', roles: ['fsm'], level: 'L2', defaultCrew: 'c10' },
  { id: 'p20', name: 'Theo Marchetti',   initials: 'TM', roles: ['fsm'], level: 'L1', defaultCrew: 'c10' },
];

// ============ CREWS ============
// A "crew" = a default grouping of people + a truck. Composition is flexible per job.
const CREWS = [
  { id: 'c1',  name: "Holloway Crew",  type: 'install',     lead: 'p1',  members: ['p1','p6','p11'],  truck: 't1', color: '#3CD567' },
  { id: 'c2',  name: "Reyes Crew",     type: 'install',     lead: 'p2',  members: ['p2','p7'],         truck: 't2', color: '#1F8A5B' },
  { id: 'c3',  name: "Bennett Crew",   type: 'install',     lead: 'p3',  members: ['p3','p8','p12'],   truck: 't3', color: '#4FB3E8' },
  { id: 'c4',  name: "Park Crew",      type: 'install',     lead: 'p4',  members: ['p4','p9'],         truck: 't4', color: '#6B5BCF' },
  { id: 'c5',  name: "Chen Crew",      type: 'install',     lead: 'p5',  members: ['p5','p10','p13'],  truck: 't5', color: '#FFB627' },
  { id: 'c6',  name: "Pine Electric",  type: 'electrical',  lead: 'p14', members: ['p14'],             truck: 't6', color: '#B95F1D' },
  { id: 'c7',  name: "Brooks Electric",type: 'electrical',  lead: 'p15', members: ['p15'],             truck: 't7', color: '#8A5500' },
  { id: 'c8',  name: "Walsh Electric", type: 'electrical',  lead: 'p16', members: ['p16'],             truck: 't8', color: '#C53030' },
  { id: 'c9',  name: "Doyle Plumbing", type: 'plumbing',    lead: 'p17', members: ['p17','p18'],       truck: 't9', color: '#2A6F94' },
  { id: 'c10', name: "Sales Team",     type: 'sales',       lead: 'p19', members: ['p19','p20'],       truck: null, color: '#ACAA93' },
];

// ============ TRUCKS / VANS ============
const TRUCKS = [
  { id: 't1', name: 'Truck 07', plate: 'JTN-0007', kind: 'install',  capacity: 'Heat pump + tools',   assignedCrew: 'c1', vin: '1FTBR1Y8...07' },
  { id: 't2', name: 'Truck 12', plate: 'JTN-0012', kind: 'install',  capacity: 'Heat pump + tools',   assignedCrew: 'c2', vin: '1FTBR1Y8...12' },
  { id: 't3', name: 'Truck 14', plate: 'JTN-0014', kind: 'install',  capacity: 'Heat pump + tools',   assignedCrew: 'c3', vin: '1FTBR1Y8...14' },
  { id: 't4', name: 'Truck 21', plate: 'JTN-0021', kind: 'install',  capacity: 'Heat pump + tools',   assignedCrew: 'c4', vin: '1FTBR1Y8...21' },
  { id: 't5', name: 'Truck 22', plate: 'JTN-0022', kind: 'install',  capacity: 'Heat pump + tools',   assignedCrew: 'c5', vin: '1FTBR1Y8...22' },
  { id: 't6', name: 'Van 03',   plate: 'JTN-V003', kind: 'electrical',capacity: 'Panel + wire',       assignedCrew: 'c6', vin: '1GCRW...03' },
  { id: 't7', name: 'Van 05',   plate: 'JTN-V005', kind: 'electrical',capacity: 'Panel + wire',       assignedCrew: 'c7', vin: '1GCRW...05' },
  { id: 't8', name: 'Van 06',   plate: 'JTN-V006', kind: 'electrical',capacity: 'Panel + wire',       assignedCrew: 'c8', vin: '1GCRW...06' },
  { id: 't9', name: 'Van 08',   plate: 'JTN-V008', kind: 'plumbing',  capacity: 'Plumb + tank rig',   assignedCrew: 'c9', vin: '1GCRW...08' },
  { id: 't10',name: 'Truck 18', plate: 'JTN-0018', kind: 'install',   capacity: 'Heat pump + tools',  assignedCrew: null,  vin: '1FTBR1Y8...18', status: 'shop' },
  { id: 't11',name: 'Van 10',   plate: 'JTN-V010', kind: 'electrical',capacity: 'Spare van',          assignedCrew: null,  vin: '1GCRW...10', status: 'available' },
];

// ============ CUSTOMERS ============
const CUSTOMERS = [
  { id: 'cu1', name: 'Margaret Chen',    address: '142 Elm Ridge Rd · Newton, MA',     phone: '(617) 555-0142', hubspot: 'CONT-8821' },
  { id: 'cu2', name: 'David Patel',      address: '87 Sycamore Ave · Brookline, MA',   phone: '(617) 555-0287', hubspot: 'CONT-8822' },
  { id: 'cu3', name: 'Rachel Sondheim',  address: '305 Walnut St · Cambridge, MA',     phone: '(617) 555-0305', hubspot: 'CONT-8823' },
  { id: 'cu4', name: 'Tomás Vega',       address: '12 Linden Ln · Somerville, MA',     phone: '(617) 555-0012', hubspot: 'CONT-8824' },
  { id: 'cu5', name: 'Priya Iyer',       address: '498 Beacon St · Boston, MA',        phone: '(617) 555-0498', hubspot: 'CONT-8825' },
  { id: 'cu6', name: 'Garrett & Sasha M.',address: '23 Hawthorne Ct · Arlington, MA',  phone: '(617) 555-0023', hubspot: 'CONT-8826' },
  { id: 'cu7', name: 'Nadia Okafor',     address: '76 Beech St · Watertown, MA',       phone: '(617) 555-0076', hubspot: 'CONT-8827' },
  { id: 'cu8', name: 'Beck Family',      address: '210 Pleasant St · Belmont, MA',     phone: '(617) 555-0210', hubspot: 'CONT-8828' },
  { id: 'cu9', name: 'Lin Household',    address: '54 Pine Hill Rd · Newton, MA',      phone: '(617) 555-0054', hubspot: 'CONT-8829' },
  { id: 'cu10',name: 'Olive Park Café',  address: '8 Mass Ave · Cambridge, MA',        phone: '(617) 555-0008', hubspot: 'CONT-8830' },
  { id: 'cu11',name: 'Devereaux Estate', address: '901 Highland Pl · Brookline, MA',   phone: '(617) 555-0901', hubspot: 'CONT-8831' },
  { id: 'cu12',name: 'Aiden Wallace',    address: '17 Cedar Ct · Medford, MA',         phone: '(617) 555-0017', hubspot: 'CONT-8832' },
];

// ============ PROJECTS ============
// A project is a scope of work tied to a customer/property (HubSpot deal).
// Multiple projects can live under one customer (e.g. 2024 HP install + 2026 panel upgrade).
// Jobs belong to a project (except one-off sales walk-throughs + meetings).
//
// Statuses:
//   proposed     — quote out, not yet signed
//   sold         — contract signed, no work scheduled yet
//   in_progress  — work scheduled or partially complete
//   complete     — all jobs done, project closed
//   warranty     — complete + still under warranty/care plan
//   cancelled    — lost/cancelled
const PROJECTS = [
  { id: 'PRJ-2401', customer: 'cu1', name: 'Whole-home heat pump retrofit', type: 'install',
    status: 'in_progress', soldDate: '2026-04-22', targetCompletion: '2026-05-25',
    value: 14995, hubspotDealId: 'DEAL-44218', primaryCrew: 'c1',
    description: 'Replace oil furnace + AC with 4-ton heat pump. Electrical handoff included.',
    designNotes: 'ODU goes on east side. Panel sized for new circuit.' },

  { id: 'PRJ-2402', customer: 'cu2', name: 'Heat pump replacement', type: 'install',
    status: 'in_progress', soldDate: '2026-04-30', targetCompletion: '2026-05-22',
    value: 16450, hubspotDealId: 'DEAL-44219', primaryCrew: 'c2',
    description: '5-ton heat pump install. Existing ducts reused.' },

  { id: 'PRJ-2403', customer: 'cu3', name: 'HP install — Cambridge', type: 'install',
    status: 'in_progress', soldDate: '2026-05-02', targetCompletion: '2026-05-22',
    value: 15820, hubspotDealId: 'DEAL-44220', primaryCrew: 'c3',
    description: '4-ton heat pump + thermostat. Customer cares about quiet operation.' },
  { id: 'PRJ-2403b', customer: 'cu3', name: 'Care Plus subscription', type: 'service',
    status: 'warranty', soldDate: '2025-08-01', targetCompletion: '2026-08-01',
    value: 240, hubspotDealId: 'DEAL-43101', primaryCrew: 'c4',
    description: 'Annual tune-up + priority service for original 2024 install.' },

  { id: 'PRJ-2404', customer: 'cu4', name: 'Heat pump water heater', type: 'install',
    status: 'in_progress', soldDate: '2026-05-08', targetCompletion: '2026-05-22',
    value: 5995, hubspotDealId: 'DEAL-44225', primaryCrew: 'c9',
    description: '80gal HPWH. Replaces 50gal gas tank in basement.',
    designNotes: 'Electrician slot still unfilled — needs assignment.' },

  { id: 'PRJ-2405', customer: 'cu5', name: 'Smart system retrofit', type: 'retrofit',
    status: 'in_progress', soldDate: '2026-05-12', targetCompletion: '2026-05-21',
    value: 1490, hubspotDealId: 'DEAL-44229', primaryCrew: 'c7' },

  { id: 'PRJ-2406', customer: 'cu6', name: 'Care Plus subscription', type: 'service',
    status: 'warranty', soldDate: '2025-05-01', targetCompletion: '2026-05-01',
    value: 240, hubspotDealId: 'DEAL-42210', primaryCrew: 'c4',
    description: 'Annual tune-up for 2024 install.' },

  { id: 'PRJ-2407', customer: 'cu7', name: 'Heat pump install (2024)', type: 'install',
    status: 'warranty', soldDate: '2024-09-15', targetCompletion: '2024-10-30',
    value: 14200, hubspotDealId: 'DEAL-39812', primaryCrew: 'c4',
    description: 'Original install. Capacitor replaced under warranty May 21.' },

  { id: 'PRJ-2408', customer: 'cu8', name: 'Heat pump install (2024)', type: 'install',
    status: 'warranty', soldDate: '2024-08-20', targetCompletion: '2024-10-14',
    value: 16100, hubspotDealId: 'DEAL-39655', primaryCrew: 'c5',
    description: 'Returning for noisy fan callback.' },

  { id: 'PRJ-2409', customer: 'cu10', name: 'Commercial HP — café back room', type: 'install',
    status: 'sold', soldDate: '2026-05-18', targetCompletion: '2026-06-15',
    value: 24500, hubspotDealId: 'DEAL-44231', primaryCrew: 'c1',
    description: 'Light commercial HP for café office + storage.',
    designNotes: 'Ductwork may need re-routing. Walk-through booked.' },

  { id: 'PRJ-2410', customer: 'cu12', name: 'Panel upgrade 100→200A', type: 'install',
    status: 'sold', soldDate: '2026-05-19', targetCompletion: '2026-06-01',
    value: 2890, hubspotDealId: 'DEAL-44232', primaryCrew: 'c7' },

  { id: 'PRJ-2411', customer: 'cu9', name: 'Heat pump consultation', type: 'walkthrough',
    status: 'proposed', soldDate: null, targetCompletion: null,
    value: null, hubspotDealId: 'DEAL-44240', primaryCrew: 'c10',
    description: 'Sales walk-through booked for May 21. Quote pending.' },

  { id: 'PRJ-2412', customer: 'cu11', name: 'Whole-home electrification scope', type: 'walkthrough',
    status: 'proposed', soldDate: null, targetCompletion: null,
    value: null, hubspotDealId: 'DEAL-44241', primaryCrew: 'c10',
    description: 'Large estate. Multi-phase project under discussion.' },
];


// Branch / market organization. Picker at the top of every screen filters by region.
const REGIONS = [
  { id: 'co', name: 'Colorado', short: 'CO',
    subs: [
      { id: 'co-nd', name: 'North Denver',     headcount: 24, crews: 4 },
      { id: 'co-d',  name: 'Denver',           headcount: 38, crews: 7 },
      { id: 'co-cs', name: 'Colorado Springs', headcount: 18, crews: 3 },
      { id: 'co-bo', name: 'Boulder',          headcount: 12, crews: 2 },
    ],
  },
  { id: 'ny', name: 'New York', short: 'NY',
    subs: [
      { id: 'ny-all', name: 'New York (statewide)', headcount: 79, crews: 15 },
    ],
  },
  { id: 'va', name: 'Vancouver', short: 'YVR',
    subs: [
      { id: 'va-dt', name: 'Downtown',     headcount: 11, crews: 2 },
      { id: 'va-ns', name: 'North Shore',  headcount: 8,  crews: 2 },
      { id: 'va-su', name: 'Surrey',       headcount: 14, crews: 3 },
      { id: 'va-bn', name: 'Burnaby',      headcount: 10, crews: 2 },
    ],
  },
];

// ============ CHECKLISTS / FORMS ============
// Forms are job-type-specific. Each item has a type: checkbox | photo | single | multi | number | text | signature
// Required items gate job completion.
const CHECKLISTS = {
  heatpump: [
    { section: 'Pre-install', items: [
      { id:'hp-p1', type:'checkbox', label:'Equipment matches sales order',    required: true },
      { id:'hp-p2', type:'photo',    label:'Existing system (before)',         required: true, minPhotos: 2 },
      { id:'hp-p3', type:'single',   label:'Floor protection used',            required: true, options:['Drop cloth','Cardboard','Plastic sheeting','Combination'] },
      { id:'hp-p4', type:'checkbox', label:'Customer walk-through complete',   required: true },
      { id:'hp-p5', type:'checkbox', label:'Lockout / tagout existing system', required: true },
    ]},
    { section: 'Mechanical', items: [
      { id:'hp-m1', type:'checkbox', label:'Refrigerant recovered (R-410A logged)', required: true },
      { id:'hp-m2', type:'multi',    label:'Tests performed', required: true,
        options:['Nitrogen pressure test','Triple evacuation','Vacuum hold (500\u00b5)','Line set flush'] },
      { id:'hp-m3', type:'number',   label:'Vacuum hold (microns, must be \u2264 500)', required: true, unit:'\u00b5', max: 500 },
      { id:'hp-m4', type:'photo',    label:'New outdoor unit installed', required: true, minPhotos: 1 },
      { id:'hp-m5', type:'photo',    label:'New air handler installed', required: true, minPhotos: 1 },
      { id:'hp-m6', type:'checkbox', label:'Condensate drain + trap installed', required: true },
    ]},
    { section: 'Electrical (handoff)', items: [
      { id:'hp-e1', type:'checkbox', label:'Dedicated 240V circuit landed', required: true },
      { id:'hp-e2', type:'checkbox', label:'Disconnect installed within sight', required: true },
      { id:'hp-e3', type:'checkbox', label:'Grounding verified', required: true },
      { id:'hp-e4', type:'photo',    label:'Panel + disconnect photo', required: true, minPhotos: 1 },
    ]},
    { section: 'Commissioning', items: [
      { id:'hp-c1', type:'number',   label:'Outdoor temp (\u00b0F)', required: true, unit:'\u00b0F' },
      { id:'hp-c2', type:'number',   label:'Supply air temp (\u00b0F)', required: true, unit:'\u00b0F' },
      { id:'hp-c3', type:'number',   label:'Return air temp (\u00b0F)', required: true, unit:'\u00b0F' },
      { id:'hp-c4', type:'single',   label:'Refrigerant charge method', required: true, options:['Weighed in','Subcooling','Superheat'] },
      { id:'hp-c5', type:'checkbox', label:'Jetson thermostat paired', required: true },
      { id:'hp-c6', type:'photo',    label:'Completed install (after)', required: true, minPhotos: 2 },
      { id:'hp-c7', type:'text',     label:'Notes for office', required: false, placeholder:'Anything dispatch needs to know\u2026' },
      { id:'hp-c8', type:'signature',label:'Customer sign-off', required: true },
    ]},
  ],
  service: [
    { section: 'Diagnosis', items: [
      { id:'sv-d1', type:'text',     label:'Customer-reported issue', required: true },
      { id:'sv-d2', type:'multi',    label:'Symptoms observed', required: true,
        options:['No heat','No cool','Short cycling','Noisy operation','Water leak','Thermostat issue','Other'] },
      { id:'sv-d3', type:'photo',    label:'Issue documentation', required: false, minPhotos: 1 },
    ]},
    { section: 'Diagnosis readings', items: [
      { id:'sv-r1', type:'number',   label:'Suction pressure (psi)', required: true, unit:'psi' },
      { id:'sv-r2', type:'number',   label:'Liquid pressure (psi)',  required: true, unit:'psi' },
      { id:'sv-r3', type:'number',   label:'Superheat (\u00b0F)',    required: false, unit:'\u00b0F' },
    ]},
    { section: 'Repair', items: [
      { id:'sv-rp1', type:'text',     label:'Root cause + repair performed', required: true },
      { id:'sv-rp2', type:'checkbox', label:'System retested after repair',  required: true },
      { id:'sv-rp3', type:'photo',    label:'Repair photo', required: false, minPhotos: 1 },
      { id:'sv-rp4', type:'signature',label:'Customer sign-off', required: true },
    ]},
  ],
  water: [
    { section: 'Pre-install', items: [
      { id:'wh-p1', type:'checkbox', label:'Water shut off + tank drained', required: true },
      { id:'wh-p2', type:'checkbox', label:'Dedicated circuit available',   required: true },
      { id:'wh-p3', type:'photo',    label:'Existing water heater (before)',required: true, minPhotos: 1 },
    ]},
    { section: 'Install', items: [
      { id:'wh-i1', type:'checkbox', label:'Old water heater removed',     required: true },
      { id:'wh-i2', type:'checkbox', label:'New HPWH positioned + secured',required: true },
      { id:'wh-i3', type:'checkbox', label:'Supply + drain lines connected',required: true },
      { id:'wh-i4', type:'checkbox', label:'Condensate drain installed',   required: true },
      { id:'wh-i5', type:'number',   label:'Tank temp setting (\u00b0F)',  required: true, unit:'\u00b0F' },
    ]},
    { section: 'Commissioning', items: [
      { id:'wh-c1', type:'checkbox', label:'Power on + verified operation', required: true },
      { id:'wh-c2', type:'photo',    label:'Completed install (after)', required: true, minPhotos: 1 },
      { id:'wh-c3', type:'signature',label:'Customer sign-off', required: true },
    ]},
  ],
  electrical: [
    { section: 'Pre-install', items: [
      { id:'el-p1', type:'checkbox', label:'Power shut off at meter', required: true },
      { id:'el-p2', type:'checkbox', label:'Permit posted on site', required: true },
      { id:'el-p3', type:'photo',    label:'Existing panel (before)', required: true, minPhotos: 2 },
    ]},
    { section: 'Install', items: [
      { id:'el-i1', type:'single',   label:'New service size', required: true, options:['100A','150A','200A','400A'] },
      { id:'el-i2', type:'checkbox', label:'Grounding electrode verified', required: true },
      { id:'el-i3', type:'checkbox', label:'All circuits labeled', required: true },
      { id:'el-i4', type:'photo',    label:'New panel (after)', required: true, minPhotos: 2 },
    ]},
    { section: 'Inspection', items: [
      { id:'el-in1', type:'single',  label:'Inspection status', required: true, options:['Passed','Failed','Pending'] },
      { id:'el-in2', type:'signature',label:'Customer sign-off', required: true },
    ]},
  ],
  retrofit: [
    { section: 'Install', items: [
      { id:'rt-i1', type:'checkbox', label:'Old thermostat removed', required: true },
      { id:'rt-i2', type:'checkbox', label:'Jetson thermostat installed', required: true },
      { id:'rt-i3', type:'checkbox', label:'Hub paired to network', required: true },
      { id:'rt-i4', type:'multi',    label:'Sensors deployed', required: false, options:['Living room','Bedroom','Office','Basement','Other'] },
      { id:'rt-i5', type:'photo',    label:'Installed thermostat', required: true, minPhotos: 1 },
      { id:'rt-i6', type:'checkbox', label:'Customer app walk-through', required: true },
      { id:'rt-i7', type:'signature',label:'Customer sign-off', required: true },
    ]},
  ],
  warranty:    [ { section:'Repair', items:[
    { id:'wa-1', type:'text',     label:'Issue + resolution', required: true },
    { id:'wa-2', type:'photo',    label:'Repair photo', required: false, minPhotos: 1 },
    { id:'wa-3', type:'signature',label:'Customer sign-off', required: true },
  ]}],
  callback:    [ { section:'Resolution', items:[
    { id:'cb-1', type:'text',     label:'Original issue + fix', required: true },
    { id:'cb-2', type:'photo',    label:'Resolved (after)', required: true, minPhotos: 1 },
    { id:'cb-3', type:'signature',label:'Customer sign-off', required: true },
  ]}],
  walkthrough: [ { section:'Survey', items:[
    { id:'ws-1', type:'multi',    label:'Existing system', required: true, options:['Forced air','Boiler','Mini-split','Window unit','None'] },
    { id:'ws-2', type:'number',   label:'Square footage',  required: true, unit:'sqft' },
    { id:'ws-3', type:'photo',    label:'Site photos',     required: true, minPhotos: 4 },
    { id:'ws-4', type:'text',     label:'Customer goals',  required: true },
    { id:'ws-5', type:'signature',label:'Survey acknowledged', required: false },
  ]}],
  meeting: [],
};

// Mock responses for completed jobs (shown read-only on dispatcher drawer)
const CHECKLIST_RESPONSES = {
  'J-2580': {
    'hp-p1': true, 'hp-p2': 2, 'hp-p3': 'Drop cloth', 'hp-p4': true, 'hp-p5': true,
    'hp-m1': true, 'hp-m2': ['Nitrogen pressure test','Triple evacuation','Vacuum hold (500\u00b5)'],
    'hp-m3': 380, 'hp-m4': 1, 'hp-m5': 1, 'hp-m6': true,
    'hp-e1': true, 'hp-e2': true, 'hp-e3': true, 'hp-e4': 1,
    'hp-c1': 58, 'hp-c2': 102, 'hp-c3': 72, 'hp-c4': 'Subcooling',
    'hp-c5': true, 'hp-c6': 3, 'hp-c7': 'Replaced disconnect at customer request — billed separately. Customer was very pleased.',
    'hp-c8': { name: 'M. Patel', when: 'May 20 4:32p' },
  },
  'J-2581': {
    'sv-d1': 'Customer reports unit not cooling overnight on hot days.',
    'sv-d2': ['No cool','Short cycling'],
    'sv-d3': 1,
    'sv-r1': 68, 'sv-r2': 198, 'sv-r3': 12,
    'sv-rp1': 'Low refrigerant due to slow leak at line set flare. Reflared, leak-checked, charged.',
    'sv-rp2': true, 'sv-rp3': 1,
    'sv-rp4': { name: 'R. Sondheim', when: 'May 20 4:48p' },
  },
};

// HELPERS for checklist completion
function isItemAnswered(item, response) {
  if (response === undefined || response === null) return false;
  if (item.type === 'checkbox') return response === true;
  if (item.type === 'photo')    return (typeof response === 'number' ? response : (response?.length || 0)) >= (item.minPhotos || 1);
  if (item.type === 'multi')    return Array.isArray(response) && response.length > 0;
  if (item.type === 'single')   return typeof response === 'string' && response.length > 0;
  if (item.type === 'number')   return typeof response === 'number';
  if (item.type === 'text')     return typeof response === 'string' && response.trim().length > 0;
  if (item.type === 'signature')return !!(response && response.name);
  return false;
}
function checklistProgress(jobType, responses) {
  const sections = CHECKLISTS[jobType] || [];
  const allItems = sections.flatMap(s => s.items);
  const required = allItems.filter(i => i.required);
  const requiredDone = required.filter(i => isItemAnswered(i, responses?.[i.id])).length;
  const totalDone = allItems.filter(i => isItemAnswered(i, responses?.[i.id])).length;
  return { totalItems: allItems.length, totalDone, requiredItems: required.length, requiredDone, complete: requiredDone === required.length };
}

// ============ HELPERS ============
const TODAY = new Date(2026, 4, 21); // May 21 2026 — matches current date

function dateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtDate(d, opts) {
  return d.toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTime(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const period = h >= 12 ? 'p' : 'a';
  const h12 = ((h + 11) % 12) + 1;
  return h12 + (m ? ':' + String(m).padStart(2,'0') : '') + period;
}
function hoursToStr(h) {
  if (h === 1) return '1 hr';
  if (h % 1 === 0) return h + ' hrs';
  return h + ' hrs';
}

// Multi-day helpers
function multidaySiblings(job) {
  if (!job?.multidayGroupId) return [];
  return JOBS.filter(j => j.multidayGroupId === job.multidayGroupId).sort((a, b) => (a.multidayIndex || 0) - (b.multidayIndex || 0));
}
function continuationChain(job) {
  // Walk back to the original, then forward through any continuations
  let head = job;
  while (head.continuationOf) {
    const parent = JOBS.find(j => j.id === head.continuationOf);
    if (!parent) break;
    head = parent;
  }
  const chain = [head];
  let cur = head;
  while (true) {
    const next = JOBS.find(j => j.continuationOf === cur.id);
    if (!next) break;
    chain.push(next);
    cur = next;
  }
  return chain;
}

// Build a job
function makeJob(args) {
  const tpl = JOB_TEMPLATES[args.type];
  const slots = (args.slots || tpl.slots).map((s, i) => ({
    id: args.id + '-s' + i,
    role: s.role,
    level: s.level,
    hours: s.hours,
    start: s.start,
    optional: s.optional || false,
    assignedTo: s.assignedTo || null,
  }));
  return {
    id: args.id,
    type: args.type,
    status: args.status || 'scheduled',
    customer: args.customer,
    date: args.date,                   // 'YYYY-MM-DD'
    startHour: args.startHour,         // 0..24, decimal
    durationHrs: args.durationHrs || Math.max(...slots.map(s => s.start + s.hours), 1),
    crewId: args.crewId || null,       // primary lead crew/truck
    extraCrewIds: args.extraCrewIds || [],  // electrical sub, etc.
    truckId: args.truckId || null,
    slots,
    notes: args.notes || '',
    address: args.address,
    hubspotDealId: args.hubspotDealId,
    driveTimeMin: args.driveTimeMin || 18,
    price: args.price,
    multidayGroupId: args.multidayGroupId || null,
    multidayIndex:   args.multidayIndex || null,
    multidayTotal:   args.multidayTotal || null,
    continuationOf:  args.continuationOf || null,
  };
}

// Seed jobs across today + the next several days, plus a few yesterday/tomorrow
const T = dateKey(TODAY);
const Tm1 = dateKey(addDays(TODAY,-1));
const Tp1 = dateKey(addDays(TODAY, 1));
const Tp2 = dateKey(addDays(TODAY, 2));
const Tp3 = dateKey(addDays(TODAY, 3));
const Tp4 = dateKey(addDays(TODAY, 4));

const JOBS = [
  // ===== TODAY =====
  makeJob({ id: 'J-2614', type: 'heatpump',   status: 'onsite',   customer: 'cu1', address: '142 Elm Ridge Rd · Newton',
    date: T, startHour: 8, crewId: 'c1', extraCrewIds: ['c6'], truckId: 't1',
    slots: [
      { role: 'hvac_lead',     level:'L2', hours:8, start:0, assignedTo:'p1' },
      { role: 'hvac_installer',level:'L1', hours:8, start:0, assignedTo:'p6' },
      { role: 'apprentice',    level:'L1', hours:8, start:0, assignedTo:'p11', optional:true },
      { role: 'electrician',   level:'L2', hours:3, start:4, assignedTo:'p14' },
    ],
    hubspotDealId: 'DEAL-44218', price: 14995, notes: 'ODU Goes on East Side of Home',
    multidayGroupId: 'MD-2614', multidayIndex: 1, multidayTotal: 2 }),

  // Day 2 of Margaret Chen install — pre-planned continuation
  // Run by Reyes Crew while Holloway moves to next job — Tyree is on loan for Day 2
  makeJob({ id: 'J-2614b', type: 'heatpump',   status: 'scheduled', customer: 'cu1', address: '142 Elm Ridge Rd · Newton',
    date: Tp1, startHour: 8, crewId: 'c2', truckId: 't2',
    slots: [
      { role: 'hvac_lead',     level:'L3', hours:4, start:0, assignedTo:'p2' },
      { role: 'hvac_installer',level:'L1', hours:4, start:0, assignedTo:'p6' },
    ],
    durationHrs: 4,
    notes: 'Day 2 — commissioning + thermostat pairing + customer walk-through. Tyree on loan from Holloway Crew (continuity).',
    multidayGroupId: 'MD-2614', multidayIndex: 2, multidayTotal: 2 }),

  makeJob({ id: 'J-2615', type: 'heatpump',   status: 'enroute', customer: 'cu2', address: '87 Sycamore Ave · Brookline',
    date: T, startHour: 8.5, crewId: 'c2', extraCrewIds: ['c7'], truckId: 't2',
    slots: [
      { role: 'hvac_lead',     level:'L3', hours:8, start:0, assignedTo:'p2' },
      { role: 'hvac_installer',level:'L2', hours:8, start:0, assignedTo:'p7' },
      { role: 'electrician',   level:'L2', hours:3, start:5, assignedTo:'p15' },
    ],
    hubspotDealId: 'DEAL-44219', price: 16450 }),

  makeJob({ id: 'J-2611', type: 'heatpump',   status: 'scheduled', customer: 'cu3', address: '305 Walnut St · Cambridge',
    date: T, startHour: 9, crewId: 'c3', extraCrewIds: ['c8'], truckId: 't3',
    slots: [
      { role: 'hvac_lead',     level:'L2', hours:8, start:0, assignedTo:'p3' },
      { role: 'hvac_installer',level:'L2', hours:8, start:0, assignedTo:'p8' },
      { role: 'apprentice',    level:'L1', hours:8, start:0, assignedTo:'p12', optional:true },
      { role: 'electrician',   level:'L2', hours:3, start:4, assignedTo:'p16' },
    ],
    hubspotDealId: 'DEAL-44220', price: 15820 }),

  makeJob({ id: 'J-2622', type: 'water',      status: 'onsite',  customer: 'cu4', address: '12 Linden Ln · Somerville',
    date: T, startHour: 8, crewId: 'c9', truckId: 't9',
    slots: [
      { role: 'plumber',    level:'L2', hours:5, start:0, assignedTo:'p17' },
      { role: 'apprentice', level:'L1', hours:5, start:0, assignedTo:'p18' },
      { role: 'electrician',level:'L1', hours:2, start:1, assignedTo:null }, // unfilled — needs assignment
    ],
    hubspotDealId: 'DEAL-44225', price: 5995, notes: 'Electrician slot unfilled — assign before 9a' }),

  makeJob({ id: 'J-2628', type: 'retrofit',   status: 'scheduled', customer: 'cu5', address: '498 Beacon St · Boston',
    date: T, startHour: 13.5, crewId: 'c7', truckId: 't7',
    slots: [
      { role: 'electrician', level:'L2', hours:2, start:0, assignedTo:'p15' },
    ],
    hubspotDealId: 'DEAL-44229', price: 1490 }),

  makeJob({ id: 'J-2630', type: 'service',    status: 'scheduled', customer: 'cu6', address: '23 Hawthorne Ct · Arlington',
    date: T, startHour: 10, crewId: 'c4', truckId: 't4',
    slots: [{ role:'hvac_installer', level:'L2', hours:2, start:0, assignedTo:'p9' }],
    notes: 'Annual Care Plus tune-up' }),

  makeJob({ id: 'J-2631', type: 'warranty',   status: 'scheduled', customer: 'cu7', address: '76 Beech St · Watertown',
    date: T, startHour: 13, crewId: 'c4', truckId: 't4',
    slots: [{ role:'hvac_installer', level:'L2', hours:2, start:0, assignedTo:'p9' }],
    notes: 'Capacitor replacement under warranty' }),

  makeJob({ id: 'J-2632', type: 'callback',   status: 'callback', customer: 'cu8', address: '210 Pleasant St · Belmont',
    date: T, startHour: 15.5, crewId: 'c5', truckId: 't5',
    slots: [{ role:'hvac_lead', level:'L2', hours:1.5, start:0, assignedTo:'p5' }],
    notes: 'Returning to fix noisy fan — completed install 5/14' }),

  makeJob({ id: 'J-2640', type: 'walkthrough',status: 'scheduled', customer: 'cu9', address: '54 Pine Hill Rd · Newton',
    date: T, startHour: 11, crewId: 'c10',
    slots: [{ role:'fsm', level:'L2', hours:1.5, start:0, assignedTo:'p19' }] }),

  makeJob({ id: 'J-2641', type: 'walkthrough',status: 'scheduled', customer: 'cu11', address: '901 Highland Pl · Brookline',
    date: T, startHour: 14.5, crewId: 'c10',
    slots: [{ role:'fsm', level:'L1', hours:1.5, start:0, assignedTo:'p20' }] }),

  makeJob({ id: 'J-2645', type: 'meeting',    status: 'scheduled', customer: null, address: 'Jetson HQ · Watertown',
    date: T, startHour: 7, crewId: 'c1',
    slots: [], durationHrs: 0.5,
    notes: 'Morning huddle — all install crews' }),

  // ===== UNSCHEDULED (today's queue) =====
  makeJob({ id: 'J-2650', type: 'heatpump',   status: 'unscheduled', customer: 'cu10', address: '8 Mass Ave · Cambridge',
    date: null, startHour: null,
    hubspotDealId: 'DEAL-44231', price: 24500, notes: 'Light commercial — café back room' }),
  makeJob({ id: 'J-2651', type: 'electrical', status: 'unscheduled', customer: 'cu12', address: '17 Cedar Ct · Medford',
    date: null, startHour: null,
    hubspotDealId: 'DEAL-44232', price: 2890, notes: '100A → 200A panel upgrade' }),
  makeJob({ id: 'J-2652', type: 'callback',   status: 'unscheduled', customer: 'cu1', address: '142 Elm Ridge Rd · Newton',
    date: null, startHour: null,
    notes: 'Thermostat pairing issue — same-day request' }),

  // ===== TOMORROW =====
  makeJob({ id: 'J-2660', type: 'heatpump',   status: 'scheduled', customer: 'cu5', address: '498 Beacon St · Boston',
    date: Tp1, startHour: 8, crewId: 'c1', extraCrewIds:['c6'], truckId: 't1',
    slots: [
      { role: 'hvac_lead',     level:'L3', hours:8, start:0, assignedTo:'p1' },
      { role: 'hvac_installer',level:'L2', hours:8, start:0, assignedTo:'p6' },
      { role: 'apprentice',    level:'L1', hours:8, start:0, assignedTo:'p11', optional:true },
      { role: 'electrician',   level:'L2', hours:3, start:4, assignedTo:'p14' },
    ], price: 17200 }),
  makeJob({ id: 'J-2661', type: 'water',      status: 'scheduled', customer: 'cu6', address: '23 Hawthorne Ct · Arlington',
    date: Tp1, startHour: 9, crewId: 'c9', truckId: 't9',
    slots: [
      { role:'plumber',    level:'L2', hours:5, start:0, assignedTo:'p17' },
      { role:'apprentice', level:'L1', hours:5, start:0, assignedTo:'p18' },
      { role:'electrician',level:'L1', hours:2, start:1, assignedTo:'p16' },
    ] }),
  makeJob({ id: 'J-2662', type: 'retrofit',   status: 'scheduled', customer: 'cu7', address: '76 Beech St · Watertown',
    date: Tp1, startHour: 13, crewId: 'c6', truckId: 't6',
    slots:[{ role:'electrician', level:'L3', hours:2, start:0, assignedTo:'p14' }] }),
  makeJob({ id: 'J-2663', type: 'service',    status: 'scheduled', customer: 'cu8', address: '210 Pleasant St · Belmont',
    date: Tp1, startHour: 10, crewId: 'c5', truckId: 't5',
    slots:[{ role:'hvac_installer', level:'L2', hours:2, start:0, assignedTo:'p10' }] }),
  makeJob({ id: 'J-2664', type: 'walkthrough',status: 'scheduled', customer: 'cu12', address: '17 Cedar Ct · Medford',
    date: Tp1, startHour: 14, crewId: 'c10',
    slots:[{ role:'fsm', level:'L2', hours:1.5, start:0, assignedTo:'p19' }] }),

  // ===== YESTERDAY =====
  makeJob({ id: 'J-2580', type: 'heatpump',   status: 'complete', customer: 'cu9', address: '54 Pine Hill Rd · Newton',
    date: Tm1, startHour: 8, crewId: 'c2', extraCrewIds:['c7'], truckId: 't2',
    slots: [
      { role: 'hvac_lead',     level:'L3', hours:8, start:0, assignedTo:'p2' },
      { role: 'hvac_installer',level:'L2', hours:8, start:0, assignedTo:'p7' },
      { role: 'electrician',   level:'L2', hours:3, start:5, assignedTo:'p15' },
    ], price: 16100 }),
  makeJob({ id: 'J-2581', type: 'service', status: 'complete', customer: 'cu3', address: '305 Walnut St · Cambridge',
    date: Tm1, startHour: 14, crewId: 'c4', truckId: 't4',
    slots:[{ role:'hvac_installer', level:'L2', hours:2, start:0, assignedTo:'p9' }] }),

  // ===== Tp2 / Tp3 / Tp4 (smaller fills, used for Week/Month views) =====
  makeJob({ id: 'J-2670', type: 'heatpump', status: 'scheduled', customer: 'cu2', address: '87 Sycamore Ave · Brookline',
    date: Tp2, startHour: 8, crewId: 'c3', extraCrewIds:['c8'], truckId: 't3',
    slots: [
      { role: 'hvac_lead',     level:'L2', hours:8, start:0, assignedTo:'p3' },
      { role: 'hvac_installer',level:'L2', hours:8, start:0, assignedTo:'p8' },
      { role: 'electrician',   level:'L2', hours:3, start:4, assignedTo:'p16' },
    ] }),
  makeJob({ id: 'J-2671', type: 'electrical', status: 'scheduled', customer: 'cu10', address: '8 Mass Ave · Cambridge',
    date: Tp2, startHour: 9, crewId: 'c7', truckId: 't7',
    slots:[
      { role:'electrician', level:'L3', hours:6, start:0, assignedTo:'p15' },
      { role:'apprentice',  level:'L1', hours:6, start:0, assignedTo:'p13' },
    ] }),
  makeJob({ id: 'J-2672', type: 'retrofit', status: 'scheduled', customer: 'cu4', address: '12 Linden Ln · Somerville',
    date: Tp3, startHour: 10, crewId: 'c8', truckId: 't8',
    slots:[{ role:'electrician', level:'L2', hours:2, start:0, assignedTo:'p16' }] }),
  makeJob({ id: 'J-2673', type: 'heatpump', status: 'scheduled', customer: 'cu11', address: '901 Highland Pl · Brookline',
    date: Tp3, startHour: 8, crewId: 'c1', extraCrewIds:['c6'], truckId: 't1',
    slots: [
      { role: 'hvac_lead',     level:'L3', hours:8, start:0, assignedTo:'p1' },
      { role: 'hvac_installer',level:'L1', hours:8, start:0, assignedTo:'p6' },
      { role: 'electrician',   level:'L2', hours:3, start:4, assignedTo:'p14' },
    ] }),
  makeJob({ id: 'J-2674', type: 'water', status: 'scheduled', customer: 'cu8', address: '210 Pleasant St · Belmont',
    date: Tp4, startHour: 8, crewId: 'c9', truckId: 't9',
    slots:[
      { role:'plumber',    level:'L2', hours:5, start:0, assignedTo:'p17' },
      { role:'apprentice', level:'L1', hours:5, start:0, assignedTo:'p18' },
      { role:'electrician',level:'L1', hours:2, start:1, assignedTo:'p15' },
    ] }),
  makeJob({ id: 'J-2675', type: 'service', status: 'scheduled', customer: 'cu7', address: '76 Beech St · Watertown',
    date: Tp2, startHour: 14, crewId: 'c4', truckId: 't4',
    slots:[{ role:'hvac_installer', level:'L2', hours:2, start:0, assignedTo:'p9' }] }),
];

// ============ TIME OFF / AVAILABILITY ============
const TIME_OFF = [
  { id:'to1', personId:'p4',  date:T,    type:'sick',    label:'Out sick' },
  { id:'to2', personId:'p13', date:Tp1,  type:'vacation',label:'PTO' },
  { id:'to3', personId:'p18', date:Tp3,  type:'training',label:'NATE training' },
];

// ============ TIMESHEETS (auto-derived from job status) ============
// derived at runtime by the timesheets view; we also seed a few unsubmitted entries.
const TIMESHEET_OVERRIDES = {
  // personId__dateKey -> { entries: [{job, in, out, notes}], submitted, approved }
};

// ============ UTILITIES ============
function getPerson(id) { return PEOPLE.find(p => p.id === id); }
function getCrew(id) { return CREWS.find(c => c.id === id); }
function getTruck(id) { return TRUCKS.find(t => t.id === id); }
function getCustomer(id) { return CUSTOMERS.find(c => c.id === id); }
function getJobType(t) { return JOB_TYPES[t]; }
function getProject(id) { return PROJECTS.find(p => p.id === id); }
function projectsForCustomer(customerId) { return PROJECTS.filter(p => p.customer === customerId); }
function jobsForProject(projectId) { return JOBS.filter(j => j.projectId === projectId); }
function projectStatusLabel(s) {
  return ({
    proposed:'Proposed', sold:'Sold', in_progress:'In progress',
    complete:'Complete', warranty:'Warranty', cancelled:'Cancelled'
  })[s] || s;
}

// Stitch jobs → projects (one-time, after JOBS array is built)
const _PROJECT_JOB_MAP = {
  'PRJ-2401': ['J-2614', 'J-2614b', 'J-2652'],
  'PRJ-2402': ['J-2615'],
  'PRJ-2403': ['J-2611'],
  'PRJ-2403b': ['J-2581'],
  'PRJ-2404': ['J-2622'],
  'PRJ-2405': ['J-2628'],
  'PRJ-2406': ['J-2630', 'J-2663'],
  'PRJ-2407': ['J-2631'],
  'PRJ-2408': ['J-2632'],
  'PRJ-2409': ['J-2650'],
  'PRJ-2410': ['J-2651', 'J-2671'],
  'PRJ-2411': ['J-2640'],
  'PRJ-2412': ['J-2641'],
};
Object.entries(_PROJECT_JOB_MAP).forEach(([projectId, jobIds]) => {
  jobIds.forEach(jid => {
    const j = JOBS.find(x => x.id === jid);
    if (j) j.projectId = projectId;
  });
});

function jobsOn(date) {
  return JOBS.filter(j => j.date === date);
}
function unscheduledJobs() {
  return JOBS.filter(j => j.status === 'unscheduled');
}
function jobsForCrew(crewId, date) {
  return JOBS.filter(j => j.date === date && (j.crewId === crewId || (j.extraCrewIds || []).includes(crewId)));
}
function statusLabel(s) {
  return ({
    unscheduled:'Unscheduled', scheduled:'Scheduled', enroute:'En route', onsite:'On site',
    complete:'Complete', callback:'Callback'
  })[s] || s;
}

// Auto-suggest crew assignments for a job — simple heuristic
function suggestAssignments(job) {
  const tpl = JOB_TEMPLATES[job.type];
  if (!tpl) return job.slots;
  // For each unfilled slot, find an available person matching role + level
  return job.slots.map(slot => {
    if (slot.assignedTo) return slot;
    const candidate = PEOPLE.find(p =>
      p.roles.includes(slot.role) &&
      (slot.role === 'apprentice' || ['L1','L2','L3'].indexOf(p.level) >= ['L1','L2','L3'].indexOf(slot.level || 'L1'))
    );
    return candidate ? { ...slot, assignedTo: candidate.id, suggested: true } : slot;
  });
}

// Stash everything globally
Object.assign(window, {
  JOB_TYPES, ROLES, JOB_TEMPLATES,
  PEOPLE, CREWS, TRUCKS, CUSTOMERS, JOBS, PROJECTS,
  TIME_OFF, TIMESHEET_OVERRIDES,
  REGIONS, CHECKLISTS, CHECKLIST_RESPONSES,
  TODAY, dateKey, addDays, fmtDate, fmtTime, hoursToStr,
  getPerson, getCrew, getTruck, getCustomer, getJobType,
  getProject, projectsForCustomer, jobsForProject, projectStatusLabel,
  multidaySiblings, continuationChain,
  jobsOn, unscheduledJobs, jobsForCrew, statusLabel, suggestAssignments,
  isItemAnswered, checklistProgress,
});
