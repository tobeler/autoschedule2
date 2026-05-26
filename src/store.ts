// =============================================================
// Zustand store — central state.
//
// Phase 12: every mutation now does an optimistic local update
// and, when wired to the API (`apiMode === true`), writes through
// to the Hono REST layer in parallel. On API failure we roll back
// the optimistic update and surface a toast.
//
// Demo mode (`apiMode === false`) preserves the prototype's
// localStorage + seed behavior so the dispatcher keeps working
// against a laptop with no DATABASE_URL. `useStoreHydration()`
// in `src/hooks/useStoreHydration.ts` decides which mode we land
// in by attempting the first API list and falling back on any
// 401 / network error.
// =============================================================
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import type {
  Job,
  Person,
  Crew,
  Truck,
  Customer,
  Project,
  Region,
  TimeOff,
  JobTemplate,
  ChecklistSection,
  ChecklistResponses,
  Tweaks,
  HubspotEntityMapping,
  JobStatus,
} from './types';
import {
  PEOPLE,
  CREWS,
  TRUCKS,
  CUSTOMERS,
  PROJECTS,
  JOBS_SEED,
  REGIONS,
  TIME_OFF,
  JOB_TEMPLATES,
  CHECKLISTS,
  CHECKLIST_RESPONSES,
} from './data/seed';
import { client } from './api/client';
import {
  jobToDTOPatch,
  jobToDTOCreate,
  personToDTOPatch,
  personToDTOCreate,
  crewToDTOPatch,
  crewToDTOCreate,
  templateToDTOPatch,
  truckToDTOPatch,
  truckToDTOCreate,
  projectToDTOPatch,
  projectToDTOCreate,
  timeOffToDTOPatch,
  timeOffToDTOCreate,
  regionToDTOPatch,
  regionToDTOCreate,
} from './api/storeMappers';
import { autoFillSlots } from './lib/assignment';

export type TabId =
  | 'dispatch'
  | 'attention'
  | 'jobs'
  | 'projects'
  | 'technicians'
  | 'crews'
  | 'fleet'
  | 'timesheets'
  | 'reports'
  | 'settings';

export interface RegionSelection {
  regionId: string;
  subId: string;
}

interface State {
  // ---- collections (persisted) ----
  jobs: Job[];
  people: Person[];
  crews: Crew[];
  trucks: Truck[];
  customers: Customer[];
  projects: Project[];
  regions: Region[];
  timeOff: TimeOff[];
  templates: Record<string, JobTemplate>;
  checklists: Record<string, ChecklistSection[]>;
  checklistResponses: Record<string, ChecklistResponses>;
  hubspotMapping: HubspotEntityMapping[];

  // ---- preferences (persisted) ----
  region: RegionSelection;
  tweaks: Tweaks;

  // ---- ephemeral UI (not persisted) ----
  tab: TabId;
  selectedJobId: string | null;
  selectedJobInitialTab: string | null;
  sidebarCollapsed: boolean;
  toast: string | null;
  showWizard: boolean;
  smartScheduleJobId: string | null;

  // ---- runtime mode (not persisted) ----
  /** True when hydrated from the API and writes go through the REST layer. */
  apiMode: boolean;
  /** True once first hydration attempt completes (API success or demo fallback). */
  hydrated: boolean;
  /** Set when hydration fails fatally; UI shows a retry screen. */
  hydrationError: string | null;
  /** Role of the actor backing the current session (`admin`, `manager`, `dispatcher`, `tech`, `fsm`). */
  currentUserRole: string | null;
  /** Human-readable label for the actor (display name or fallback). */
  currentUserName: string | null;

  // ---- actions ----
  setTab: (t: TabId) => void;
  selectJob: (id: string | null, opts?: { initialTab?: string }) => void;
  collapseSidebar: (v: boolean) => void;
  pushToast: (msg: string) => void;
  clearToast: () => void;
  openWizard: () => void;
  closeWizard: () => void;
  openSmartSchedule: (jobId: string) => void;
  closeSmartSchedule: () => void;
  setRegion: (r: RegionSelection) => void;
  setTweak: <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => void;

