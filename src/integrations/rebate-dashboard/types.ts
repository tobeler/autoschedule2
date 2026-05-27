// =============================================================
// rebate-dashboard — shared types for the /api/v1/to-schedule
// integration. The sibling rebate-dashboard app owns the
// canonical "what needs to be scheduled" predicate; we consume it
// here and map its rows onto our local Job shape.
// =============================================================

export type ToScheduleRowType = 'installation' | 'zuper';

export interface ToScheduleItem {
  /** HubSpot installation id (or synthetic id for Zuper-orphan rows). */
  id: string;
  hsInstallationId?: string;
  rowType: ToScheduleRowType;
  name: string;
  stageId: string;
  stageLabel: string;
  /** 'installation' | 'walkthrough' | 'service' | etc. */
  jobType: string;
  address: string;
  ownerName: string;
  dealId?: string;
  productSku?: string;
  teams: string[];
  daysInStage?: number;
  scheduledDate: string | null;
  zuperJobStatus: string | null;
  hasZuperMatch: boolean;
  /** Primary linkage field into our Job table. */
  zuperJobUid?: string;
  zuperJobUrl?: string;
  hubspotUrl?: string;
  /** 2-letter service area, e.g. 'CO' / 'MA'. */
  serviceArea: string;
  pendingReasons: string[];
  permitSummary: string | null;
  permitReady: boolean | null;
}

export interface ToScheduleResponse {
  fetchedAt: string;
  region: string;
  count: number;
  items: ToScheduleItem[];
}
