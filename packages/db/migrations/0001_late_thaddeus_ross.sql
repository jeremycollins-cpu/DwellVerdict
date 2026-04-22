CREATE TABLE "verdicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"signal" text,
	"confidence" integer,
	"summary" text,
	"narrative" text,
	"data_points" jsonb,
	"sources" jsonb,
	"task_type" text DEFAULT 'verdict_generation' NOT NULL,
	"model_version" text,
	"prompt_version" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_cents" integer,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "verdicts_signal_check" CHECK ("verdicts"."signal" IS NULL OR "verdicts"."signal" IN ('buy', 'watch', 'pass')),
	CONSTRAINT "verdicts_status_check" CHECK ("verdicts"."status" IN ('pending', 'ready', 'failed')),
	CONSTRAINT "verdicts_confidence_check" CHECK ("verdicts"."confidence" IS NULL OR ("verdicts"."confidence" >= 0 AND "verdicts"."confidence" <= 100))
);
--> statement-breakpoint
CREATE TABLE "user_verdict_limits" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"verdicts_this_month" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_verdict_limits_count_non_negative" CHECK ("user_verdict_limits"."verdicts_this_month" >= 0)
);
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "google_place_id" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "address_full" text;--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verdicts" ADD CONSTRAINT "verdicts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_verdict_limits" ADD CONSTRAINT "user_verdict_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "verdicts_property_recency_idx" ON "verdicts" USING btree ("property_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "verdicts_org_recency_idx" ON "verdicts" USING btree ("org_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "verdicts_status_idx" ON "verdicts" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_org_google_place_id_unique" ON "properties" USING btree ("org_id","google_place_id") WHERE "properties"."google_place_id" IS NOT NULL;