import type { OrganizationPlan } from "@dwellverdict/db";

/**
 * Render the formatted plan string shown in the sidebar footer.
 * The DB stores `starter` for the $20/mo tier, but the marketing
 * name is "DwellVerdict" — that asymmetry is intentional and lives
 * in this single mapping rather than being scattered across the UI.
 */
export function getPlanString(plan: OrganizationPlan | null | undefined): string {
  switch (plan) {
    case "pro":
      return "Pro · $40/mo";
    case "starter":
      return "DwellVerdict · $20/mo";
    case "canceled":
      return "Free (canceled)";
    case "free":
    default:
      return "Free";
  }
}
