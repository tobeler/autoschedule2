import { describe, expect, it } from 'vitest';

import type { Crew, CrewRosterOverride, Job, Person, TimeOff } from '../types';
import { autoFillSlots } from './assignment';
import {
  effectiveCrewForPerson,
  effectiveCrewMemberIds,
  loanEntriesForCrewDay,
  personIsAvailableForSlot,
} from './crewEffective';

const people: Person[] = [
  { id: 'lead-a', name: 'A Lead', initials: 'AL', roles: ['hvac_lead'], level: 'L3', defaultCrew: 'install-a' },
  { id: 'inst-a', name: 'A Installer', initials: 'AI', roles: ['hvac_installer'], level: 'L2', defaultCrew: 'install-a' },
  { id: 'lead-b', name: 'B Lead', initials: 'BL', roles: ['hvac_lead'], level: 'L3', defaultCrew: 'install-b' },
  { id: 'inst-b', name: 'B Installer', initials: 'BI', roles: ['hvac_installer'], level: 'L2', defaultCrew: 'install-b' },
  { id: 'svc-a', name: 'Solo Service A', initials: 'SA', roles: ['service_tech'], level: 'L3', defaultCrew: 'service-a' },
  { id: 'svc-b', name: 'Solo Service B', initials: 'SB', roles: ['service_tech'], level: 'L2', defaultCrew: 'service-b' },
];

const crews: Crew[] = [
  { id: 'install-a', name: 'Install A', type: 'install', lead: 'lead-a', members: ['lead-a', 'inst-a'], truck: 'truck-a', color: '#111111' },
  { id: 'install-b', name: 'Install B', type: 'install', lead: 'lead-b', members: ['lead-b', 'inst-b'], truck: 'truck-b', color: '#222222' },
  { id: 'service-a', name: 'Service A', type: 'service', lead: 'svc-a', members: ['svc-a'], truck: 'van-a', color: '#333333' },
  { id: 'service-b', name: 'Service B', type: 'service', lead: 'svc-b', members: ['svc-b'], truck: 'van-b', color: '#444444' },
];

const day = '2026-05-26';

function override(partial: Partial<CrewRosterOverride>): CrewRosterOverride {
  return {
    id: 'override-1',
    date: day,
    personId: 'inst-a',
    sourceCrewId: 'install-a',
    targetCrewId: 'install-b',
    startHour: null,
    endHour: null,
    reason: 'loan',
    ...partial,
  };
}

function job(partial: Partial<Job>): Job {
  return {
    id: 'job-1',
    type: 'heatpump',
    status: 'scheduled',
    customer: null,
    date: day,
    startHour: 8,
    durationHrs: 8,
    crewId: 'install-a',
    extraCrewIds: [],
    truckId: null,
    slots: [],
    notes: '',
    address: '',
    hubspotDealId: null,
    driveTimeMin: 0,
    ...partial,
  };
}

describe('effective crew roster', () => {
  it('uses default crew members when there are no overrides', () => {
    expect(
      effectiveCrewMemberIds({ crews, people, overrides: [], date: day, crewId: 'install-a' }),
    ).toEqual(['lead-a', 'inst-a']);
    expect(effectiveCrewForPerson(people, [], day, 'inst-a')).toBe('install-a');
  });

  it('moves a person for a full day without mutating their default crew', () => {
    const overrides = [override({})];
    expect(
      effectiveCrewMemberIds({ crews, people, overrides, date: day, crewId: 'install-a' }),
    ).toEqual(['lead-a']);
    expect(
      effectiveCrewMemberIds({ crews, people, overrides, date: day, crewId: 'install-b' }),
    ).toEqual(['lead-b', 'inst-b', 'inst-a']);
    expect(effectiveCrewForPerson(people, overrides, day, 'inst-a')).toBe('install-b');
    expect(people.find((p) => p.id === 'inst-a')?.defaultCrew).toBe('install-a');
  });

  it('honors partial-day moves by time window', () => {
    const overrides = [override({ startHour: 12, endHour: 17 })];
    expect(effectiveCrewForPerson(people, overrides, day, 'inst-a', 9)).toBe('install-a');
    expect(effectiveCrewForPerson(people, overrides, day, 'inst-a', 13)).toBe('install-b');
  });

  it('models solo service crews and temporary service pairings', () => {
    const overrides = [
      override({
        id: 'service-pair',
        personId: 'svc-a',
        sourceCrewId: 'service-a',
        targetCrewId: 'service-b',
        reason: 'service_pair',
      }),
    ];
    expect(
      effectiveCrewMemberIds({ crews, people, overrides: [], date: day, crewId: 'service-a' }),
    ).toEqual(['svc-a']);
    expect(
      effectiveCrewMemberIds({ crews, people, overrides, date: day, crewId: 'service-b' }),
    ).toEqual(['svc-b', 'svc-a']);
  });
});

