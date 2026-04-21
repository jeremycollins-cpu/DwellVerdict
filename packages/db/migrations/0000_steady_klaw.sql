CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"name" text NOT NULL,
	"stripe_customer_id" text,
	"plan" text DEFAULT 'starter' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organizations_plan_check" CHECK ("organizations"."plan" IN ('starter', 'pro', 'portfolio'))
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"address_line1" text NOT NULL,
	"address_line2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"county" text,
	"normalized_address" text NOT NULL,
	"lat" numeric(10, 7),
	"lng" numeric(10, 7),
	"parcel_id" text,
	"property_type" text,
	"bedrooms" integer,
	"bathrooms" numeric(3, 1),
	"sqft" integer,
	"lot_sqft" integer,
	"year_built" integer,
	"status" text DEFAULT 'prospect' NOT NULL,
	"current_stage" text DEFAULT 'finding' NOT NULL,
	"purchase_price" numeric(12, 2),
	"close_date" date,
	"source_url" text,
	"listing_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "properties_status_check" CHECK ("properties"."status" IN (
        'prospect',
        'shortlisted',
        'underwriting',
        'under_contract',
        'closing',
        'owned_pre_launch',
        'owned_operating',
        'sold'
      )),
	CONSTRAINT "properties_current_stage_check" CHECK ("properties"."current_stage" IN (
        'finding',
        'evaluating',
        'buying',
        'renovating',
        'managing'
      ))
);
--> statement-breakpoint
CREATE TABLE "property_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"from_stage" text,
	"to_stage" text NOT NULL,
	"changed_by_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_stages" ADD CONSTRAINT "property_stages_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_stages" ADD CONSTRAINT "property_stages_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_id_unique" ON "users" USING btree ("clerk_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "organization_members_user_id_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_clerk_org_id_unique" ON "organizations" USING btree ("clerk_org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_stripe_customer_id_unique" ON "organizations" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "organizations_plan_idx" ON "organizations" USING btree ("plan");--> statement-breakpoint
CREATE INDEX "properties_org_id_idx" ON "properties" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "properties_created_by_user_idx" ON "properties" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_org_normalized_address_unique" ON "properties" USING btree ("org_id","normalized_address");--> statement-breakpoint
CREATE INDEX "properties_lat_lng_idx" ON "properties" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "properties_city_state_idx" ON "properties" USING btree ("city","state");--> statement-breakpoint
CREATE INDEX "properties_parcel_id_idx" ON "properties" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "properties_property_type_idx" ON "properties" USING btree ("property_type");--> statement-breakpoint
CREATE INDEX "properties_status_idx" ON "properties" USING btree ("status");--> statement-breakpoint
CREATE INDEX "properties_current_stage_idx" ON "properties" USING btree ("current_stage");--> statement-breakpoint
CREATE INDEX "property_stages_property_history_idx" ON "property_stages" USING btree ("property_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "property_stages_changed_by_user_idx" ON "property_stages" USING btree ("changed_by_user_id");