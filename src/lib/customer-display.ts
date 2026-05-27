// =============================================================
// Customer-display helpers — pure utilities for rendering job
// titles and customer names in the dispatch UI.
//
// Background: ~75% of Zuper-sourced jobs link to a "Legacy install
// <id>" stand-in customer that was created during the HubSpot
// installation sync. Treating those names as real customer names
// makes every dispatch tile read identically ("Legacy install
// 65902954.4 — HP Install"), masking the actual job title that
// Zuper carries.
//
// `realCustomerName` returns the customer name only when it looks
// like a real person/business. `jobDisplayName` is the shared
// renderer used across JobBlock, UnscheduledRail, KanbanBoard.
// =============================================================

import type { Customer, Job, JobTypeDef, Project } from '../types';

/**
 * Return the customer name when it looks real, otherwise null.
 *
 * "Legacy install <numeric-id>" entries originate from HubSpot's
 * installation custom-object sync (`hs-legacy-cust-<inst-id>`) and
 * are placeholders, not real customer names. Treat them as null so
 * downstream renderers fall back to the Zuper job title.
 *
 * Also handles future "Zuper customer <uid-prefix>" placeholders
 * created by `ensureCustomerForZuper` when Zuper hasn't sent a
 * first/last name yet.
 */
export function realCustomerName(customer: Customer | undefined | null): string | null {
  const name = customer?.name?.trim();
  if (!name) return null;
  if (/^Legacy install\b/i.test(name)) return null;
  if (/^Zuper customer\b/i.test(name)) return null;
  if (/^Unknown customer$/i.test(name)) return null;
  return name;
}

/**
 * "{Customer} — {Type}" when both are known. Falls back to parsing the
 * Zuper job title (these almost always begin with "{First Last} - …"),
 * then to type, then to the verbatim title, then to address head, then
 * to "Untitled".
 *
 * Centralized so JobBlock / UnscheduledRail / KanbanBoard all agree on
 * what a job tile looks like.
 */
export function jobDisplayName(
  job: Pick<Job, 'title' | 'address'>,
  customer: Customer | undefined | null,
  jobType: JobTypeDef | undefined,
  opts: { prefer?: 'short' | 'label' } = {},
): string {
  const typeLabel =
    opts.prefer === 'short' ? jobType?.short || jobType?.label : jobType?.label || jobType?.short;
  const real = realCustomerName(customer);
  const fromTitle = job.title ? job.title.split(/\s[-|]\s/)[0].trim() : null;
  const name = real ?? fromTitle;
  if (name && typeLabel) return `${name} — ${typeLabel}`;
  if (name) return name;
  if (typeLabel) return typeLabel;
  if (job.title) return job.title;
  if (job.address) return job.address.split('·')[0].trim();
  return 'Untitled';
}

/**
 * Project display name. Most synced projects carry placeholder names like
 * "Legacy install 53101081227" or are tied to synthetic IDs. Resolve to
 * "Customer Name — Type" when possible.
 */
export function projectDisplayName(
  project: Pick<Project, 'name' | 'type'>,
  customer: Customer | undefined | null,
): string {
  const raw = project.name?.trim() ?? '';
  const placeholder =
    !raw ||
    /^Legacy install\b/i.test(raw) ||
    /^hs-[ipd]-/i.test(raw) ||
    /^Unknown project$/i.test(raw);
  const real = realCustomerName(customer);
  const type = project.type?.trim() || 'Install';
  if (!placeholder) return raw;
  return real ? `${real} — ${type}` : type;
}
