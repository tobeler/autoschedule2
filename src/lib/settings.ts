// =============================================================
// Typed wrapper over the settings_kv table.
//
// Used for integration feature flags (HubSpot V1/V2 sync toggles,
// Zuper writeback toggle, etc.). Each flag is a single jsonb row
// keyed by a dotted string. Read-through cache is deliberately
// avoided — flags change rarely, and one extra SELECT per sync
// run is cheap.
// =============================================================

import { eq } from 'drizzle-orm';

import { db } from './db';
import { settingsKv } from '@/db/schema';

export const INTEGRATION_FLAGS = {
  hubspotV1: 'integrations.hubspot.sync_v1_installations',
  hubspotV2: 'integrations.hubspot.sync_v2_projects',
  zuperWriteback: 'integrations.zuper.writeback_enabled',
} as const;

export type IntegrationFlagKey = (typeof INTEGRATION_FLAGS)[keyof typeof INTEGRATION_FLAGS];

/**
 * Fetch a boolean flag from settings_kv. Returns `defaultValue` if the
 * key is unset OR cannot be parsed as a boolean. Never throws.
 */
export async function getBooleanFlag(
  key: string,
  defaultValue: boolean,
): Promise<boolean> {
  try {
    const rows = await db
      .select({ value: settingsKv.value })
      .from(settingsKv)
      .where(eq(settingsKv.key, key))
      .limit(1);
    const v = rows[0]?.value;
    if (typeof v === 'boolean') return v;
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function setBooleanFlag(key: string, value: boolean): Promise<void> {
  await db
    .insert(settingsKv)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settingsKv.key,
      set: { value, updatedAt: new Date() },
    });
}

/**
 * Load all known integration flags in a single round-trip. The shape is
 * stable for the API surface — adding a new flag bumps the response
 * shape, so callers should pin their expected keys.
 */
export async function getAllIntegrationFlags(): Promise<{
  hubspotV1: boolean;
  hubspotV2: boolean;
  zuperWriteback: boolean;
}> {
  const [v1, v2, zup] = await Promise.all([
    getBooleanFlag(INTEGRATION_FLAGS.hubspotV1, true),
    getBooleanFlag(INTEGRATION_FLAGS.hubspotV2, true),
    getBooleanFlag(INTEGRATION_FLAGS.zuperWriteback, false),
  ]);
  return { hubspotV1: v1, hubspotV2: v2, zuperWriteback: zup };
}
