// =============================================================
// API-DTO ↔ store-type mappers.
//
// The store types in `src/types.ts` are slightly tighter than the
// API DTOs (e.g. `Person.defaultCrew` is a `string` while
// `PersonDTO.defaultCrew` is `string | null`). These helpers do the
// narrowing on hydration and the widening on write-through so the
// rest of the app keeps working with the prototype's shapes.
// =============================================================
import type {
  Crew,
  Customer,
  Job,
  JobSlot,
  Person,
  Project,
  Region,
  TimeOff,
  Truck,
  JobTemplate,
  ChecklistSection,
  ChecklistItem,
  ChecklistResponses,
  HubspotEntityMapping,
} from '../types';

import type { CrewDTO } from './schemas/crew';
import type { CustomerDTO } from './schemas/customer';
import type { JobDTO } from './schemas/job';
import type { JobSlotDTO } from './schemas/slot';
import type { PersonDTO } from './schemas/person';
import type { ProjectDTO } from './schemas/project';
import type { RegionDTO } from './schemas/region';
import type { TimeOffDTO } from './schemas/timeoff';
import type { TruckDTO } from './schemas/truck';
import type { JobTemplateDTO } from './schemas/template';
import type { ChecklistDTO, ChecklistResponseDTO } from './schemas/checklist';

// ---- DTO → store ----------------------------------------------------------

export function personFromDTO(d: PersonDTO): Person {
  return {
    id: d.id,
    name: d.name,
    initials: d.initials,
    roles: d.roles,
    level: d.level,
    defaultCrew: d.defaultCrew ?? '',
    certs: d.certs,
  };
}

export function crewFromDTO(d: CrewDTO): Crew {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    lead: d.lead ?? '',
    members: d.members,
    truck: d.truck,
    color: d.color,
  };
}

export function truckFromDTO(d: TruckDTO): Truck {
  return {
    id: d.id,
    name: d.name,
    plate: d.plate,
    kind: d.kind,
    capacity: d.capacity,
    assignedCrew: d.assignedCrew,
    vin: d.vin,
    status: d.status,
  };
}

export function customerFromDTO(d: CustomerDTO): Customer {
  return {
    id: d.id,
    name: d.name,
    address: d.address,
    phone: d.phone,
    hubspot: d.hubspot ?? '',
  };
}

export function projectFromDTO(d: ProjectDTO): Project {
  return {
    id: d.id,
    customer: d.customer,
    name: d.name,
    type: d.type,
    status: d.status,
    soldDate: d.soldDate,
    targetCompletion: d.targetCompletion,
    value: d.value,
    hubspotDealId: d.hubspotDealId,
    primaryCrew: d.primaryCrew,
    description: d.description,
    designNotes: d.designNotes,
  };
}

export function regionFromDTO(d: RegionDTO): Region {
  return {
    id: d.id,
    name: d.name,
    short: d.short,
    subs: d.subs.map((s) => ({
      id: s.id,
      name: s.name,
      headcount: s.headcount,
      crews: s.crews,
    })),
  };
}

export function timeOffFromDTO(d: TimeOffDTO): TimeOff {
  return {
    id: d.id,
    personId: d.personId,
    date: d.date,
    type: d.type,
    label: d.label,
  };
}

export function slotFromDTO(d: JobSlotDTO): JobSlot {
  return {
    id: d.id,
    role: d.role,
    level: d.level,
    hours: d.hours,
    start: d.start,
    optional: d.optional,
    assignedTo: d.assignedTo,
    suggested: d.suggested,
  };
}

export function jobFromDTO(d: JobDTO): Job {
  return {
    id: d.id,
    type: d.type,
    status: d.status,
    customer: d.customer,
    date: d.date,
    startHour: d.startHour,
    durationHrs: d.durationHrs,
    crewId: d.crewId,
    extraCrewIds: d.extraCrewIds ?? [],
    truckId: d.truckId,
    slots: (d.slots ?? []).map(slotFromDTO),
    notes: d.notes ?? '',
    address: d.address ?? '',
    hubspotDealId: d.hubspotDealId,
    driveTimeMin: d.driveTimeMin ?? 0,
    price: d.price,
    multidayGroupId: d.multidayGroupId ?? null,
    multidayIndex: d.multidayIndex ?? null,
    multidayTotal: d.multidayTotal ?? null,
    continuationOf: d.continuationOf ?? null,
    projectId: d.projectId ?? null,
    vehicleMode: d.vehicleMode,
    personalDriverId: d.personalDriverId ?? null,
    endDate: d.endDate,
    endHour: d.endHour,
    daysSpanned: d.daysSpanned,
  };
}

export function templatesFromDTOs(rows: JobTemplateDTO[]): Record<string, JobTemplate> {
  const out: Record<string, JobTemplate> = {};
  for (const r of rows) {
    out[r.id] = {
      label: r.label,
      truckCount: r.truckCount,
      slots: r.slots.map((s) => ({
        role: s.role,
        level: s.level,
        hours: s.hours,
        start: s.start,
        optional: s.optional,
      })),
    };
  }
  return out;
}

