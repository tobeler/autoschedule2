// =============================================================
// HubSpot deep-link helpers.
//
// Portal-id default is Jetson's portal (21424670). Override via
// NEXT_PUBLIC_HUBSPOT_PORTAL_ID at build time if needed.
// =============================================================

const DEFAULT_PORTAL_ID = '21424670';

function readEnv(name: string): string | undefined {
  // Vite path
  try {
    // @ts-expect-error import.meta is widened by Vite
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-expect-error keyed access on env
      const v = import.meta.env[name];
      if (typeof v === 'string' && v.length) return v;
    }
  } catch {
    // ignore
  }
  if (typeof process !== 'undefined' && process.env) {
    const v = process.env[name];
    if (typeof v === 'string' && v.length) return v;
  }
  return undefined;
}

export function hubspotPortalId(): string {
  return (
    readEnv('NEXT_PUBLIC_HUBSPOT_PORTAL_ID') ??
    readEnv('VITE_HUBSPOT_PORTAL_ID') ??
    DEFAULT_PORTAL_ID
  );
}

/** Native Project record (objectTypeId 0-970). */
export function hubspotProjectUrl(hubspotProjectId: string, portalId = hubspotPortalId()): string {
  return 'https://app.hubspot.com/contacts/' + portalId + '/record/0-970/' + hubspotProjectId;
}

/** Contact (objectTypeId 0-1). */
export function hubspotContactUrl(contactId: string, portalId = hubspotPortalId()): string {
  return 'https://app.hubspot.com/contacts/' + portalId + '/record/0-1/' + contactId;
}

/** Deal (objectTypeId 0-3). */
export function hubspotDealUrl(dealId: string, portalId = hubspotPortalId()): string {
  return 'https://app.hubspot.com/contacts/' + portalId + '/record/0-3/' + dealId;
}

/** Legacy Installation custom object (objectTypeId 2-31703261). */
export function hubspotInstallationUrl(
  installationId: string,
  portalId = hubspotPortalId(),
): string {
  return (
    'https://app.hubspot.com/contacts/' +
    portalId +
    '/record/2-31703261/' +
    installationId
  );
}

/** Zuper deep-link — works against the Jetson tenant. */
export function zuperJobUrl(jobUid: string): string {
  return 'https://us-east-1.zuperpro.com/jobs/details/' + jobUid;
}
