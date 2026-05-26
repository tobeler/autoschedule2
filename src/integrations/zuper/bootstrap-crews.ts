// =============================================================
// One-time crew materialization from Zuper team names.
//
// Per Erik's directive: "Zuper teams are the default crews, but I
// don't want any carryover from the Zuper team structure." So this
// route seeds the `crews` table from distinct zuperTeamName values
// on jobs, links existing technicians (people.zuperPrimaryTeam) into
// crew_members, and stamps jobs.crewId so the dispatch board renders
// jobs in real crew lanes instead of Zuper-team virtual rows.
//
// After this runs, the crews are OURS — rename / delete / edit freely.
// The link back to Zuper is preserved on `crews.zuperTeamName` for
// traceability only; no read-back from Zuper after materialization.
// =============================================================

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db';
import {
  crews,
  crewMembers,
  jobs as jobsTable,
  people as peopleTable,
} from '@/db/schema';

const REGION_COLOR: Record<string, string> = {
  CO: '#0EA5E9', // sky-500
  MA: '#10B981', // emerald-500
  NY: '#8B5CF6', // violet-500
  BC: '#F59E0B', // amber-500
  CA: '#F97316', // orange-500
};

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function crewIdFor(teamName: string): string {
  return 'crew-' + slug(teamName);
}

function colorFor(teamName: string): string {
  const prefix = teamName.split('-')[0]?.toUpperCase() ?? '';
  return REGION_COLOR[prefix] ?? '#475569';
}

function typeFor(teamName: string): 'install' | 'electrical' | 'sales' | 'plumbing' | string {
  const t = teamName.toLowerCase();
  if (t.includes('electrician') || t.includes('-elec')) return 'electrical';
  if (t.includes('plumb')) return 'plumbing';
  if (t.includes('sales') || t.includes('walkthrough')) return 'sales';
  return 'install';
}

export interface BootstrapCrewsResult {
  ok: boolean;
  teamsFound: number;
  crewsCreated: number;
  crewsUpdated: number;
  jobsLinked: number;
  peopleLinked: number;
  membershipsCreated: number;
  errors: string[];
}

export async function bootstrapCrewsFromZuper(): Promise<BootstrapCrewsResult> {
  const result: BootstrapCrewsResult = {
    ok: false,
    teamsFound: 0,
    crewsCreated: 0,
    crewsUpdated: 0,
    jobsLinked: 0,
    peopleLinked: 0,
    membershipsCreated: 0,
    errors: [],
  };

  // Pull distinct team names from jobs (the source of truth). Some teams
  // may only appear in jobs but have no people assigned, and vice versa —
  // union both for completeness.
  const jobTeams = await db
    .selectDistinct({ name: jobsTable.zuperTeamName })
    .from(jobsTable);
  const peopleTeams = await db
    .selectDistinct({ name: peopleTable.zuperPrimaryTeam })
    .from(peopleTable);

  const teamNames = new Set<string>();
  for (const r of jobTeams) if (r.name) teamNames.add(r.name);
  for (const r of peopleTeams) if (r.name) teamNames.add(r.name);
  result.teamsFound = teamNames.size;

  // Pre-fetch existing crews keyed by id so we can decide create vs update.
  const existing = await db.select({ id: crews.id }).from(crews);
  const existingIds = new Set(existing.map((c) => c.id));

  try {
    await db.transaction(async (tx) => {
      for (const teamName of teamNames) {
        const id = crewIdFor(teamName);
        const wasNew = !existingIds.has(id);
        await tx
          .insert(crews)
          .values({
            id,
            name: teamName,
            type: typeFor(teamName),
            color: colorFor(teamName),
            zuperTeamName: teamName,
          })
          .onConflictDoUpdate({
            target: crews.id,
            set: {
              name: teamName,
              type: typeFor(teamName),
              color: colorFor(teamName),
              zuperTeamName: teamName,
              updatedAt: new Date(),
            },
          });
        if (wasNew) result.crewsCreated += 1;
        else result.crewsUpdated += 1;

        // Link jobs whose zuperTeamName matches this team to this crew.
        const linkedJobs = await tx
          .update(jobsTable)
          .set({ crewId: id, updatedAt: new Date() })
          .where(eq(jobsTable.zuperTeamName, teamName))
          .returning({ id: jobsTable.id });
        result.jobsLinked += linkedJobs.length;

        // Set defaultCrew on people whose zuperPrimaryTeam matches.
        const linkedPeople = await tx
          .update(peopleTable)
          .set({ defaultCrewId: id, updatedAt: new Date() })
          .where(eq(peopleTable.zuperPrimaryTeam, teamName))
          .returning({ id: peopleTable.id });
        result.peopleLinked += linkedPeople.length;

        // Populate crew_members for the same set. onConflictDoNothing
        // because the table's PK is (crewId, personId) and we want it
        // to be safe to re-run.
        for (const p of linkedPeople) {
          await tx
            .insert(crewMembers)
            .values({ crewId: id, personId: p.id })
            .onConflictDoNothing();
          result.membershipsCreated += 1;
        }
      }
    });
    result.ok = result.errors.length === 0;
  } catch (err) {
    result.errors.push((err as Error).message);
  }

  return result;
}