export function checklistsFromDTOs(rows: ChecklistDTO[]): Record<string, ChecklistSection[]> {
  const out: Record<string, ChecklistSection[]> = {};
  for (const r of rows) {
    out[r.jobType] = r.sections.map((section) => ({
      section: section.section,
      items: section.items.map((item) => {
        // ChecklistItem is a discriminated union — recompose per type.
        const base = { id: item.id, label: item.label, required: item.required };
        switch (item.type) {
          case 'checkbox':
            return { ...base, type: 'checkbox' };
          case 'photo':
            return { ...base, type: 'photo', minPhotos: item.minPhotos };
          case 'single':
            return { ...base, type: 'single', options: item.options ?? [] };
          case 'multi':
            return { ...base, type: 'multi', options: item.options ?? [] };
          case 'number':
            return { ...base, type: 'number', unit: item.unit, min: item.min, max: item.max };
          case 'text':
            return { ...base, type: 'text', placeholder: item.placeholder };
          case 'longtext':
            return { ...base, type: 'longtext', placeholder: item.placeholder };
          case 'signature':
            return { ...base, type: 'signature' };
          case 'rating':
            return { ...base, type: 'rating' };
          default: {
            // exhaustiveness fallback
            const fallback: ChecklistItem = { ...base, type: 'checkbox' };
            return fallback;
          }
        }
      }) as ChecklistItem[],
    }));
  }
  return out;
}

export function checklistResponsesFromDTOs(
  jobId: string,
  rows: ChecklistResponseDTO[],
): ChecklistResponses {
  const out: ChecklistResponses = {};
  for (const r of rows) {
    if (r.jobId === jobId) out[r.itemId] = r.value;
  }
  return out;
}

// ---- store → DTO (for writes) ---------------------------------------------

export function jobToDTOPatch(j: Job): Partial<JobDTO> {
  return {
    type: j.type,
    status: j.status,
    customer: j.customer,
    date: j.date,
    startHour: j.startHour,
    durationHrs: j.durationHrs,
    crewId: j.crewId,
    extraCrewIds: j.extraCrewIds,
    truckId: j.truckId,
    slots: j.slots,
    notes: j.notes,
    address: j.address,
    hubspotDealId: j.hubspotDealId,
    driveTimeMin: j.driveTimeMin,
    price: j.price,
    projectId: j.projectId ?? null,
    multidayGroupId: j.multidayGroupId ?? null,
    multidayIndex: j.multidayIndex ?? null,
    multidayTotal: j.multidayTotal ?? null,
    continuationOf: j.continuationOf ?? null,
    vehicleMode: j.vehicleMode,
    personalDriverId: j.personalDriverId ?? null,
    endDate: j.endDate,
    endHour: j.endHour,
    daysSpanned: j.daysSpanned,
  };
}

export function jobToDTOCreate(j: Job): Partial<JobDTO> & Pick<JobDTO, 'type'> {
  return { ...jobToDTOPatch(j), id: j.id, type: j.type };
}

export function personToDTOPatch(p: Person): Partial<PersonDTO> {
  return {
    name: p.name,
    initials: p.initials,
    roles: p.roles,
    level: p.level,
    defaultCrew: p.defaultCrew || null,
    certs: p.certs,
  };
}

export function personToDTOCreate(p: Person): Partial<PersonDTO> {
  return { ...personToDTOPatch(p), id: p.id };
}

export function crewToDTOPatch(c: Crew): Partial<CrewDTO> {
  return {
    name: c.name,
    type: c.type,
    lead: c.lead || null,
    members: c.members,
    truck: c.truck,
    color: c.color,
  };
}

export function crewToDTOCreate(c: Crew): Partial<CrewDTO> {
  return { ...crewToDTOPatch(c), id: c.id };
}

export function truckToDTOPatch(t: Truck): Partial<TruckDTO> {
  return {
    name: t.name,
    plate: t.plate,
    kind: t.kind,
    capacity: t.capacity,
    assignedCrew: t.assignedCrew,
    vin: t.vin,
    status: t.status,
  };
}

export function truckToDTOCreate(t: Truck): Partial<TruckDTO> {
  return { ...truckToDTOPatch(t), id: t.id };
}

export function projectToDTOPatch(p: Project): Partial<ProjectDTO> {
  return {
    customer: p.customer,
    name: p.name,
    type: p.type,
    status: p.status,
    soldDate: p.soldDate,
    targetCompletion: p.targetCompletion,
    value: p.value,
    hubspotDealId: p.hubspotDealId,
    primaryCrew: p.primaryCrew,
    description: p.description,
    designNotes: p.designNotes,
  };
}

export function projectToDTOCreate(p: Project): Partial<ProjectDTO> {
  return { ...projectToDTOPatch(p), id: p.id };
}

export function timeOffToDTOPatch(t: TimeOff): Partial<TimeOffDTO> {
  return {
    personId: t.personId,
    date: t.date,
    type: t.type,
    label: t.label,
  };
}

export function timeOffToDTOCreate(t: TimeOff): Partial<TimeOffDTO> {
  return { ...timeOffToDTOPatch(t), id: t.id };
}

export function regionToDTOPatch(r: Region): Partial<RegionDTO> {
  return {
    name: r.name,
    short: r.short,
    subs: r.subs,
  };
}

export function regionToDTOCreate(r: Region): Partial<RegionDTO> {
  return { ...regionToDTOPatch(r), id: r.id };
}

export function templateToDTOPatch(tpl: JobTemplate): Partial<JobTemplateDTO> {
  return {
    label: tpl.label,
    truckCount: tpl.truckCount,
    slots: tpl.slots.map((s) => ({
      role: s.role,
      level: s.level,
      hours: s.hours,
      start: s.start,
      optional: s.optional,
    })),
  };
}

// ---- type re-exports so the store can use them without poking into schemas

export type {
  JobDTO,
  PersonDTO,
  CrewDTO,
  TruckDTO,
  CustomerDTO,
  ProjectDTO,
  RegionDTO,
  TimeOffDTO,
  JobTemplateDTO,
  ChecklistDTO,
  ChecklistResponseDTO,
};
export type { HubspotEntityMapping };
