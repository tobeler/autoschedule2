// =============================================================
// Jetson Schedule + Dispatch — domain types
// Mirrors the prototype's data.js with explicit types.
// =============================================================

// ---- Job types & status enums ------------------------------------------------

export type JobTypeKey =
  | 'heatpump'
  | 'retrofit'
  | 'water'
  | 'electrical'
  | 'service'
  | 'warranty'
  | 'callback'
  | 'walkthrough'
  | 'meeting'
  // Allow custom user-defined templates created in the wizard
  | (string & {});

export interface JobTypeDef {
  label: string;
  /** CSS var name like 'jt-heatpump' */
  color: string;
  short: string;
}

export type JobStatus =
  | 'unscheduled'
  | 'scheduled'
  | 'enroute'
  | 'onsite'
  | 'complete'
  | 'callback'
  | 'cancelled';

// ---- Roles & people ----------------------------------------------------------

export type RoleKey =
  | 'hvac_lead'
  | 'hvac_installer'
  | 'apprentice'
  | 'electrician'
  | 'plumber'
  | 'fsm';

export type Level = 'L1' | 'L2' | 'L3';

export interface RoleDef {
  label: string;
  short: string;
  needsTruck: boolean;
  levels: Level[];
}

export interface Person {
  id: string;
  name: string;
  initials: string;
  roles: RoleKey[];
  level: Level;
  defaultCrew: string;
  certs?: string[];
  /** Zuper team this person was last imported from (read-only reference). */
  zuperPrimaryTeam?: string | null;
}

// ---- Crews & trucks ----------------------------------------------------------

/**
 * Crew Model v2 (HVAC ops feedback, 2026-05-26):
 *  - `install`  — persistent multi-person install team (default)
 *  - `solo`     — one tech operating as a 1-person crew (service techs)
 *  - `ad_hoc`   — office / float / dispatch / admin / "sub" groupings
 *                 inherited from Zuper. NOT real install crews — hidden
 *                 from default dispatch lanes; appear in a Pool view.
 *  - `electrical` / `plumbing` / `sales` — specialty persistent crews.
 * The trailing `string` fallback keeps Drizzle's `text` column type-
 * compatible for any future values added at the DB level.
 */
export type CrewType =
  | 'install'
  | 'solo'
  | 'ad_hoc'
  | 'electrical'
  | 'plumbing'
  | 'sales'
  | string;

export interface Crew {
  id: string;
  name: string;
  type: CrewType;
  lead: string;
  members: string[];
  truck: string | null;
  /** Brand accent color (hex) */
  color: string;
}

export type TruckKind = 'install' | 'electrical' | 'plumbing' | string;

export type TruckStatus = 'available' | 'shop' | 'assigned';

export interface Truck {
  id: string;
  name: string;
  plate: string;
  kind: TruckKind;
  capacity: string;
  assignedCrew: string | null;
  vin: string;
  status?: TruckStatus;
}

// ---- Customers, projects, regions --------------------------------------------

export interface Customer {
  id: string;
  name: string;
  address: string;
  phone: string;
  /** HubSpot contact id */
  hubspot: string;
}

export type ProjectStatus =
  | 'proposed'
  | 'sold'
  | 'in_progress'
  | 'complete'
  | 'warranty'
  | 'cancelled';

export interface Project {
  id: string;
  /** Customer id */
  customer: string;
  name: string;
  /** Loosely typed: aligns with HubSpot deal `project_type` (Retrofit/New build/etc.) */
  type: string;
  status: ProjectStatus;
  soldDate: string | null;
  targetCompletion: string | null;
  value: number | null;
  hubspotDealId: string | null;
  primaryCrew: string | null;
  description?: string;
  designNotes?: string;
  /** HubSpot native Project record id (objectTypeId 0-970). Drives "Open in HubSpot" affordance. */
  hubspotProjectId?: string | null;
  /** Origin of the record, used to distinguish live native projects from legacy installations. */
  source?: 'native_project' | 'legacy_installation' | 'deal_fallback';
}

export interface SubRegion {
  id: string;
  name: string;
  short?: string;
  headcount: number;
  crews: number;
}

export interface Region {
  id: string;
  name: string;
  short: string;
  subs: SubRegion[];
}

// ---- Templates & job slots ---------------------------------------------------

export interface TemplateSlot {
  role: RoleKey;
  level: Level;
  /** Hours this slot is committed */
  hours: number;
  /** Offset from job start, in hours */
  start: number;
  optional?: boolean;
}

export interface JobTemplate {
  label: string;
  slots: TemplateSlot[];
  /** How many trucks the job typically needs */
  truckCount: number;
}

export interface JobSlot extends TemplateSlot {
  id: string;
  /** Person id, or null when unfilled */
  assignedTo: string | null;
  /** Marked true when auto-suggester filled it */
  suggested?: boolean;
}

// ---- Jobs --------------------------------------------------------------------

export type VehicleMode = 'fleet' | 'personal' | 'none';