  // ---- hydration helpers (internal, used by hooks) ----
  setApiMode: (v: boolean) => void;
  setHydrated: (v: boolean, error?: string | null) => void;
  setCurrentUser: (role: string | null, name: string | null) => void;
  hydrateCollections: (s: Partial<Omit<State, 'tab' | 'selectedJobId' | 'apiMode' | 'hydrated' | 'hydrationError'>>) => void;
  applyJob: (job: Job) => void;
  applyJobRemove: (id: string) => void;
  applyCrew: (crew: Crew) => void;
  applyCrewRemove: (id: string) => void;
  applyPerson: (p: Person) => void;
  applyPersonRemove: (id: string) => void;

  // ---- mutations ----
  updateJob: (job: Job) => void;
  addJob: (job: Job) => void;
  removeJob: (id: string) => void;
  addPerson: (p: Person) => void;
  updatePerson: (p: Person) => void;
  removePerson: (id: string) => void;
  addCrew: (c: Crew) => void;
  updateCrew: (c: Crew) => void;
  removeCrew: (id: string) => void;
  // Phase 16 — full CRUD coverage
  addTruck: (t: Truck) => void;
  updateTruck: (t: Truck) => void;
  removeTruck: (id: string) => void;
  addProject: (p: Project) => void;
  updateProject: (p: Project) => void;
  removeProject: (id: string) => void;
  addTimeOff: (t: TimeOff) => void;
  updateTimeOff: (t: TimeOff) => void;
  removeTimeOff: (id: string) => void;
  addRegion: (r: Region) => void;
  updateRegion: (r: Region) => void;
  removeRegion: (id: string) => void;
  addTemplate: (key: string, tpl: JobTemplate) => void;
  removeTemplate: (key: string) => void;
  resizeJob: (id: string, hours: number) => void;
  setJobStatus: (id: string, status: JobStatus) => void;
  moveJob: (
    id: string,
    updates: { date?: string | null; startHour?: number | null; crewId?: string | null; truckId?: string | null },
  ) => void;
  updateTemplate: (key: string, tpl: JobTemplate) => void;
  setHubspotMapping: (m: HubspotEntityMapping[]) => void;
  setChecklist: (jobType: string, sections: ChecklistSection[]) => void;
  setChecklistResponse: (jobId: string, responses: ChecklistResponses) => void;
  // Bulk-import setters used by integrations/hubspot/sync.ts
  setCustomers: (customers: Customer[]) => void;
  setProjects: (projects: Project[]) => void;
  setRegions: (regions: Region[]) => void;

  /** Whether the prototype seed data is loaded. Turning off clears every
   *  collection so the demo starts empty (HubSpot sync fills it back). */
  demoDataEnabled: boolean;
  setDemoDataEnabled: (v: boolean) => void;

  resetAll: () => void;
}

const DEFAULT_TWEAKS: Tweaks = {
  density: 'cozy',
  accent: 'green',
  showDriveTime: true,
  dark: false,
};

const DEFAULT_REGION: RegionSelection = { regionId: 'co', subId: 'co-d' };

let toastTimer: ReturnType<typeof setTimeout> | null = null;

// ---- helpers --------------------------------------------------------------

