// =============================================================
// Typed JSON client over the v1 API.
//
// Wraps `openapi-fetch` with resource-grouped helpers so call
// sites read `client.jobs.list({ date })` instead of repeating the
// path. The wrapped fetch is fully typed off `paths` once
// `pnpm gen:api` has populated types.ts; until then it stays
// loosely typed but still runtime-correct.
//
// Auth: when running in the browser, the NextAuth session cookie
// rides along automatically. For server-to-server or CLI use,
// pass `Authorization: Bearer <api_key>` via `headers`.
// =============================================================

import createClient from 'openapi-fetch';

import type {
  ApiKeyCreateResultSchema,
  ApiKeyCreateSchema,
  ApiKeyRowSchema,
} from '../schemas/apiKey';
import type { ChecklistResponseDTO, ChecklistDTO } from '../schemas/checklist';
import type { CrewDTO } from '../schemas/crew';
import type { CrewRosterOverrideDTO } from '../schemas/crewRosterOverride';
import type { CustomerDTO } from '../schemas/customer';
import type { Customer, Project, Region } from '../../types';
import type { JobDTO } from '../schemas/job';
import type { JobSlotDTO } from '../schemas/slot';
import type { PersonDTO } from '../schemas/person';
import type { ProjectDTO } from '../schemas/project';
import type { RegionDTO } from '../schemas/region';
import type { JobTemplateDTO } from '../schemas/template';
import type { TimeOffDTO } from '../schemas/timeoff';
import type { TruckDTO } from '../schemas/truck';
import type { paths } from './types';
import type { z } from '../schemas/common';

export interface ClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  apiKey?: string;
}

/** Union of the two shapes /hubspot/sync may return depending on DATABASE_URL. */
export type HubspotSyncResponse =
  | {
      ok: boolean;
      // DB-mode shape:
      contacts: number;
      deals: number;
      projects: number;
      serviceAreas: number;
      installations: number;
      startedAt: string;
      finishedAt: string;
      errors: string[];
      demo?: false;
    }
  | {
      ok: boolean;
      // Demo-mode shape:
      demo: true;
      customers: Customer[];
      projects: Project[];
      regions: Region[];
      lastSyncedAt: string;
      errors: string[];
    };

export interface PagedResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

