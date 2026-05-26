// =============================================================
// Drizzle schema — single source of truth for the Postgres
// database that Phase 12 will swap the Zustand store onto.
//
// Conventions:
//  - Tables with a string id (people, crews, customers, jobs, ...)
//    use `text` PKs that match `src/types.ts`.
//  - New infrastructure tables (outbox, audit_log, api_keys,
//    profiles, audit log) use uuid PKs.
//  - createdAt / updatedAt timestamps default to `now()` where
//    appropriate. `updatedAt` is hand-bumped by triggers + by
//    the API layer in Phase 11.
//  - Enums declared as `pgEnum` so Postgres enforces them and
//    Drizzle generates them in migrations.
// =============================================================

import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ---- Enums ------------------------------------------------------------------

export const roleKeyEnum = pgEnum('role_key', [
  'hvac_lead',
  'hvac_installer',
  'apprentice',
  'electrician',
  'plumber',
  'fsm',
]);

export const levelEnum = pgEnum('level', ['L1', 'L2', 'L3']);

export const profileRoleEnum = pgEnum('profile_role', [
  'dispatcher',
  'manager',
  'tech',
  'admin',
  'fsm',
]);

export const jobStatusEnum = pgEnum('job_status', [
  'unscheduled',
  'scheduled',
  'enroute',
  'onsite',
  'complete',
  'callback',
  // Terminal-failure state used by Zuper sync for CANCELED / FAILED /
  // CANNOT_COMPLETE jobs. Distinct from 'callback' (which means needs revisit).
  'cancelled',
]);

export const projectStatusEnum = pgEnum('project_status', [
  'proposed',
  'sold',
  'in_progress',
  'complete',
  'warranty',
  'cancelled',
]);

export const projectSourceEnum = pgEnum('project_source', [
  'native_project',
  'legacy_installation',
]);

export const truckStatusEnum = pgEnum('truck_status', [
  'available',
  'shop',
  'assigned',
]);

export const timeOffTypeEnum = pgEnum('time_off_type', [
  'sick',
  'vacation',
  'training',
  'pto',
]);

export const vehicleModeEnum = pgEnum('vehicle_mode', [
  'fleet',
  'personal',
  'none',
]);

export const checklistItemTypeEnum = pgEnum('checklist_item_type', [
  'checkbox',
  'photo',
  'single',
  'multi',
  'number',
  'text',
  'longtext',
  'signature',
  'rating',
]);

export const hubspotEntityEnum = pgEnum('hubspot_entity', [
  'contact',
  'deal',
  'project',
  'job',
  'service_area',
  'installation',
]);

export const hubspotDirectionEnum = pgEnum('hubspot_direction', [
  'push',
  'pull',
  'both',
]);

