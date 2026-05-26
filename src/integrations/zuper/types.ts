// =============================================================
// Zuper API response shapes — partial, only fields we consume.
// Matches the Zuper /jobs and /team endpoints' JSON.
// =============================================================

export interface ZuperCustomField {
  label: string;
  value: string;
}

/**
 * Zuper job's status field is a HISTORY array — the current status is the
 * last entry. status_type values from production: NEW, SCHEDULED, DISPATCHED,
 * ON_MY_WAY, STARTED, ON_HOLD, FOLLOW_UP, FOLLOW_UP_SAME_JOB, COMPLETED,
 * CLOSED, CANCELED, CANNOT_COMPLETE, FAILED.
 */
export type ZuperStatusType =
  | 'NEW'
  | 'SCHEDULED'
  | 'DISPATCHED'
  | 'ON_MY_WAY'
  | 'STARTED'
  | 'ON_HOLD'
  | 'FOLLOW_UP'
  | 'FOLLOW_UP_SAME_JOB'
  | 'COMPLETED'
  | 'CLOSED'
  | 'CANCELED'
  | 'CANCELLED'
  | 'CANNOT_COMPLETE'
  | 'FAILED'
  | string;

export interface ZuperJobStatus {
  status_type: string;
  status_name: string;
}

export interface ZuperUser {
  user_uid: string;
  first_name: string;
  last_name: string;
  designation?: string;
  email?: string | null;
  emp_code?: string | null;
  mobile_phone_number?: string | null;
  work_phone_number?: string | null;
  profile_picture?: string | null;
  is_active?: boolean;
  is_deleted?: boolean;
}

export interface ZuperTeamRef {
  team: {
    team_uid?: string;
    team_name: string;
  };
}

export interface ZuperCustomer {
  customer_first_name?: string;
  customer_last_name?: string;
  customer_uid?: string;
  customer_email?: string | null;
  customer_contact_no?: Record<string, string | null> | null;
  /**
   * Present on the single-job endpoint (`GET /api/jobs/{uid}`) but absent
   * from the bulk listing — the same shape as `ZuperPropertyAddress`.
   */
  customer_address?: ZuperPropertyAddress | null;
}

export interface ZuperPropertyAddress {
  street?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  country?: string;
  geo_cordinates?: [number, number];
}

export interface ZuperProperty {
  property_address?: ZuperPropertyAddress;
}

export interface ZuperJob {
  job_uid: string;
  job_title?: string;
  job_category: { category_name: string } | null;
  job_status: ZuperJobStatus[];
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  assigned_to: { user: ZuperUser }[];
  assigned_to_team: ZuperTeamRef[];
  customer: ZuperCustomer | null;
  property: ZuperProperty | null;
  custom_fields: ZuperCustomField[];
  work_order_number?: number;
  prefix?: string;
  created_at?: string;
}

export interface ZuperTeam {
  team_uid: string;
  team_name: string;
  team_description?: string;
  team_members?: { user: ZuperUser }[];
}

export interface ZuperAccountDetails {
  company_name?: string;
  account_status?: string;
  // Other fields TBD — the /account endpoint shape is loose.
}

export interface ZuperListResponse<T> {
  type: string;
  data: T[];
  total_records?: number;
}
