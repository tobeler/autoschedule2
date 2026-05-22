// =============================================================
// Default HubSpot field mappings for Jetson's real portal (21424670, na1).
//
// Derived from the field-mapping table in
// /Users/work/.claude/plans/curious-toasting-sifakis.md and Jetson's actual
// HubSpot property catalogue snapshotted in `schema-snapshot.json`.
//
// `appField` is the FSM-side field key (matches src/types.ts).
// `hsField` is the HubSpot property name as it appears in the HubSpot API.
// `direction` is 'pull' (HubSpot is source of truth), 'push' (FSM is source
// of truth), or 'both' (bidirectional).
// =============================================================
import type { HubspotEntityMapping } from '../../types';

/** Customer (FSM) ↔ Contact (HubSpot) — mostly read from HubSpot. */
const CUSTOMER_CONTACT: HubspotEntityMapping = {
  entity: 'contact',
  fields: [
    { appField: 'name',             hsField: 'firstname',                direction: 'pull' },
    { appField: 'last_name',        hsField: 'lastname',                 direction: 'pull' },
    { appField: 'email',            hsField: 'email',                    direction: 'both' },
    { appField: 'phone',            hsField: 'phone',                    direction: 'both' },
    { appField: 'address_line_1',   hsField: 'address',                  direction: 'both' },
    { appField: 'address_line_2',   hsField: 'address_line_2',           direction: 'both' },
    { appField: 'city',             hsField: 'city',                     direction: 'both' },
    { appField: 'state',            hsField: 'state',                    direction: 'both' },
    { appField: 'zip',              hsField: 'zip',                      direction: 'both' },
    { appField: 'helio_id',         hsField: 'customer_id',              direction: 'pull' },
    { appField: 'service_area',     hsField: 'service_areas',            direction: 'pull' },
    { appField: 'care_plan_status', hsField: 'jetson_care_status',       direction: 'pull' },
    { appField: 'lead_type',        hsField: 'lead_type',                direction: 'pull' },
    { appField: 'existing_heating', hsField: 'primary_heating_system',   direction: 'pull' },
    { appField: 'existing_cooling', hsField: 'home_cooling_system',      direction: 'pull' },
    { appField: 'home_type',        hsField: 'type_of_home',             direction: 'pull' },
  ],
};

/** Project (FSM) ↔ Deal (HubSpot) — pull + occasional writes. */
const PROJECT_DEAL: HubspotEntityMapping = {
  entity: 'deal',
  fields: [
    { appField: 'name',                   hsField: 'dealname',                direction: 'both' },
    { appField: 'value',                  hsField: 'amount',                  direction: 'pull' },
    { appField: 'status',                 hsField: 'dealstage',               direction: 'pull' },
    { appField: 'hubspot_deal_id',        hsField: 'hs_object_id',            direction: 'pull' },
    { appField: 'sold_date',              hsField: 'closedate',               direction: 'pull' },
    { appField: 'target_install_start',   hsField: 'install_dates',           direction: 'both' },
    { appField: 'target_install_end',     hsField: 'install_end_date',        direction: 'both' },
    { appField: 'walkthrough_date',       hsField: 'walkthrough_date',        direction: 'both' },
    { appField: 'home_assessment_date',   hsField: 'home_assessment_date',    direction: 'pull' },
    { appField: 'permit_status',          hsField: 'permit_status',           direction: 'pull' },
    { appField: 'inspection_status',      hsField: 'inspection_status',       direction: 'both' },
    { appField: 'customer_urgency',       hsField: 'customer_urgency',        direction: 'pull' },
    { appField: 'scheduling_instructions',hsField: 'scheduling_instructions', direction: 'pull' },
    { appField: 'project_type',           hsField: 'project_type',            direction: 'pull' },
    { appField: 'trade',                  hsField: 'trade',                   direction: 'pull' },
    { appField: 'design_notes',           hsField: 'installation_notes',      direction: 'both' },
    { appField: 'heating_load_btus',      hsField: 'heating_load__btus_',     direction: 'pull' },
    { appField: 'main_panel_rating',      hsField: 'main_panel_rating',       direction: 'pull' },
    { appField: 'site_technician',        hsField: 'site_technician',         direction: 'push' },
    { appField: 'point_guard',            hsField: 'point_guard',             direction: 'pull' },
  ],
};

