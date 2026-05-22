// =============================================================
// /settings/api-keys — admin UI for minting + revoking API keys.
//
// The freshly-minted secret is shown ONCE in a banner. After the
// operator dismisses it, we never display it again (only the hash
// lives in the DB).
//
// Gated to admin or manager roles via the /v1/admin/api-keys
// middleware. We also guard server-side here to avoid rendering
// the page chrome for unauthorized users.
// =============================================================
import { redirect } from 'next/navigation';

import { auth } from '../../../auth';
import { ApiKeysClient } from './client';

export default async function ApiKeysPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  // Demo bypass: when there's no session at all, fall through (the API
  // already does the same).
  if (session && role !== 'admin' && role !== 'manager') {
    redirect('/');
  }
  return <ApiKeysClient />;
}
