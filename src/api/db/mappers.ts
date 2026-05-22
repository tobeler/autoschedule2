// =============================================================
// DB-row ↔ API-DTO mappers.
//
// Drizzle stores numerics as strings (postgres-js convention) and
// jsonb columns as `unknown`. Wherever the API contract surfaces a
// `number`, we coerce here so the routes stay declarative.
// =============================================================
import type {
  DbCrew,
  DbCustomer,
  DbJob,
  DbJobSlot,
  DbPerson,
  DbProject,
  DbRegion,
  DbTimeOff,
  DbTruck,
} from '@/db/schema';
import type { RoleKey } from '@/types';

import type { CrewDTO } from '../schemas/crew';
import type { CustomerDTO } from '../schemas/customer';
import type { JobDTO } from '../schemas/job';
import type { JobSlotDTO } from '../schemas/slot';
import type { PersonDTO } from '../schemas/person';
import type { ProjectDTO } from '../schemas/project';
import type { RegionDTO } from '../schemas/region';
import type { TimeOffDTO } from '../schemas/timeoff';
import type { TruckDTO } from '../schemas/truck';

function num(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function personToDTO(row: DbPerson, roles: RoleKey[]): PersonDTO {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials,
    level: row.level,
    roles,
    defaultCrew: row.defaultCrewId,
    certs: (row.certs as string[] | null | undefined) ?? undefined,
  };
}

export function truckToDTO(row: DbTruck): TruckDTO {
  return {
    id: row.id,
    name: row.name,
    plate: row.plate,
    kind: row.kind,
    capacity: row.capacity,
    assignedCrew: row.assignedCrewId,
    vin: row.vin,
    status: row.status ?? undefined,
  };
}

export function crewToDTO(row: DbCrew, members: string[]): CrewDTO {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    lead: row.leadPersonId,
    members,
    truck: row.truckId,
    color: row.color,
  };
}

export function customerToDTO(row: DbCustomer): CustomerDTO {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    hubspot: row.hubspotId,
  };
}

export function projectToDTO(row: DbProject): ProjectDTO {
  return {
    id: row.id,
    customer: row.customerId,
    name: row.name,
    type: row.type,
    status: row.status,
    soldDate: row.soldDate,
    targetCompletion: row.targetCompletion,
    value: numOrNull(row.value),
    hubspotDealId: row.hubspotDealId,
    hubspotProjectId: row.hubspotProjectId,
    primaryCrew: row.primaryCrewId,
    description: row.description ?? undefined,
    designNotes: row.designNotes ?? undefined,
    source: row.source,
  };
}

export function regionToDTO(row: DbRegion, subs: DbRegion[]): RegionDTO {
  return {
    id: row.id,
    name: row.name,
    short: row.short,
    subs: subs.map((s) => ({
      id: s.id,
      name: s.name,
      headcount: s.headcount,
      crews: s.crewCount,
    })),
  };
}

export function timeOffToDTO(row: DbTimeOff): TimeOffDTO {
  return {
    id: row.id,
    personId: row.personId,
    date: row.date,
    type: row.type,
    label: row.label,
  };
}

export function jobSlotToDTO(row: DbJobSlot): JobSlotDTO {
  return {
    id: row.id,
    role: row.role,
    level: row.level,
    hours: num(row.hours),
    start: num(row.startOffsetHours),
    optional: row.optional,
    assignedTo: row.assignedTo,
    suggested: row.suggested,
  };
}

export function jobToDTO(
  row: DbJob,
  slots: DbJobSlot[],
  extraCrewIds: string[],
): JobDTO {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    customer: row.customerId,
    date: row.date,
    startHour: numOrNull(row.startHour),
    durationHrs: num(row.durationHrs),
    crewId: row.crewId,
    extraCrewIds,
    truckId: row.truckId,
    slots: slots.map(jobSlotToDTO),
    notes: row.notes,
    address: row.address,
    hubspotDealId: row.hubspotDealId,
    driveTimeMin: row.driveTimeMin,
    price: row.price != null ? num(row.price) : undefined,
    multidayGroupId: row.multidayGroupId ?? null,
    multidayIndex: row.multidayIndex ?? null,
    multidayTotal: row.multidayTotal ?? null,
    continuationOf: row.continuationOf ?? null,
    projectId: row.projectId ?? null,
    vehicleMode: row.vehicleMode ?? undefined,
    personalDriverId: row.personalDriverId ?? null,
    endDate: row.endDate ?? undefined,
    endHour: row.endHour != null ? num(row.endHour) : undefined,
    daysSpanned: row.daysSpanned ?? undefined,
  };
}