/** Job (FSM) → Job custom object (HubSpot) — we own these records, push only. */
const JOB_PUSH: HubspotEntityMapping = {
  entity: 'job',
  fields: [
    { appField: 'job_id',           hsField: 'fsm_job_id',                  direction: 'push' },
    { appField: 'job_url',          hsField: 'fsm_job_url',                 direction: 'push' },
    { appField: 'status',           hsField: 'fsm_status',                  direction: 'push' },
    { appField: 'scheduled_start',  hsField: 'fsm_scheduled_start_time',    direction: 'push' },
    { appField: 'scheduled_end',    hsField: 'fsm_scheduled_end_time',      direction: 'push' },
    { appField: 'enroute_at',       hsField: 'actuals_en_route_at',         direction: 'push' },
    { appField: 'onsite_at',        hsField: 'actuals_in_progress_at',      direction: 'push' },
    { appField: 'complete_at',      hsField: 'actuals_complete_at',         direction: 'push' },
    { appField: 'time_on_site_hrs', hsField: 'fsm_time_on_site',            direction: 'push' },
    { appField: 'slots_json',       hsField: 'fsm_team_members_json',       direction: 'push' },
    { appField: 'job_type',         hsField: 'job_type',                    direction: 'push' },
    { appField: 'job_name',         hsField: 'job_name',                    direction: 'push' },
    { appField: 'notes',            hsField: 'notes',                       direction: 'push' },
    { appField: 'completion_notes', hsField: 'completion_notes',            direction: 'push' },
    { appField: 'form_responses',   hsField: 'inspection_form_summary_json',direction: 'push' },
    { appField: 'serial_indoor',    hsField: 'serial_number_indoor_unit',   direction: 'push' },
    { appField: 'serial_outdoor',   hsField: 'serial_number_outdoor_unit',  direction: 'push' },
    { appField: 'project_link',     hsField: 'associated_deal',             direction: 'push' },
  ],
};

/** Service Area ↔ Service Area custom object (HubSpot) — pull only, replaces seeded REGIONS. */
const SERVICE_AREA: HubspotEntityMapping = {
  entity: 'service_area',
  fields: [
    { appField: 'name',                       hsField: 'name',                        direction: 'pull' },
    { appField: 'code',                       hsField: 'service_area_code',           direction: 'pull' },
    { appField: 'time_zone',                  hsField: 'time_zone',                   direction: 'pull' },
    { appField: 'status',                     hsField: 'status',                      direction: 'pull' },
    { appField: 'cities',                     hsField: 'cities',                      direction: 'pull' },
    { appField: 'states',                     hsField: 'states',                      direction: 'pull' },
    { appField: 'countries',                  hsField: 'countries',                   direction: 'pull' },
    { appField: 'postal_codes',               hsField: 'postal_codes',                direction: 'pull' },
    { appField: 'heating_design_temp_indoor', hsField: 'heating_indoor_db_temp',      direction: 'pull' },
    { appField: 'heating_design_temp_outdoor',hsField: 'heating_outdoor_db_temp',     direction: 'pull' },
    { appField: 'altitude_derating',          hsField: 'altitude_derating_factor',    direction: 'pull' },
    { appField: 'capacity_margin',            hsField: 'capacity_margin_factor',      direction: 'pull' },
  ],
};

/** Default HubSpot mappings used when the field-mapper UI loads for the first time. */
export const DEFAULT_HUBSPOT_MAPPINGS: HubspotEntityMapping[] = [
  CUSTOMER_CONTACT,
  PROJECT_DEAL,
  JOB_PUSH,
  SERVICE_AREA,
];

/** App-side FSM field catalog — surfaces in the left-side dropdown of the mapper. */
export interface FsmFieldDef {
  key: string;
  label: string;
  type: 'string' | 'text' | 'number' | 'currency' | 'date' | 'datetime' | 'time' | 'bool' | 'enum' | 'ref' | 'id' | 'json';
  required?: boolean;
  readonly?: boolean;
}