// =============================================================
// NextAuth standard tables (mirror @auth/drizzle-adapter pg schema).
// `users` extends the default with a `hashedPassword` column for
// the Credentials provider; the adapter ignores unknown columns.
// =============================================================

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date', withTimezone: true }),
  image: text('image'),
  hashedPassword: text('hashedPassword'),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = pgTable('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date', withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationTokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date', withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

// =============================================================
// Profile — extends a NextAuth user with app-level role + crew.
// =============================================================

export const profiles = pgTable('profiles', {
  userId: text('userId')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  role: profileRoleEnum('role').notNull().default('dispatcher'),
  displayName: text('displayName'),
  defaultCrewId: text('defaultCrewId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================
// Core entities (mirror src/types.ts)
// =============================================================

export const people = pgTable('people', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  level: levelEnum('level').notNull(),
  defaultCrewId: text('defaultCrewId'),
  certs: jsonb('certs').$type<string[]>(),
  /**
   * Primary Zuper team name the person was imported from (e.g. "CO-DE-1").
   * Populated by `bootstrapTechniciansFromZuper` for traceability when a tech
   * belongs to multiple Zuper teams; we pick the first regional/numeric team.
   * NULL for people that didn't come from a Zuper team-filtered bootstrap.
   */
  zuperPrimaryTeam: text('zuperPrimaryTeam'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

/** M:N join — a Person may have multiple roles (`Person.roles[]`). */
export const personRoles = pgTable(
  'person_roles',
  {
    personId: text('personId')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    role: roleKeyEnum('role').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.personId, t.role] }),
  }),
);

export const trucks = pgTable('trucks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  plate: text('plate').notNull(),
  kind: text('kind').notNull(),
  capacity: text('capacity').notNull(),
  assignedCrewId: text('assignedCrewId'),
  vin: text('vin').notNull(),
  status: truckStatusEnum('status'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const crews = pgTable('crews', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  leadPersonId: text('leadPersonId').references(() => people.id, {
    onDelete: 'set null',
  }),
  truckId: text('truckId').references(() => trucks.id, { onDelete: 'set null' }),
  color: text('color').notNull(),
  /** Zuper team UID — set when this crew was upserted from a Zuper sync. */
  zuperTeamId: text('zuperTeamId'),
  /** Human-readable Zuper team name (e.g. "CO-DE-1"). Stored for UI display. */
  zuperTeamName: text('zuperTeamName'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

/** M:N join — Crew.members[]. */
export const crewMembers = pgTable(
  'crew_members',
  {
    crewId: text('crewId')
      .notNull()
      .references(() => crews.id, { onDelete: 'cascade' }),
    personId: text('personId')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.crewId, t.personId] }),
  }),
);

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  phone: text('phone').notNull(),
  hubspotId: text('hubspotId'),
  /** Zuper customer UID — set when first observed in a Zuper sync. */
  zuperCustomerId: text('zuperCustomerId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  customerId: text('customerId')
    .notNull()
    .references(() => customers.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  /** HubSpot deal.project_type (Retrofit / New build / Remodel / Change order / Callback / Warranty). */
  type: text('type').notNull(),
  status: projectStatusEnum('status').notNull(),
  soldDate: text('soldDate'),
  targetCompletion: text('targetCompletion'),
  value: numeric('value', { precision: 14, scale: 2 }),
  hubspotDealId: text('hubspotDealId'),
  /** Native HubSpot Project (0-970) object id — primary integration target. */
  hubspotProjectId: text('hubspotProjectId'),
  primaryCrewId: text('primaryCrewId').references(() => crews.id, {
    onDelete: 'set null',
  }),
  description: text('description'),
  designNotes: text('designNotes'),
  source: projectSourceEnum('source').notNull().default('native_project'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Service areas. The prototype's `Region` has nested `subs[]`; we model that
 * via a self-referential `parentRegionId` (NULL for the top-level region).
 * Easier to query, no cycles required by SQL.
 */
export const regions = pgTable('regions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  short: text('short').notNull(),
  parentRegionId: text('parentRegionId'),
  headcount: integer('headcount').notNull().default(0),
  crewCount: integer('crewCount').notNull().default(0),
  /** Zuper service-area code (e.g. "CO-DE", "BC-NV") — for cross-system join. */
  zuperServiceAreaCode: text('zuperServiceAreaCode'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const timeOff = pgTable('time_off', {
  id: text('id').primaryKey(),
  personId: text('personId')
    .notNull()
    .references(() => people.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  type: timeOffTypeEnum('type').notNull(),
  label: text('label').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================
// Templates
// =============================================================

export const jobTemplates = pgTable('job_templates', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  truckCount: integer('truckCount').notNull().default(1),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const templateSlots = pgTable('template_slots', {
  id: text('id').primaryKey(),
  templateId: text('templateId')
    .notNull()
    .references(() => jobTemplates.id, { onDelete: 'cascade' }),
  role: roleKeyEnum('role').notNull(),
  level: levelEnum('level').notNull(),
  hours: numeric('hours', { precision: 6, scale: 2 }).notNull(),
  startOffsetHours: numeric('startOffsetHours', { precision: 6, scale: 2 })
    .notNull()
    .default('0'),
  optional: boolean('optional').notNull().default(false),
  sortOrder: integer('sortOrder').notNull().default(0),
});

// =============================================================
// Jobs + slots
// =============================================================

export const jobs = pgTable('jobs', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  status: jobStatusEnum('status').notNull().default('unscheduled'),
  customerId: text('customerId').references(() => customers.id, {
    onDelete: 'set null',
  }),
  projectId: text('projectId').references(() => projects.id, {
    onDelete: 'set null',
  }),
  /** 'YYYY-MM-DD' or NULL when unscheduled. */
  date: text('date'),
  /** Hour of day (0..24, decimal). NULL when unscheduled. */
  startHour: numeric('startHour', { precision: 6, scale: 2 }),
  durationHrs: numeric('durationHrs', { precision: 6, scale: 2 })
    .notNull()
    .default('0'),
  crewId: text('crewId').references(() => crews.id, { onDelete: 'set null' }),
  truckId: text('truckId').references(() => trucks.id, { onDelete: 'set null' }),
  notes: text('notes').notNull().default(''),
  address: text('address').notNull().default(''),
  hubspotDealId: text('hubspotDealId'),
  /** Id of the HubSpot Job custom-object row this job pushes to. */
  hubspotJobObjectId: text('hubspotJobObjectId'),
  driveTimeMin: integer('driveTimeMin').notNull().default(0),
  price: numeric('price', { precision: 14, scale: 2 }),
  multidayGroupId: text('multidayGroupId'),
  multidayIndex: integer('multidayIndex'),
  multidayTotal: integer('multidayTotal'),
  continuationOf: text('continuationOf'),
  vehicleMode: vehicleModeEnum('vehicleMode'),
  personalDriverId: text('personalDriverId').references(() => people.id, {
    onDelete: 'set null',
  }),
  endDate: text('endDate'),
  endHour: numeric('endHour', { precision: 6, scale: 2 }),
  daysSpanned: integer('daysSpanned'),
  /**
   * Human-readable job title. Native dispatcher jobs use customer+job-type
   * as a derived label; Zuper-sourced jobs carry the upstream `job_title`
   * verbatim (e.g. "Chris Longfield-Smith - Unit is loud and noisy").
   */
  title: text('title'),
  /** Zuper job UID — dedup key for jobs pulled from Zuper. */
  zuperJobUid: text('zuperJobUid'),
  /** Zuper deep-link to this job. */
  zuperJobUrl: text('zuperJobUrl'),
  /**
   * Zuper team name as it appeared on the source job (e.g. "CO-DE-1").
   * Reference only — does NOT create a crew row in our dispatcher. Surfaced
   * in the job drawer for traceability.
   */
  zuperTeamName: text('zuperTeamName'),
  /** Last time this row was reconciled with a Zuper pull. */
  zuperSyncedAt: timestamp('zuperSyncedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const jobSlots = pgTable('job_slots', {
  id: text('id').primaryKey(),
  jobId: text('jobId')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  role: roleKeyEnum('role').notNull(),
  level: levelEnum('level').notNull(),
  hours: numeric('hours', { precision: 6, scale: 2 }).notNull(),
  startOffsetHours: numeric('startOffsetHours', { precision: 6, scale: 2 })
    .notNull()
    .default('0'),
  optional: boolean('optional').notNull().default(false),
  assignedTo: text('assignedTo').references(() => people.id, {
    onDelete: 'set null',
  }),
  suggested: boolean('suggested').notNull().default(false),
  sortOrder: integer('sortOrder').notNull().default(0),
});

/** M:N — Job.extraCrewIds[]. */
export const jobExtraCrews = pgTable(
  'job_extra_crews',
  {
    jobId: text('jobId')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    crewId: text('crewId')
      .notNull()
      .references(() => crews.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.jobId, t.crewId] }),
  }),
);

// =============================================================
// Checklists / completion forms
// =============================================================

export const checklists = pgTable('checklists', {
  /** Matches a JobTypeKey ('heatpump', 'service', ...). */
  id: text('id').primaryKey(),
  jobType: text('jobType').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const checklistSections = pgTable('checklist_sections', {
  id: text('id').primaryKey(),
  checklistId: text('checklistId')
    .notNull()
    .references(() => checklists.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sortOrder: integer('sortOrder').notNull().default(0),
});

export const checklistItems = pgTable('checklist_items', {
  /** Matches the existing string ids like `hp-p1`. */
  id: text('id').primaryKey(),
  sectionId: text('sectionId')
    .notNull()
    .references(() => checklistSections.id, { onDelete: 'cascade' }),
  type: checklistItemTypeEnum('type').notNull(),
  label: text('label').notNull(),
  required: boolean('required').notNull().default(false),
  optionsJson: jsonb('optionsJson').$type<string[]>(),
  minPhotos: integer('minPhotos'),
  minNumber: numeric('minNumber', { precision: 14, scale: 4 }),
  maxNumber: numeric('maxNumber', { precision: 14, scale: 4 }),
  unit: text('unit'),
  placeholder: text('placeholder'),
  sortOrder: integer('sortOrder').notNull().default(0),
});

export const checklistResponses = pgTable('checklist_responses', {
  id: text('id').primaryKey(),
  jobId: text('jobId')
    .notNull()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  /** ChecklistItem.id (not FK — item ids may be revisioned per checklist). */
  itemId: text('itemId').notNull(),
  valueJson: jsonb('valueJson'),
  answeredAt: timestamp('answeredAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// =============================================================
// HubSpot mapping + settings
// =============================================================

export const hubspotMappings = pgTable('hubspot_mappings', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  entity: hubspotEntityEnum('entity').notNull(),
  appField: text('appField').notNull(),
  hsField: text('hsField').notNull(),
  direction: hubspotDirectionEnum('direction').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const settingsKv = pgTable('settings_kv', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================
// Audit log + outbox + api keys (infrastructure tables)
// =============================================================

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: text('actorUserId').references(() => users.id, {
    onDelete: 'set null',
  }),
  action: text('action').notNull(),
  entityType: text('entityType').notNull(),
  entityId: text('entityId').notNull(),
  before: jsonb('before'),
  after: jsonb('after'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Transactional outbox — every mutation we want to fan out becomes a row
 * here (via Postgres triggers + API-layer publishes). Phase 13 drains this
 * to HubSpot push + Supabase Realtime fan-out; future SNS bridge consumes
 * the same table.
 */
export const outbox = pgTable('outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  topic: text('topic').notNull(),
  payloadJson: jsonb('payloadJson').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp('deliveredAt', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  hashedKey: text('hashedKey').notNull().unique(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdByUserId: text('createdByUserId').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('lastUsedAt', { withTimezone: true }),
  revokedAt: timestamp('revokedAt', { withTimezone: true }),
});

// =============================================================
// Exported inferred row types (for the API layer + tests).
// =============================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type DbPerson = typeof people.$inferSelect;
export type DbCrew = typeof crews.$inferSelect;
export type DbTruck = typeof trucks.$inferSelect;
export type DbCustomer = typeof customers.$inferSelect;
export type DbProject = typeof projects.$inferSelect;
export type DbRegion = typeof regions.$inferSelect;
export type DbTimeOff = typeof timeOff.$inferSelect;
export type DbJob = typeof jobs.$inferSelect;
export type DbJobSlot = typeof jobSlots.$inferSelect;
export type DbChecklist = typeof checklists.$inferSelect;
export type DbChecklistItem = typeof checklistItems.$inferSelect;
export type DbChecklistResponse = typeof checklistResponses.$inferSelect;
export type DbOutboxEvent = typeof outbox.$inferSelect;
export type DbApiKey = typeof apiKeys.$inferSelect;
