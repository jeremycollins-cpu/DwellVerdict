export * from "./client";
export * as schema from "./schema";

// Re-export row types + enum constants so callers can
// `import type { Property } from "@dwellverdict/db"` without reaching
// into the schema namespace.
export type {
  User,
  NewUser,
  Organization,
  NewOrganization,
  OrganizationMember,
  NewOrganizationMember,
  Property,
  NewProperty,
  PropertyStage,
  NewPropertyStage,
  PropertyType,
  PropertyStatus,
  PropertyLifecycleStage,
  OrganizationPlan,
  OrganizationMemberRole,
  Verdict,
  NewVerdict,
  VerdictSignal,
  VerdictStatus,
  UserReportUsage,
  NewUserReportUsage,
  DataSourceCacheRow,
  NewDataSourceCacheRow,
} from "./schema";

export {
  PROPERTY_TYPES,
  PROPERTY_STATUSES,
  PROPERTY_LIFECYCLE_STAGES,
  ORGANIZATION_PLANS,
  ORGANIZATION_MEMBER_ROLES,
  VERDICT_SIGNALS,
  VERDICT_STATUSES,
} from "./schema";