export interface Job {
  id: string;
  type: JobTypeKey;
  status: JobStatus;
  /**
   * Human-readable title. Native dispatcher jobs synthesize from customer +
   * job type; Zuper-sourced jobs carry the verbatim Zuper job_title.
   */
  title?: string | null;
  /** Customer id; null for internal events like meetings */
  customer: string | null;
  /** 'YYYY-MM-DD' or null when unscheduled */
  date: string | null;
  /** Hour-of-day (0..24), decimal. null when unscheduled */
  startHour: number | null;
  /** Computed or explicit total duration */
  durationHrs: number;
  /** Primary crew id (lead) */
  crewId: string | null;
  /** Sub-crews participating (e.g. electrical) */
  extraCrewIds: string[];
  /** Primary truck */
  truckId: string | null;
  slots: JobSlot[];
  notes: string;
  address: string;
  hubspotDealId: string | null;
  /** Minutes of drive time from prior stop on this crew's day */
  driveTimeMin: number;
  /** Quote $; not displayed but kept for HubSpot sync */
  price?: number;
  // ---- multi-day affordances ----
  /** Shared id linking planned multi-day jobs */
  multidayGroupId?: string | null;
  /** 1-indexed position within the multi-day group */
  multidayIndex?: number | null;
  /** Total days in the multi-day group */
  multidayTotal?: number | null;
  /** Job id this one continues from (spillover) */
  continuationOf?: string | null;
  /** Project membership */
  projectId?: string | null;
  // ---- vehicle mode (new-job wizard) ----
  vehicleMode?: VehicleMode;
  personalDriverId?: string | null;
  // ---- multi-day range fields produced by wizard ----
  endDate?: string;
  endHour?: number;
  daysSpanned?: number;
  // ---- external system reference ids (read-only; set by sync) ----
  zuperJobUid?: string | null;
  zuperTeamName?: string | null;
  /**
   * Crew Model v2 ad-hoc assignment: a list of person ids for service jobs
   * that need 1–N techs but don't justify a persistent crew. When set,
   * takes precedence over `crewId` for showing techs on the job.
   */
  assignedTechIds?: string[] | null;
}

// ---- Time off ---------------------------------------------------------------

export type TimeOffType = 'sick' | 'vacation' | 'training' | 'pto';

export interface TimeOff {
  id: string;
  personId: string;
  date: string;
  type: TimeOffType;
  label: string;
}

// ---- Time entries (clock-in / clock-out) ------------------------------------

export type TimeEntrySource = 'zuper' | 'native';

/**
 * Real clock punch — one continuous on-the-clock segment for one person.
 *
 * `clockIn` / `clockOut` are ISO timestamps (UTC) returned by the API.
 * `clockOut` is null while the tech is still on the clock.
 * `jobId` may be null when Zuper attributes the punch to a generic shift
 * rather than a specific job.
 */
export interface TimeEntry {
  id: string;
  personId: string;
  jobId: string | null;
  clockIn: string;
  clockOut: string | null;
  source: TimeEntrySource;
  zuperLogId?: string | null;
}

// ---- Completion forms / checklists ------------------------------------------

export type ChecklistItemType =
  | 'checkbox'
  | 'photo'
  | 'single'
  | 'multi'
  | 'number'
  | 'text'
  | 'signature'
  | 'longtext'
  | 'rating';

interface ChecklistItemBase {
  id: string;
  type: ChecklistItemType;
  label: string;
  required: boolean;
}

export interface ChecklistCheckbox extends ChecklistItemBase {
  type: 'checkbox';
}
export interface ChecklistPhoto extends ChecklistItemBase {
  type: 'photo';
  minPhotos?: number;
}
export interface ChecklistSingle extends ChecklistItemBase {
  type: 'single';
  options: string[];
}
export interface ChecklistMulti extends ChecklistItemBase {
  type: 'multi';
  options: string[];
}
export interface ChecklistNumber extends ChecklistItemBase {
  type: 'number';
  unit?: string;
  min?: number;
  max?: number;
}
export interface ChecklistText extends ChecklistItemBase {
  type: 'text' | 'longtext';
  placeholder?: string;
}
export interface ChecklistSignature extends ChecklistItemBase {
  type: 'signature';
}
export interface ChecklistRating extends ChecklistItemBase {
  type: 'rating';
}

export type ChecklistItem =
  | ChecklistCheckbox
  | ChecklistPhoto
  | ChecklistSingle
  | ChecklistMulti
  | ChecklistNumber
  | ChecklistText
  | ChecklistSignature
  | ChecklistRating;

export interface ChecklistSection {
  section: string;
  items: ChecklistItem[];
}

export type ChecklistResponseValue =
  | boolean
  | number
  | string
  | string[]
  | { name: string; when: string }
  | null;

export type ChecklistResponses = Record<string, ChecklistResponseValue>;

// ---- Tweaks (preferences) ----------------------------------------------------

export interface Tweaks {
  density: 'cozy' | 'compact';
  accent: string;
  showDriveTime: boolean;
  dark: boolean;
}

// ---- HubSpot integration ----------------------------------------------------

export interface HubspotFieldMap {
  /** Our entity field key */
  appField: string;
  /** HubSpot property name */
  hsField: string;
  /** 'push' = we write to HubSpot, 'pull' = we read, 'both' = bidirectional */
  direction: 'push' | 'pull' | 'both';
}

export interface HubspotEntityMapping {
  entity: 'contact' | 'deal' | 'job' | 'service_area';
  fields: HubspotFieldMap[];
}