function logApiError(action: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`store.${action} write-through failed`, err);
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      jobs: JOBS_SEED,
      people: PEOPLE,
      crews: CREWS,
      trucks: TRUCKS,
      customers: CUSTOMERS,
      projects: PROJECTS,
      regions: REGIONS,
      timeOff: TIME_OFF,
      templates: JOB_TEMPLATES,
      checklists: CHECKLISTS,
      checklistResponses: CHECKLIST_RESPONSES,
      hubspotMapping: [],

      region: DEFAULT_REGION,
      tweaks: DEFAULT_TWEAKS,

      tab: 'dispatch',
      selectedJobId: null,
      selectedJobInitialTab: null,
      sidebarCollapsed: false,
      toast: null,
      showWizard: false,
      smartScheduleJobId: null,

      apiMode: false,
      hydrated: false,
      hydrationError: null,
      currentUserRole: null,
      currentUserName: null,

      // ---- UI actions ----
      setTab: (t) => set({ tab: t }),
      selectJob: (id, opts) =>
        set({
          selectedJobId: id,
          selectedJobInitialTab: opts?.initialTab ?? null,
        }),
      collapseSidebar: (v) => set({ sidebarCollapsed: v }),
      pushToast: (msg) => {
        set({ toast: msg });
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => set({ toast: null }), 2400);
      },
      clearToast: () => set({ toast: null }),
      openWizard: () => set({ showWizard: true }),
      closeWizard: () => set({ showWizard: false }),
      openSmartSchedule: (jobId) => set({ smartScheduleJobId: jobId }),
      closeSmartSchedule: () => set({ smartScheduleJobId: null }),
      setRegion: (r) => set({ region: r }),
      setTweak: (k, v) => set((s) => ({ tweaks: { ...s.tweaks, [k]: v } })),

      // ---- hydration helpers ----
      setApiMode: (v) => set({ apiMode: v }),
      setHydrated: (v, error = null) => set({ hydrated: v, hydrationError: error }),
      setCurrentUser: (role, name) => set({ currentUserRole: role, currentUserName: name }),
      hydrateCollections: (s) => set(s),
      applyJob: (job) =>
        set((s) => {
          const idx = s.jobs.findIndex((j) => j.id === job.id);
          if (idx === -1) return { jobs: [...s.jobs, job] };
          const next = s.jobs.slice();
          next[idx] = job;
          return { jobs: next };
        }),
      applyJobRemove: (id) =>
        set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
      applyCrew: (crew) =>
        set((s) => {
          const idx = s.crews.findIndex((c) => c.id === crew.id);
          if (idx === -1) return { crews: [...s.crews, crew] };
          const next = s.crews.slice();
          next[idx] = crew;
          return { crews: next };
        }),
      applyCrewRemove: (id) =>
        set((s) => ({ crews: s.crews.filter((c) => c.id !== id) })),
      applyPerson: (p) =>
        set((s) => {
          const idx = s.people.findIndex((x) => x.id === p.id);
          if (idx === -1) return { people: [...s.people, p] };
          const next = s.people.slice();
          next[idx] = p;
          return { people: next };
        }),
      applyPersonRemove: (id) =>
        set((s) => ({
          people: s.people.filter((x) => x.id !== id),
          crews: s.crews.map((c) => ({
            ...c,
            members: c.members.filter((m) => m !== id),
            lead: c.lead === id ? '' : c.lead,
          })),
        })),

      // ---- mutations (optimistic + write-through) ----

      updateJob: (job) => {
        const prev = get().jobs;
        set({
          jobs: prev.map((j) => (j.id === job.id ? job : j)),
        });
        if (get().apiMode) {
          client.jobs
            .update(job.id, jobToDTOPatch(job))
            .catch((err) => {
              set({ jobs: prev });
              get().pushToast('Update failed — restored');
              logApiError('updateJob', err);
            });
        }
      },

      addJob: (job) => {
        const prev = get().jobs;
        set({ jobs: [...prev, job] });
        if (get().apiMode) {
          client.jobs.create(jobToDTOCreate(job)).catch((err) => {
            set({ jobs: prev });
            get().pushToast('Could not save new job — undone');
            logApiError('addJob', err);
          });
        }
      },

      removeJob: (id) => {
        const prev = get().jobs;
        set({ jobs: prev.filter((j) => j.id !== id) });
        if (get().apiMode) {
          client.jobs.remove(id).catch((err) => {
            set({ jobs: prev });
            get().pushToast('Could not remove job — restored');
            logApiError('removeJob', err);
          });
        }
      },

      addPerson: (p) => {
        const prev = get().people;
        set({ people: [...prev, p] });
        if (get().apiMode) {
          client.people.create(personToDTOCreate(p)).catch((err) => {
            set({ people: prev });
            get().pushToast('Could not add technician — undone');
            logApiError('addPerson', err);
          });
        }
      },

      updatePerson: (p) => {
        const prev = get().people;
        set({ people: prev.map((x) => (x.id === p.id ? p : x)) });
        if (get().apiMode) {
          client.people.update(p.id, personToDTOPatch(p)).catch((err) => {
            set({ people: prev });
            get().pushToast('Update failed — restored');
            logApiError('updatePerson', err);
          });
        }
      },

      removePerson: (id) => {
        const prevPeople = get().people;
        const prevCrews = get().crews;
        set({
          people: prevPeople.filter((x) => x.id !== id),
          crews: prevCrews.map((c) => ({
            ...c,
            members: c.members.filter((m) => m !== id),
            lead: c.lead === id ? '' : c.lead,
          })),
        });
        if (get().apiMode) {
          client.people.remove(id).catch((err) => {
            set({ people: prevPeople, crews: prevCrews });
            get().pushToast('Could not remove technician — restored');
            logApiError('removePerson', err);
          });
        }
      },

      addCrew: (c) => {
        const prev = get().crews;
        set({ crews: [...prev, c] });
        if (get().apiMode) {
          client.crews.create(crewToDTOCreate(c)).catch((err) => {
            set({ crews: prev });
            get().pushToast('Could not add crew — undone');
            logApiError('addCrew', err);
          });
        }
      },

      updateCrew: (c) => {
        const prev = get().crews;
        set({ crews: prev.map((x) => (x.id === c.id ? c : x)) });
        if (get().apiMode) {
          client.crews.update(c.id, crewToDTOPatch(c)).catch((err) => {
            set({ crews: prev });
            get().pushToast('Update failed — restored');
            logApiError('updateCrew', err);
          });
        }
      },

      removeCrew: (id) => {
        const prev = get().crews;
        const prevPeople = get().people;
        // Members of the deleted crew lose their defaultCrew (not cascade-deleted)
        const nextPeople = prevPeople.map((p) =>
          p.defaultCrew === id ? { ...p, defaultCrew: '' } : p,
        );
        set({ crews: prev.filter((x) => x.id !== id), people: nextPeople });
        if (get().apiMode) {
          client.crews.remove(id).catch((err) => {
            set({ crews: prev, people: prevPeople });
            get().pushToast('Could not remove crew — restored');
            logApiError('removeCrew', err);
          });
        }
      },

      // ---- Trucks ----
      addTruck: (t) => {
        const prev = get().trucks;
        set({ trucks: [...prev, t] });
        if (get().apiMode) {
          client.trucks.create(truckToDTOCreate(t)).catch((err) => {
            set({ trucks: prev });
            get().pushToast('Could not add truck — undone');
            logApiError('addTruck', err);
          });
        }
      },
      updateTruck: (t) => {
        const prev = get().trucks;
        set({ trucks: prev.map((x) => (x.id === t.id ? t : x)) });
        if (get().apiMode) {
          client.trucks.update(t.id, truckToDTOPatch(t)).catch((err) => {
            set({ trucks: prev });
            get().pushToast('Update failed — restored');
            logApiError('updateTruck', err);
          });
        }
      },
      removeTruck: (id) => {
        const prev = get().trucks;
        const prevCrews = get().crews;
        // Crews referencing this truck have their truck cleared.
        const nextCrews = prevCrews.map((c) =>
          c.truck === id ? { ...c, truck: null } : c,
        );
        set({ trucks: prev.filter((t) => t.id !== id), crews: nextCrews });
        if (get().apiMode) {
          client.trucks.remove(id).catch((err) => {
            set({ trucks: prev, crews: prevCrews });
            get().pushToast('Could not remove truck — restored');
            logApiError('removeTruck', err);
          });
        }
      },

      // ---- Projects ----
      addProject: (p) => {
        const prev = get().projects;
        set({ projects: [...prev, p] });
        if (get().apiMode) {
          client.projects.create(projectToDTOCreate(p)).catch((err) => {
            set({ projects: prev });
            get().pushToast('Could not add project — undone');
            logApiError('addProject', err);
          });
        }
      },
      updateProject: (p) => {
        const prev = get().projects;
        set({ projects: prev.map((x) => (x.id === p.id ? p : x)) });
        if (get().apiMode) {
          client.projects.update(p.id, projectToDTOPatch(p)).catch((err) => {
            set({ projects: prev });
            get().pushToast('Update failed — restored');
            logApiError('updateProject', err);
          });
        }
      },
      removeProject: (id) => {
        const prev = get().projects;
        const prevJobs = get().jobs;
        // Jobs lose their projectId (kept, not cascade-deleted).
        const nextJobs = prevJobs.map((j) =>
          j.projectId === id ? { ...j, projectId: null } : j,
        );
        set({ projects: prev.filter((p) => p.id !== id), jobs: nextJobs });
        if (get().apiMode) {
          client.projects.remove(id).catch((err) => {
            set({ projects: prev, jobs: prevJobs });
            get().pushToast('Could not remove project — restored');
            logApiError('removeProject', err);
          });
        }
      },

      // ---- Time off ----
      addTimeOff: (t) => {
        const prev = get().timeOff;
        set({ timeOff: [...prev, t] });
        if (get().apiMode) {
          client.timeOff.create(timeOffToDTOCreate(t)).catch((err) => {
            set({ timeOff: prev });
            get().pushToast('Could not add time off — undone');
            logApiError('addTimeOff', err);
          });
        }
      },
      updateTimeOff: (t) => {
        const prev = get().timeOff;
        set({ timeOff: prev.map((x) => (x.id === t.id ? t : x)) });
        if (get().apiMode) {
          client.timeOff.update(t.id, timeOffToDTOPatch(t)).catch((err) => {
            set({ timeOff: prev });
            get().pushToast('Update failed — restored');
            logApiError('updateTimeOff', err);
          });
        }
      },
      removeTimeOff: (id) => {
        const prev = get().timeOff;
        set({ timeOff: prev.filter((t) => t.id !== id) });
        if (get().apiMode) {
          client.timeOff.remove(id).catch((err) => {
            set({ timeOff: prev });
            get().pushToast('Could not remove time off — restored');
            logApiError('removeTimeOff', err);
          });
        }
      },

      // ---- Regions ----
      addRegion: (r) => {
        const prev = get().regions;
        set({ regions: [...prev, r] });
        if (get().apiMode) {
          client.regions.create(regionToDTOCreate(r)).catch((err) => {
            set({ regions: prev });
            get().pushToast('Could not add region — undone');
            logApiError('addRegion', err);
          });
        }
      },
      updateRegion: (r) => {
        const prev = get().regions;
        set({ regions: prev.map((x) => (x.id === r.id ? r : x)) });
        if (get().apiMode) {
          client.regions.update(r.id, regionToDTOPatch(r)).catch((err) => {
            set({ regions: prev });
            get().pushToast('Update failed — restored');
            logApiError('updateRegion', err);
          });
        }
      },
      removeRegion: (id) => {
        const prev = get().regions;
        set({ regions: prev.filter((r) => r.id !== id) });
        if (get().apiMode) {
          client.regions.remove(id).catch((err) => {
            set({ regions: prev });
            get().pushToast('Could not remove region — restored');
            logApiError('removeRegion', err);
          });
        }
      },

      // ---- Templates ----
      addTemplate: (key, tpl) => {
        const prev = get().templates;
        set({ templates: { ...prev, [key]: tpl } });
        if (get().apiMode) {
          client.templates
            .create({ id: key, ...templateToDTOPatch(tpl) })
            .catch((err) => {
              set({ templates: prev });
              get().pushToast('Could not add template — undone');
              logApiError('addTemplate', err);
            });
        }
      },
      removeTemplate: (key) => {
        const prev = get().templates;
        const next = { ...prev };
        delete next[key];
        set({ templates: next });
        if (get().apiMode) {
          client.templates.remove(key).catch((err) => {
            set({ templates: prev });
            get().pushToast('Could not remove template — restored');
            logApiError('removeTemplate', err);
          });
        }
      },

      resizeJob: (id, hours) => {
        const prev = get().jobs;
        const target = prev.find((j) => j.id === id);
        if (!target) return;
        const next: Job = { ...target, durationHrs: hours };
        set({ jobs: prev.map((j) => (j.id === id ? next : j)) });
        if (get().apiMode) {
          client.jobs
            .update(id, { durationHrs: hours })
            .catch((err) => {
              set({ jobs: prev });
              get().pushToast('Resize failed — restored');
              logApiError('resizeJob', err);
            });
        }
      },

      setJobStatus: (id, status) => {
        const prev = get().jobs;
        const target = prev.find((j) => j.id === id);
        if (!target) return;
        set({
          jobs: prev.map((j) => (j.id === id ? { ...j, status } : j)),
        });
        if (get().apiMode) {
          client.jobs
            .transition(id, { status })
            .catch((err) => {
              set({ jobs: prev });
              get().pushToast('Status change failed — restored');
              logApiError('setJobStatus', err);
            });
        }
      },

      moveJob: (id, updates) => {
        const prev = get().jobs;
        const target = prev.find((j) => j.id === id);
        if (!target) return;
        // Moving back to unscheduled: null out scheduling fields and flip status.
        const movingToUnscheduled = updates.date === null;
        const liftingToScheduled =
          target.status === 'unscheduled' &&
          updates.date != null &&
          updates.startHour != null;
        let next: Job = movingToUnscheduled
          ? {
              ...target,
              ...updates,
              date: null,
              startHour: null,
              crewId: null,
              truckId: null,
              status: 'unscheduled',
            }
          : {
              ...target,
              ...updates,
              status: liftingToScheduled ? 'scheduled' : target.status,
            };
        // When lifting an unscheduled job onto a crew, auto-fill empty slots so
        // dispatch doesn't have to open the drawer to fill them by hand.
        if (liftingToScheduled && updates.crewId) {
          const crews = get().crews;
          const people = get().people;
          const crew = crews.find((c) => c.id === updates.crewId);
          const filled = autoFillSlots(next, crew ?? null, people);
          next = { ...next, slots: filled };
        }
        set({ jobs: prev.map((j) => (j.id === id ? next : j)) });
        if (get().apiMode) {
          client.jobs
            .update(id, {
              date: next.date,
              startHour: next.startHour,
              crewId: next.crewId,
              truckId: next.truckId,
              status: next.status,
              slots: next.slots,
            })
            .catch((err) => {
              set({ jobs: prev });
              get().pushToast('Move failed — restored');
              logApiError('moveJob', err);
            });
        }
      },

      updateTemplate: (key, tpl) => {
        const prev = get().templates;
        set({ templates: { ...prev, [key]: tpl } });
        if (get().apiMode) {
          client.templates
            .update(key, templateToDTOPatch(tpl))
            .catch((err) => {
              set({ templates: prev });
              get().pushToast('Template save failed — restored');
              logApiError('updateTemplate', err);
            });
        }
      },

      setHubspotMapping: (m) => {
        // Kept local-only — Phase 13 will route through
        // client.hubspot.putMapping(entity, body) per-entity.
        set({ hubspotMapping: m });
      },

      setChecklist: (jobType, sections) =>
        // Definitions are read-mostly today; admin tooling lands in Phase 14.
        set((s) => ({ checklists: { ...s.checklists, [jobType]: sections } })),

      setChecklistResponse: (jobId, responses) => {
        const prevAll = get().checklistResponses;
        const prevForJob = prevAll[jobId] ?? {};
        set({ checklistResponses: { ...prevAll, [jobId]: responses } });
        if (!get().apiMode) return;
        // Diff vs previous and PUT each changed item individually
        // (the API exposes per-item upsert).
        const itemIds = new Set<string>([
          ...Object.keys(prevForJob),
          ...Object.keys(responses),
        ]);
        for (const itemId of itemIds) {
          const before = prevForJob[itemId] ?? null;
          const after = responses[itemId] ?? null;
          if (JSON.stringify(before) === JSON.stringify(after)) continue;
          client.checklists
            .upsertResponse(jobId, { itemId, value: after })
            .catch((err) => logApiError('setChecklistResponse', err));
        }
      },

      setCustomers: (customers) => set({ customers }),
      setProjects: (projects) => set({ projects }),
      setRegions: (regions) => set({ regions }),

      demoDataEnabled: true,
      setDemoDataEnabled: (v) => {
        if (v) {
          // Entering demo mode: overlay the local store with seed data.
          // The DB rows in Postgres (if any) are untouched — they reappear
          // when demo mode is toggled off and the page re-hydrates.
          set({
            demoDataEnabled: true,
            jobs: JOBS_SEED,
            people: PEOPLE,
            crews: CREWS,
            trucks: TRUCKS,
            customers: CUSTOMERS,
            projects: PROJECTS,
            regions: REGIONS,
            timeOff: TIME_OFF,
            templates: JOB_TEMPLATES,
            checklists: CHECKLISTS,
            checklistResponses: CHECKLIST_RESPONSES,
            selectedJobId: null,
            showWizard: false,
            smartScheduleJobId: null,
          });
          get().pushToast('Demo data loaded · refresh to return to real data');
        } else {
          // Leaving demo mode: just flip the flag. Collections stay as-is
          // until the next page reload triggers useStoreHydration to refill
          // from /api/v1/*. We deliberately do NOT wipe collections — this
          // used to be a destructive operation that nuked synced HubSpot/
          // Zuper data, which is the opposite of what users want.
          set({
            demoDataEnabled: false,
            selectedJobId: null,
            showWizard: false,
            smartScheduleJobId: null,
          });
          get().pushToast('Demo mode off · refresh to load real data');
        }
      },

      resetAll: () =>
        set({
          jobs: JOBS_SEED,
          people: PEOPLE,
          crews: CREWS,
          trucks: TRUCKS,
          customers: CUSTOMERS,
          projects: PROJECTS,
          regions: REGIONS,
          timeOff: TIME_OFF,
          templates: JOB_TEMPLATES,
          checklists: CHECKLISTS,
          checklistResponses: CHECKLIST_RESPONSES,
          hubspotMapping: [],
          region: DEFAULT_REGION,
          tweaks: DEFAULT_TWEAKS,
          tab: 'dispatch',
          selectedJobId: null,
          showWizard: false,
          smartScheduleJobId: null,
          toast: null,
        }),
    }),
    {
      name: 'jetson-fsm-v1',
      storage: createJSONStorage(() => localStorage),
      // Persist only what's safe to round-trip via localStorage. In API
      // mode the hydration hook will overwrite these on mount with fresh
      // server data; in demo mode the persisted snapshot is the source
      // of truth.
      partialize: (s) => ({
        jobs: s.jobs,
        people: s.people,
        crews: s.crews,
        trucks: s.trucks,
        customers: s.customers,
        projects: s.projects,
        regions: s.regions,
        timeOff: s.timeOff,
        templates: s.templates,
        checklists: s.checklists,
        checklistResponses: s.checklistResponses,
        hubspotMapping: s.hubspotMapping,
        region: s.region,
        tweaks: s.tweaks,
        demoDataEnabled: s.demoDataEnabled,
      }),
      version: 1,
    },
  ),
);

// Convenient selector hooks for common reads
export const useTab = () => useStore((s) => s.tab);
export const useJobs = () => useStore((s) => s.jobs);
export const useSelectedJob = () => {
  const id = useStore((s) => s.selectedJobId);
  const jobs = useStore((s) => s.jobs);
  return id ? jobs.find((j) => j.id === id) ?? null : null;
};
