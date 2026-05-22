CREATE TYPE "public"."checklist_item_type" AS ENUM('checkbox', 'photo', 'single', 'multi', 'number', 'text', 'longtext', 'signature', 'rating');--> statement-breakpoint
CREATE TYPE "public"."hubspot_direction" AS ENUM('push', 'pull', 'both');--> statement-breakpoint
CREATE TYPE "public"."hubspot_entity" AS ENUM('contact', 'deal', 'project', 'job', 'service_area', 'installation');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('unscheduled', 'scheduled', 'enroute', 'onsite', 'complete', 'callback');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('L1', 'L2', 'L3');--> statement-breakpoint
CREATE TYPE "public"."profile_role" AS ENUM('dispatcher', 'manager', 'tech', 'admin', 'fsm');--> statement-breakpoint
CREATE TYPE "public"."project_source" AS ENUM('native_project', 'legacy_installation');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('proposed', 'sold', 'in_progress', 'complete', 'warranty', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."role_key" AS ENUM('hvac_lead', 'hvac_installer', 'apprentice', 'electrician', 'plumber', 'fsm');--> statement-breakpoint
CREATE TYPE "public"."time_off_type" AS ENUM('sick', 'vacation', 'training', 'pto');--> statement-breakpoint
CREATE TYPE "public"."truck_status" AS ENUM('available', 'shop', 'assigned');--> statement-breakpoint
CREATE TYPE "public"."vehicle_mode" AS ENUM('fleet', 'personal', 'none');--> statement-breakpoint
CREATE TABLE "accounts" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hashedKey" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"createdByUserId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	CONSTRAINT "api_keys_hashedKey_unique" UNIQUE("hashedKey")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actorUserId" text,
	"action" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"sectionId" text NOT NULL,
	"type" "checklist_item_type" NOT NULL,
	"label" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"optionsJson" jsonb,
	"minPhotos" integer,
	"minNumber" numeric(14, 4),
	"maxNumber" numeric(14, 4),
	"unit" text,
	"placeholder" text,
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"jobId" text NOT NULL,
	"itemId" text NOT NULL,
	"valueJson" jsonb,
	"answeredAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"checklistId" text NOT NULL,
	"title" text NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklists" (
	"id" text PRIMARY KEY NOT NULL,
	"jobType" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_members" (
	"crewId" text NOT NULL,
	"personId" text NOT NULL,
	CONSTRAINT "crew_members_crewId_personId_pk" PRIMARY KEY("crewId","personId")
);
--> statement-breakpoint
CREATE TABLE "crews" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"leadPersonId" text,
	"truckId" text,
	"color" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text NOT NULL,
	"hubspotId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hubspot_mappings" (
	"id" text PRIMARY KEY NOT NULL,
	"entity" "hubspot_entity" NOT NULL,
	"appField" text NOT NULL,
	"hsField" text NOT NULL,
	"direction" "hubspot_direction" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_extra_crews" (
	"jobId" text NOT NULL,
	"crewId" text NOT NULL,
	CONSTRAINT "job_extra_crews_jobId_crewId_pk" PRIMARY KEY("jobId","crewId")
);
--> statement-breakpoint
CREATE TABLE "job_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"jobId" text NOT NULL,
	"role" "role_key" NOT NULL,
	"level" "level" NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"startOffsetHours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	"assignedTo" text,
	"suggested" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"truckCount" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" "job_status" DEFAULT 'unscheduled' NOT NULL,
	"customerId" text,
	"projectId" text,
	"date" text,
	"startHour" numeric(6, 2),
	"durationHrs" numeric(6, 2) DEFAULT '0' NOT NULL,
	"crewId" text,
	"truckId" text,
	"notes" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"hubspotDealId" text,
	"hubspotJobObjectId" text,
	"driveTimeMin" integer DEFAULT 0 NOT NULL,
	"price" numeric(14, 2),
	"multidayGroupId" text,
	"multidayIndex" integer,
	"multidayTotal" integer,
	"continuationOf" text,
	"vehicleMode" "vehicle_mode",
	"personalDriverId" text,
	"endDate" text,
	"endHour" numeric(6, 2),
	"daysSpanned" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"payloadJson" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"deliveredAt" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"initials" text NOT NULL,
	"level" "level" NOT NULL,
	"defaultCrewId" text,
	"certs" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_roles" (
	"personId" text NOT NULL,
	"role" "role_key" NOT NULL,
	CONSTRAINT "person_roles_personId_role_pk" PRIMARY KEY("personId","role")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"userId" text PRIMARY KEY NOT NULL,
	"role" "profile_role" DEFAULT 'dispatcher' NOT NULL,
	"displayName" text,
	"defaultCrewId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"customerId" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" "project_status" NOT NULL,
	"soldDate" text,
	"targetCompletion" text,
	"value" numeric(14, 2),
	"hubspotDealId" text,
	"hubspotProjectId" text,
	"primaryCrewId" text,
	"description" text,
	"designNotes" text,
	"source" "project_source" DEFAULT 'native_project' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short" text NOT NULL,
	"parentRegionId" text,
	"headcount" integer DEFAULT 0 NOT NULL,
	"crewCount" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings_kv" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"templateId" text NOT NULL,
	"role" "role_key" NOT NULL,
	"level" "level" NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"startOffsetHours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" text PRIMARY KEY NOT NULL,
	"personId" text NOT NULL,
	"date" text NOT NULL,
	"type" time_off_type NOT NULL,
	"label" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trucks" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plate" text NOT NULL,
	"kind" text NOT NULL,
	"capacity" text NOT NULL,
	"assignedCrewId" text,
	"vin" text NOT NULL,
	"status" "truck_status",
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp with time zone,
	"image" text,
	"hashedPassword" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationTokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verificationTokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_createdByUserId_users_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actorUserId_users_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_sectionId_checklist_sections_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."checklist_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_responses" ADD CONSTRAINT "checklist_responses_jobId_jobs_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_sections" ADD CONSTRAINT "checklist_sections_checklistId_checklists_id_fk" FOREIGN KEY ("checklistId") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crewId_crews_id_fk" FOREIGN KEY ("crewId") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_personId_people_id_fk" FOREIGN KEY ("personId") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_leadPersonId_people_id_fk" FOREIGN KEY ("leadPersonId") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crews" ADD CONSTRAINT "crews_truckId_trucks_id_fk" FOREIGN KEY ("truckId") REFERENCES "public"."trucks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_extra_crews" ADD CONSTRAINT "job_extra_crews_jobId_jobs_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_extra_crews" ADD CONSTRAINT "job_extra_crews_crewId_crews_id_fk" FOREIGN KEY ("crewId") REFERENCES "public"."crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_slots" ADD CONSTRAINT "job_slots_jobId_jobs_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_slots" ADD CONSTRAINT "job_slots_assignedTo_people_id_fk" FOREIGN KEY ("assignedTo") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_projectId_projects_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_crewId_crews_id_fk" FOREIGN KEY ("crewId") REFERENCES "public"."crews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_truckId_trucks_id_fk" FOREIGN KEY ("truckId") REFERENCES "public"."trucks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_personalDriverId_people_id_fk" FOREIGN KEY ("personalDriverId") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_roles" ADD CONSTRAINT "person_roles_personId_people_id_fk" FOREIGN KEY ("personId") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_customerId_customers_id_fk" FOREIGN KEY ("customerId") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_primaryCrewId_crews_id_fk" FOREIGN KEY ("primaryCrewId") REFERENCES "public"."crews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_slots" ADD CONSTRAINT "template_slots_templateId_job_templates_id_fk" FOREIGN KEY ("templateId") REFERENCES "public"."job_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_personId_people_id_fk" FOREIGN KEY ("personId") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;