interface CommonInit {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

interface ListFilters extends CommonInit {
  limit?: number;
  offset?: number;
}

interface JobListFilters extends ListFilters {
  date?: string;
  crewId?: string;
  status?: JobDTO['status'];
  customer?: string;
  projectId?: string;
}

interface CrewRosterOverrideFilters extends ListFilters {
  date?: string;
  from?: string;
  to?: string;
  personId?: string;
  targetCrewId?: string;
}

export function createApiClient(opts: ClientOptions = {}) {
  const baseUrl = opts.baseUrl ?? '/api/v1';
  const raw = createClient<paths>({ baseUrl, fetch: opts.fetch });

  function authHeaders(extra?: Record<string, string>): Record<string, string> {
    const h: Record<string, string> = { ...(extra ?? {}) };
    if (opts.apiKey) h['Authorization'] = `Bearer ${opts.apiKey}`;
    return h;
  }

  async function request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: string,
    init: CommonInit & { body?: unknown; query?: Record<string, string | undefined> } = {},
  ): Promise<T> {
    const url = new URL(baseUrl + path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (init.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const fetcher = opts.fetch ?? fetch;
    const res = await fetcher(url.toString().replace(/^https?:\/\/[^/]+/, ''), {
      method,
      signal: init.signal,
      headers: authHeaders({
        'content-type': 'application/json',
        accept: 'application/json',
        ...init.headers,
      }),
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'include',
    });
    if (!res.ok) {
      let detail: unknown;
      try {
        detail = await res.json();
      } catch {
        detail = await res.text();
      }
      throw Object.assign(new Error(`API ${method} ${path} failed: ${res.status}`), {
        status: res.status,
        problem: detail,
      });
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    raw,

    health: {
      get: () => request<{ ok: true }>('GET', '/health'),
    },

    jobs: {
      list: (f: JobListFilters = {}) =>
        request<PagedResponse<JobDTO>>('GET', '/jobs', {
          ...f,
          query: {
            date: f.date,
            crewId: f.crewId,
            status: f.status,
            customer: f.customer,
            projectId: f.projectId,
            limit: f.limit?.toString(),
            offset: f.offset?.toString(),
          },
        }),
      get: (id: string, init: CommonInit = {}) =>
        request<JobDTO>('GET', `/jobs/${encodeURIComponent(id)}`, init),
      create: (body: Partial<JobDTO> & Pick<JobDTO, 'type'>, init: CommonInit = {}) =>
        request<JobDTO>('POST', '/jobs', { ...init, body }),
      update: (id: string, body: Partial<JobDTO>, init: CommonInit = {}) =>
        request<JobDTO>('PATCH', `/jobs/${encodeURIComponent(id)}`, { ...init, body }),
      remove: (id: string, init: CommonInit = {}) =>
        request<{ ok: true }>('DELETE', `/jobs/${encodeURIComponent(id)}`, init),
      transition: (id: string, body: { status: JobDTO['status']; at?: string }, init: CommonInit = {}) =>
        request<JobDTO>('POST', `/jobs/${encodeURIComponent(id)}/transition`, { ...init, body }),
      autoFill: (id: string, init: CommonInit = {}) =>
        request<JobDTO>('POST', `/jobs/${encodeURIComponent(id)}/auto-fill`, init),
      assignSlot: (jobId: string, slotId: string, assignedTo: string | null) =>
        request<JobSlotDTO>(
          'PATCH',
          `/jobs/${encodeURIComponent(jobId)}/slots/${encodeURIComponent(slotId)}`,
          { body: { assignedTo } },
        ),
    },

    people: {
      list: (f: ListFilters = {}) =>
        request<PagedResponse<PersonDTO>>('GET', '/people', {
          ...f,
          query: { limit: f.limit?.toString(), offset: f.offset?.toString() },
        }),
      get: (id: string) => request<PersonDTO>('GET', `/people/${encodeURIComponent(id)}`),
      create: (body: Partial<PersonDTO>) => request<PersonDTO>('POST', '/people', { body }),
      update: (id: string, body: Partial<PersonDTO>) =>
        request<PersonDTO>('PATCH', `/people/${encodeURIComponent(id)}`, { body }),
      remove: (id: string) =>
        request<{ ok: true }>('DELETE', `/people/${encodeURIComponent(id)}`),
    },

    crews: {
      list: (f: ListFilters = {}) =>
        request<PagedResponse<CrewDTO>>('GET', '/crews', {
          ...f,
          query: { limit: f.limit?.toString(), offset: f.offset?.toString() },
        }),
      get: (id: string) => request<CrewDTO>('GET', `/crews/${encodeURIComponent(id)}`),
      create: (body: Partial<CrewDTO>) => request<CrewDTO>('POST', '/crews', { body }),
      update: (id: string, body: Partial<CrewDTO>) =>
        request<CrewDTO>('PATCH', `/crews/${encodeURIComponent(id)}`, { body }),
      remove: (id: string) =>
        request<{ ok: true }>('DELETE', `/crews/${encodeURIComponent(id)}`),
    },

    crewRosterOverrides: {
      list: (f: CrewRosterOverrideFilters = {}) =>
        request<PagedResponse<CrewRosterOverrideDTO>>('GET', '/crew-roster-overrides', {
          ...f,
          query: {
            date: f.date,
            from: f.from,
            to: f.to,
            personId: f.personId,
            targetCrewId: f.targetCrewId,
            limit: f.limit?.toString(),
            offset: f.offset?.toString(),
          },
        }),
      get: (id: string) =>
        request<CrewRosterOverrideDTO>('GET', `/crew-roster-overrides/${encodeURIComponent(id)}`),
      create: (body: Partial<CrewRosterOverrideDTO>) =>
        request<CrewRosterOverrideDTO>('POST', '/crew-roster-overrides', { body }),
      update: (id: string, body: Partial<CrewRosterOverrideDTO>) =>
        request<CrewRosterOverrideDTO>('PATCH', `/crew-roster-overrides/${encodeURIComponent(id)}`, { body }),
      remove: (id: string) =>
        request<{ ok: true }>('DELETE', `/crew-roster-overrides/${encodeURIComponent(id)}`),
    },

    trucks: {
      list: (f: ListFilters = {}) =>
        request<PagedResponse<TruckDTO>>('GET', '/trucks', {
          ...f,
          query: { limit: f.limit?.toString(), offset: f.offset?.toString() },
        }),
      get: (id: string) => request<TruckDTO>('GET', `/trucks/${encodeURIComponent(id)}`),
      create: (body: Partial<TruckDTO>) => request<TruckDTO>('POST', '/trucks', { body }),
      update: (id: string, body: Partial<TruckDTO>) =>
        request<TruckDTO>('PATCH', `/trucks/${encodeURIComponent(id)}`, { body }),
      remove: (id: string) =>
        request<{ ok: true }>('DELETE', `/trucks/${encodeURIComponent(id)}`),
    },

    customers: {
      list: (f: ListFilters = {}) =>
        request<PagedResponse<CustomerDTO>>('GET', '/customers', {
          ...f,
          query: { limit: f.limit?.toString(), offset: f.offset?.toString() },
        }),
      get: (id: string) => request<CustomerDTO>('GET', `/customers/${encodeURIComponent(id)}`),
      create: (body: Partial<CustomerDTO>) => request<CustomerDTO>('POST', '/customers', { body }),
      update: (id: string, body: Partial<CustomerDTO>) =>
        request<CustomerDTO>('PATCH', `/customers/${encodeURIComponent(id)}`, { body }),
      remove: (id: string) =>
        request<{ ok: true }>('DELETE', `/customers/${encodeURIComponent(id)}`),
    },

    projects: {
      list: (f: ListFilters = {}) =>
        request<PagedResponse<ProjectDTO>>('GET', '/projects', {
          ...f,
          query: { limit: f.limit?.toString(), offset: f.offset?.toString() },
        }),
      get: (id: string) => request<ProjectDTO>('GET', `/projects/${encodeURIComponent(id)}`),
      create: (body: Partial<ProjectDTO>) => request<ProjectDTO>('POST', '/projects', { body }),
      update: (id: string, body: Partial<ProjectDTO>) =>
        request<ProjectDTO>('PATCH', `/projects/${encodeURIComponent(id)}`, { body }),
      remove: (id: string) =>
        request<{ ok: true }>('DELETE', `/projects/${encodeURIComponent(id)}`),
    },

    templates: {
      list: (f: ListFilters = {}) =>
        request<PagedResponse<JobTemplateDTO>>('GET', '/templates', {
          ...f,
          query: { limit: f.limit?.toString(), offset: f.offset?.toString() },
        }),
      get: (id: string) => request<JobTemplateDTO>('GET', `/templates/${encodeURIComponent(id)}`),
      create: (body: Partial<JobTemplateDTO>) => request<JobTemplateDTO>('POST', '/templates', { body }),
      update: (id: string, body: Partial<JobTemplateDTO>) =>
        request<JobTemplateDTO>('PATCH', `/templates/${encodeURIComponent(id)}`, { body }),
      remove: (id: string) =>
        request<{ ok: true }>('DELETE', `/templates/${encodeURIComponent(id)}`),
    },

    checklists: {
      list: () => request<ChecklistDTO[]>('GET', '/checklists'),
      get: (id: string) => request<ChecklistDTO>('GET', `/checklists/${encodeURIComponent(id)}`),
      responsesForJob: (jobId: string) =>
        request<ChecklistResponseDTO[]>(
          'GET',
          `/jobs/${encodeURIComponent(jobId)}/checklist-responses`,
        ),
      upsertResponse: (
        jobId: string,
        body: { itemId: string; value: ChecklistResponseDTO['value'] },
      ) =>
        request<ChecklistResponseDTO>(
          'PUT',
          `/jobs/${encodeURIComponent(jobId)}/checklist-responses`,
          { body },
        ),
    },

    timeOff: {
      list: (f: { personId?: string; date?: string } & ListFilters = {}) =>
        request<PagedResponse<TimeOffDTO>>('GET', '/time-off', {
          ...f,
          query: {
            personId: f.personId,
            date: f.date,
            limit: f.limit?.toString(),
            offset: f.offset?.toString(),
          },
        }),
      get: (id: string) => request<TimeOffDTO>('GET', `/time-off/${encodeURIComponent(id)}`),
      create: (body: Partial<TimeOffDTO>) => request<TimeOffDTO>('POST', '/time-off', { body }),
      update: (id: string, body: Partial<TimeOffDTO>) =>
        request<TimeOffDTO>('PATCH', `/time-off/${encodeURIComponent(id)}`, { body }),
      remove: (id: string) =>
        request<{ ok: true }>('DELETE', `/time-off/${encodeURIComponent(id)}`),
    },

    regions: {
      list: (f: ListFilters = {}) =>
        request<PagedResponse<RegionDTO>>('GET', '/regions', {
          ...f,
          query: { limit: f.limit?.toString(), offset: f.offset?.toString() },
        }),
      get: (id: string) => request<RegionDTO>('GET', `/regions/${encodeURIComponent(id)}`),
      create: (body: Partial<RegionDTO>) => request<RegionDTO>('POST', '/regions', { body }),
      update: (id: string, body: Partial<RegionDTO>) =>
        request<RegionDTO>('PATCH', `/regions/${encodeURIComponent(id)}`, { body }),
      remove: (id: string) =>
        request<{ ok: true }>('DELETE', `/regions/${encodeURIComponent(id)}`),
    },

    suggest: {
      crew: (body:
        | { jobId: string }
        | { jobDraft: Partial<JobDTO> & Pick<JobDTO, 'type'> }) =>
        request<{
          suggestions: { crewId: string; score: number; reasons: string[] }[];
        }>('POST', '/suggest/crew', { body }),
      time: (body: {
        jobType: string;
        durationHrs: number;
        requiredRoles?: { role: PersonDTO['roles'][number]; level?: PersonDTO['level'] }[];
        anchorDate?: string;
        daysAhead?: number;
      }) =>
        request<{
          suggestions: {
            crewId: string;
            date: string;
            startHour: number;
            endHour: number;
            score: number;
            reasons: string[];
          }[];
        }>('POST', '/suggest/time', { body }),
    },

    hubspot: {
      sync: () =>
        request<HubspotSyncResponse>('POST', '/hubspot/sync'),
      ping: () =>
        request<{
          ok: boolean;
          portalId: number;
          accountType: string;
          timeZone: string;
          currency: string;
        }>('POST', '/hubspot/ping'),
      pushJob: (id: string) =>
        request<{ ok: boolean; message: string; hubspotObjectId?: string }>(
          'POST',
          `/hubspot/push-job/${encodeURIComponent(id)}`,
        ),
      pushProject: (id: string) =>
        request<{ ok: boolean; message: string; hubspotObjectId?: string }>(
          'POST',
          `/hubspot/push-project/${encodeURIComponent(id)}`,
        ),
      getMapping: () =>
        request<{
          entity: string;
          fields: { appField: string; hsField: string; direction: 'push' | 'pull' | 'both' }[];
        }[]>('GET', '/hubspot/mapping'),
      putMapping: (
        entity: string,
        body: { fields: { appField: string; hsField: string; direction: 'push' | 'pull' | 'both' }[] },
      ) =>
        request<{
          entity: string;
          fields: { appField: string; hsField: string; direction: 'push' | 'pull' | 'both' }[];
        }>('PUT', `/hubspot/mapping/${encodeURIComponent(entity)}`, { body }),
    },

    apiKeys: {
      list: () => request<z.infer<typeof ApiKeyRowSchema>[]>('GET', '/admin/api-keys'),
      create: (body: z.infer<typeof ApiKeyCreateSchema>) =>
        request<z.infer<typeof ApiKeyCreateResultSchema>>('POST', '/admin/api-keys', { body }),
      revoke: (id: string) =>
        request<z.infer<typeof ApiKeyRowSchema>>(
          'POST',
          `/admin/api-keys/${encodeURIComponent(id)}/revoke`,
        ),
    },

    me: {
      get: () =>
        request<{
          userId: string;
          role: string;
          displayName: string | null;
          source: 'session' | 'api_key' | 'demo';
        }>('GET', '/me'),
    },

    auditLog: {
      list: (query?: {
        entityType?: string;
        entityId?: string;
        actorUserId?: string;
        from?: string;
        to?: string;
        cursor?: string;
        limit?: number;
        offset?: number;
      }) =>
        request<
          PagedResponse<{
            id: string;
            actorUserId: string | null;
            action: string;
            entityType: string;
            entityId: string;
            before: unknown;
            after: unknown;
            createdAt: string;
          }>
        >('GET', '/audit-log', {
          query: query
            ? Object.fromEntries(
                Object.entries(query).map(([k, v]) => [k, v == null ? undefined : String(v)]),
              )
            : undefined,
        }),
    },
  };
}

export const client = createApiClient();
export type ApiClient = ReturnType<typeof createApiClient>;