export const FSM_FIELDS: Record<HubspotEntityMapping['entity'], FsmFieldDef[]> = {
  contact: [
    { key: 'name',             label: 'First name',          type: 'string', required: true },
    { key: 'last_name',        label: 'Last name',           type: 'string' },
    { key: 'email',            label: 'Email',               type: 'string' },
    { key: 'phone',            label: 'Phone',               type: 'string', required: true },
    { key: 'address_line_1',   label: 'Address line 1',      type: 'string', required: true },
    { key: 'address_line_2',   label: 'Address line 2',      type: 'string' },
    { key: 'city',             label: 'City',                type: 'string' },
    { key: 'state',            label: 'State / province',    type: 'string' },
    { key: 'zip',              label: 'ZIP / postal',        type: 'string' },
    { key: 'helio_id',         label: 'Helio customer ID',   type: 'id', readonly: true },
    { key: 'service_area',     label: 'Service area',        type: 'ref' },
    { key: 'care_plan_status', label: 'Care plan status',    type: 'enum' },
    { key: 'lead_type',        label: 'Lead type',           type: 'enum' },
    { key: 'lead_source',      label: 'Lead source',         type: 'enum' },
    { key: 'existing_heating', label: 'Existing heating',    type: 'enum' },
    { key: 'existing_cooling', label: 'Existing cooling',    type: 'enum' },
    { key: 'existing_water_heat',label:'Existing water heat',type: 'enum' },
    { key: 'home_type',        label: 'Home type',           type: 'enum' },
    { key: 'foundation_type',  label: 'Foundation type',     type: 'enum' },
    { key: 'solar_on_property',label:'Solar on property',    type: 'bool' },
    { key: 'ev_owner',         label: 'EV owner',            type: 'bool' },
  ],
  deal: [
    { key: 'name',                    label: 'Project name',         type: 'string', required: true },
    { key: 'value',                   label: 'Deal amount ($)',      type: 'currency' },
    { key: 'status',                  label: 'Status',               type: 'enum' },
    { key: 'hubspot_deal_id',         label: 'HubSpot deal ID',      type: 'id', readonly: true },
    { key: 'sold_date',               label: 'Sold date',            type: 'date' },
    { key: 'target_install_start',    label: 'Target install start', type: 'date' },
    { key: 'target_install_end',      label: 'Target install end',   type: 'date' },
    { key: 'walkthrough_date',        label: 'Walkthrough date',     type: 'date' },
    { key: 'home_assessment_date',    label: 'Home assessment date', type: 'date' },
    { key: 'permit_status',           label: 'Permit status',        type: 'enum' },
    { key: 'inspection_status',       label: 'Inspection status',    type: 'enum' },
    { key: 'customer_urgency',        label: 'Customer urgency',     type: 'enum' },
    { key: 'scheduling_instructions', label: 'Scheduling notes',     type: 'text' },
    { key: 'project_type',            label: 'Project type',         type: 'enum' },
    { key: 'trade',                   label: 'Trade',                type: 'enum' },
    { key: 'design_notes',            label: 'Design notes',         type: 'text' },
    { key: 'installation_notes',      label: 'Installation notes',   type: 'text' },
    { key: 'heating_load_btus',       label: 'Heating load (BTUs)',  type: 'number' },
    { key: 'main_panel_rating',       label: 'Main panel rating',    type: 'enum' },
    { key: 'site_technician',         label: 'Site technician',      type: 'ref' },
    { key: 'point_guard',             label: 'Point guard',          type: 'ref' },
  ],
  job: [
    { key: 'job_id',           label: 'Job ID',                  type: 'id', required: true, readonly: true },
    { key: 'job_url',          label: 'Job URL',                 type: 'string' },
    { key: 'status',           label: 'Status (mapped)',         type: 'enum' },
    { key: 'scheduled_start',  label: 'Scheduled start',         type: 'datetime' },
    { key: 'scheduled_end',    label: 'Scheduled end',           type: 'datetime' },
    { key: 'enroute_at',       label: 'En-route timestamp',      type: 'datetime' },
    { key: 'onsite_at',        label: 'On-site timestamp',       type: 'datetime' },
    { key: 'complete_at',      label: 'Complete timestamp',      type: 'datetime' },
    { key: 'time_on_site_hrs', label: 'Time on site (hrs)',      type: 'number' },
    { key: 'slots_json',       label: 'Team members (JSON)',     type: 'json' },
    { key: 'job_type',         label: 'Job type',                type: 'enum' },
    { key: 'job_name',         label: 'Job name',                type: 'string' },
    { key: 'notes',            label: 'Notes',                   type: 'text' },
    { key: 'completion_notes', label: 'Completion notes',        type: 'text' },
    { key: 'form_responses',   label: 'Form responses (JSON)',   type: 'json' },
    { key: 'serial_indoor',    label: 'Serial — indoor',         type: 'string' },
    { key: 'serial_outdoor',   label: 'Serial — outdoor',        type: 'string' },
    { key: 'project_link',     label: 'Linked deal ID',          type: 'ref' },
  ],
  service_area: [
    { key: 'name',                       label: 'Name',                       type: 'string', required: true },
    { key: 'code',                       label: 'Code',                       type: 'string' },
    { key: 'time_zone',                  label: 'Time zone',                  type: 'enum' },
    { key: 'status',                     label: 'Status',                     type: 'enum' },
    { key: 'cities',                     label: 'Cities',                     type: 'text' },
    { key: 'states',                     label: 'States',                     type: 'text' },
    { key: 'countries',                  label: 'Countries',                  type: 'text' },
    { key: 'postal_codes',               label: 'Postal codes',               type: 'text' },
    { key: 'heating_design_temp_indoor', label: 'Heating indoor DB temp',     type: 'number' },
    { key: 'heating_design_temp_outdoor',label: 'Heating outdoor DB temp',    type: 'number' },
    { key: 'altitude_derating',          label: 'Altitude derating factor',   type: 'number' },
    { key: 'capacity_margin',            label: 'Capacity margin factor',     type: 'number' },
    { key: 'default_warehouse',          label: 'Default warehouse',          type: 'ref' },
    { key: 'fsm_provider',               label: 'FSM provider',               type: 'enum' },
  ],
};