describe('person availability and job-only staffing', () => {
  it('treats a slot assignment to another crew as a job-only loan', () => {
    const jobs = [
      job({
        id: 'job-with-loan',
        crewId: 'install-b',
        slots: [
          { id: 'slot-1', role: 'hvac_installer', level: 'L1', hours: 4, start: 0, assignedTo: 'inst-a' },
        ],
      }),
    ];

    const loans = loanEntriesForCrewDay({
      crewId: 'install-a',
      date: day,
      jobs,
      people,
      overrides: [],
    });

    expect(loans).toHaveLength(1);
    expect(loans[0].person.id).toBe('inst-a');
    expect(effectiveCrewForPerson(people, [], day, 'inst-a')).toBe('install-a');
  });

  it('blocks unavailable people because of time off or overlapping job slots', () => {
    const baseJob = job({
      slots: [{ id: 'target-slot', role: 'service_tech', level: 'L2', hours: 2, start: 0, assignedTo: null }],
      type: 'service',
      crewId: 'service-a',
      startHour: 10,
      durationHrs: 2,
    });
    const timeOff: TimeOff[] = [{ id: 'pto-1', personId: 'svc-a', date: day, type: 'pto', label: 'PTO' }];
    expect(
      personIsAvailableForSlot({
        person: people.find((p) => p.id === 'svc-a')!,
        slot: baseJob.slots[0],
        job: baseJob,
        jobs: [],
        timeOff,
      }),
    ).toBe(false);

    const existing = job({
      id: 'existing',
      type: 'service',
      crewId: 'service-b',
      startHour: 9,
      durationHrs: 3,
      slots: [{ id: 'existing-slot', role: 'service_tech', level: 'L2', hours: 3, start: 0, assignedTo: 'svc-b' }],
    });
    expect(
      personIsAvailableForSlot({
        person: people.find((p) => p.id === 'svc-b')!,
        slot: baseJob.slots[0],
        job: baseJob,
        jobs: [existing],
      }),
    ).toBe(false);
  });

  it('autofills effective crew members first and skips double-booked people', () => {
    const target = job({
      id: 'target',
      type: 'service',
      crewId: 'service-b',
      startHour: 10,
      durationHrs: 2,
      slots: [
        { id: 'target-slot', role: 'service_tech', level: 'L2', hours: 2, start: 0, assignedTo: null },
      ],
    });
    const existing = job({
      id: 'existing',
      type: 'service',
      crewId: 'service-b',
      startHour: 9,
      durationHrs: 3,
      slots: [{ id: 'existing-slot', role: 'service_tech', level: 'L2', hours: 3, start: 0, assignedTo: 'svc-b' }],
    });
    const overrides = [
      override({
        id: 'service-pair',
        personId: 'svc-a',
        sourceCrewId: 'service-a',
        targetCrewId: 'service-b',
        reason: 'service_pair',
      }),
    ];

    const filled = autoFillSlots(target, crews.find((c) => c.id === 'service-b'), people, {
      crews,
      rosterOverrides: overrides,
      jobs: [existing, target],
    });

    expect(filled[0].assignedTo).toBe('svc-a');
    expect(filled[0].suggested).toBe(true);
  });
});
