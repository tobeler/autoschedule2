// =============================================================
// Zustand store — central state with localStorage persistence.
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

export type TabId =
  | 'dispatch'
  | 'attention'
  | 'jobs'
  | 'projects'
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
  sidebarCollapsed: boolean;
  toast: string | null;
  showWizard: boolean;
  smartScheduleJobId: string | null;

  // ---- actions ----
  setTab: (t: TabId) => void;
  selectJob: (id: string | null) => void;
  collapseSidebar: (v: boolean) => void;
  pushToast: (msg: string) => void;
  clearToast: () => void;
  openWizard: () => void;
  closeWizard: () => void;
  openSmartSchedule: (jobId: string) => void;
  closeSmartSchedule: () => void;
  setRegion: (r: RegionSelection) => void;
  setTweak: <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => void;

  // ---- mutations ----
  updateJob: (job: Job) => void;
  addJob: (job: Job) => void;
  removeJob: (id: string) => void;
  resizeJob: (id: string, hours: number) => void;
  setJobStatus: (id: string, status: JobStatus) => void;
  moveJob: (id: string, updates: { date?: string | null; startHour?: number | null; crewId?: string | null; truckId?: string | null }) => void;
  updateTemplate: (key: string, tpl: JobTemplate) => void;
  setHubspotMapping: (m: HubspotEntityMapping[]) => void;
  setChecklist: (jobType: string, sections: ChecklistSection[]) => void;
  setChecklistResponse: (jobId: string, responses: ChecklistResponses) => void;
  // Bulk-import setters used by integrations/hubspot/sync.ts
  setCustomers: (customers: Customer[]) => void;
  setProjects: (projects: Project[]) => void;
  setRegions: (regions: Region[]) => void;

  resetAll: () => void;
}

const DEFAULT_TWEAKS: Tweaks = {
  density: 'cozy',
  accent: 'green',
  showDriveTime: false,
  dark: false,
};

const DEFAULT_REGION: RegionSelection = { regionId: 'co', subId: 'co-d' };

let toastTimer: ReturnType<typeof setTimeout> | null = null;

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
      sidebarCollapsed: false,
      toast: null,
      showWizard: false,
      smartScheduleJobId: null,

      setTab: (t) => set({ tab: t }),
      selectJob: (id) => set({ selectedJobId: id }),
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

      updateJob: (job) =>
        set((s) => ({
          jobs: s.jobs.map((j) => (j.id === job.id ? job : j)),
          selectedJobId: s.selectedJobId === job.id ? job.id : s.selectedJobId,
        })),
      addJob: (job) => set((s) => ({ jobs: [...s.jobs, job] })),
      removeJob: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
      resizeJob: (id, hours) =>
        set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, durationHrs: hours } : j)) })),
      setJobStatus: (id, status) =>
        set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, status } : j)) })),
      moveJob: (id, updates) =>
        set((s) => ({
          jobs: s.jobs.map((j) =>
            j.id === id
              ? {
                  ...j,
                  ...updates,
                  status:
                    j.status === 'unscheduled' && updates.date && updates.startHour != null
                      ? 'scheduled'
                      : j.status,
                }
              : j,
          ),
        })),
      updateTemplate: (key, tpl) =>
        set((s) => ({ templates: { ...s.templates, [key]: tpl } })),
      setHubspotMapping: (m) => set({ hubspotMapping: m }),
      setChecklist: (jobType, sections) =>
        set((s) => ({ checklists: { ...s.checklists, [jobType]: sections } })),
      setChecklistResponse: (jobId, responses) =>
        set((s) => ({ checklistResponses: { ...s.checklistResponses, [jobId]: responses } })),
      setCustomers: (customers) => set({ customers }),
      setProjects: (projects) => set({ projects }),
      setRegions: (regions) => set({ regions }),

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