/** Required FSM fields surfaced in the "unmapped required" warning. */
export const REQUIRED_FSM_FIELDS: Record<HubspotEntityMapping['entity'], string[]> = {
  contact: FSM_FIELDS.contact.filter((f) => f.required).map((f) => f.key),
  deal: FSM_FIELDS.deal.filter((f) => f.required).map((f) => f.key),
  job: FSM_FIELDS.job.filter((f) => f.required).map((f) => f.key),
  service_area: FSM_FIELDS.service_area.filter((f) => f.required).map((f) => f.key),
};

/** Status enum mapping: FSM status → HubSpot `jobs.fsm_status`. */
export const STATUS_ENUM_MAP: Record<string, { fsmStatus: string; setActual?: 'enroute' | 'onsite' | 'complete' }> = {
  unscheduled: { fsmStatus: 'queued' },
  scheduled:   { fsmStatus: 'dispatched' },
  enroute:     { fsmStatus: 'dispatched', setActual: 'enroute' },
  onsite:      { fsmStatus: 'confirmed',  setActual: 'onsite' },
  complete:    { fsmStatus: 'confirmed',  setActual: 'complete' },
  callback:    { fsmStatus: 'queued' },
};

export const ENTITY_LABELS: Record<HubspotEntityMapping['entity'], { app: string; hs: string; icon: string }> = {
  contact:      { app: 'Customer',     hs: 'Contact',      icon: 'user' },
  deal:         { app: 'Project',      hs: 'Deal',         icon: 'briefcase' },
  job:          { app: 'Job',          hs: 'Job (custom)', icon: 'tool' },
  service_area: { app: 'Service area', hs: 'Service area', icon: 'map_pin' },
};
