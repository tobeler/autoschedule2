import { EmptyState } from '../../components/EmptyState';

/** STUB — Phase 6 agent fills in the Needs-Attention workbench. */
export function AttentionView() {
  return (
    <div className="view-stub">
      <EmptyState
        title="Needs attention — building Phase 6"
        body="Severity tabs + category groups + inline resolution actions, items derived from unfilled slots, callbacks, PTO conflicts, spillover."
      />
    </div>
  );
}

/**
 * Helper agents may use: derive attention items from current store state.
 * Returns an empty list in the stub.
 */
export function buildAttentionItems(): AttentionItem[] {
  return [];
}

export interface AttentionItem {
  id: string;
  sev: 'urgent' | 'today' | 'fyi';
  category: 'coverage' | 'schedule' | 'field' | 'heads-up';
  title: string;
  body?: string;
  jobId?: string;
  resolutions?: { label: string; primary?: boolean; action: () => void }[];
}
