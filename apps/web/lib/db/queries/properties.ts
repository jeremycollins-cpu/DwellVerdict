import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type { Property } from "@dwellverdict/db";

import { getDb } from "@/lib/db";
import { type ParsedAddress, normalizeAddress } from "@/lib/address";
import type {
  IntakeStepNumber,
  PropertyIntakeSubmitPayload,
} from "@/lib/onboarding/schema";

const { properties, verdicts } = schema;

/**
 * Insert a property from a parsed Google address, or return the
 * existing row if the org already has this address.
 *
 * Dedupe precedence:
 *   1. Exact Google Place ID match inside the same org (most reliable)
 *   2. Normalized-address match (covers manual rows and re-pastes
 *      without a Place ID)
 *
 * Returning the existing row instead of erroring is deliberate: a user
 * who pastes the same address twice should be taken to the existing
 * property, not shown a scary unique-constraint failure.
 */
export async function upsertPropertyFromAddress(params: {
  orgId: string;
  createdByUserId: string;
  address: ParsedAddress;
}): Promise<{ property: Property; wasNew: boolean }> {
  const db = getDb();
  const { orgId, createdByUserId, address } = params;
  const normalized = normalizeAddress(address);

  // Short-circuit on place id.
  const [byPlaceId] = await db
    .select()
    .from(properties)
    .where(
      and(
        eq(properties.orgId, orgId),
        eq(properties.googlePlaceId, address.googlePlaceId),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  if (byPlaceId) return { property: byPlaceId, wasNew: false };

  const [byNormalized] = await db
    .select()
    .from(properties)
    .where(
      and(
        eq(properties.orgId, orgId),
        eq(properties.normalizedAddress, normalized),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  if (byNormalized) return { property: byNormalized, wasNew: false };

  const [inserted] = await db
    .insert(properties)
    .values({
      orgId,
      createdByUserId,
      addressLine1: address.street,
      city: address.city,
      state: address.state,
      zip: address.zip,
      county: address.county,
      normalizedAddress: normalized,
      googlePlaceId: address.googlePlaceId,
      addressFull: address.addressFull,
      // Drizzle's numeric columns accept strings; pass them as-is to
      // preserve precision rather than via Number().
      lat: address.lat.toString(),
      lng: address.lng.toString(),
    })
    .returning();

  if (!inserted) throw new Error("property insert failed");
  return { property: inserted, wasNew: true };
}

/**
 * Get a single property by id, scoped to org. Returns null when not
 * found or belongs to a different org — callers should treat null as
 * "404 or unauthorized", no distinction.
 */
export async function getPropertyForOrg(params: {
  propertyId: string;
  orgId: string;
}): Promise<Property | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(properties)
    .where(
      and(
        eq(properties.id, params.propertyId),
        eq(properties.orgId, params.orgId),
        isNull(properties.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * List an org's properties, newest first, with the latest verdict's
 * signal for each. Drives the /app/properties list view. Uses a
 * correlated subquery for latest_signal to avoid a GROUP BY +
 * ORDER-BY-in-subquery dance in Drizzle.
 */
export async function listPropertiesForOrg(params: {
  orgId: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    addressLine1: string;
    city: string;
    state: string;
    zip: string;
    addressFull: string | null;
    latestVerdictSignal: "buy" | "watch" | "pass" | null;
    latestVerdictId: string | null;
    createdAt: Date;
  }>
> {
  const db = getDb();
  const limit = params.limit ?? 50;

  const latestVerdict = db
    .select({
      propertyId: verdicts.propertyId,
      signal: verdicts.signal,
      id: verdicts.id,
      createdAt: verdicts.createdAt,
      rn: sql<number>`row_number() over (partition by ${verdicts.propertyId} order by ${verdicts.createdAt} desc)`.as(
        "rn",
      ),
    })
    .from(verdicts)
    .where(eq(verdicts.status, "ready"))
    .as("lv");

  const rows = await db
    .select({
      id: properties.id,
      addressLine1: properties.addressLine1,
      city: properties.city,
      state: properties.state,
      zip: properties.zip,
      addressFull: properties.addressFull,
      latestVerdictSignal: latestVerdict.signal,
      latestVerdictId: latestVerdict.id,
      createdAt: properties.createdAt,
    })
    .from(properties)
    .leftJoin(
      latestVerdict,
      and(eq(latestVerdict.propertyId, properties.id), eq(latestVerdict.rn, 1)),
    )
    .where(and(eq(properties.orgId, params.orgId), isNull(properties.deletedAt)))
    .orderBy(desc(properties.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    latestVerdictSignal: (r.latestVerdictSignal as "buy" | "watch" | "pass" | null) ?? null,
  }));
}

/**
 * Persist a single step's worth of intake fields. Uses Drizzle's
 * dynamic update so callers pass only the fields they own — null /
 * undefined fields don't clobber existing values. Bumps
 * `intake_step_completed` to the highest step the user has touched
 * (so navigating back doesn't downgrade progress) and stamps
 * `intake_last_saved_at` for the "saved 3m ago" UI.
 *
 * Scoped by org_id; returns null if the property doesn't belong to
 * the caller's org. Does NOT stamp `intake_completed_at` — that
 * happens only via `markIntakeComplete` after Step 7 submit.
 */
export async function savePartialIntake(params: {
  propertyId: string;
  orgId: string;
  step: IntakeStepNumber;
  fields: Partial<PropertyIntakeSubmitPayload>;
}): Promise<Property | null> {
  const db = getDb();
  const { propertyId, orgId, step, fields } = params;

  const existing = await getPropertyForOrg({ propertyId, orgId });
  if (!existing) return null;

  // Only bump step number forward; navigating back to step 2 from
  // step 5 keeps `intake_step_completed=5` so we resume in the
  // right place.
  const nextStep = Math.max(existing.intakeStepCompleted ?? 0, step);

  const [row] = await db
    .update(properties)
    .set({
      ...intakeFieldsForUpdate(fields),
      intakeStepCompleted: nextStep,
      intakeLastSavedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.orgId, orgId),
        isNull(properties.deletedAt),
      ),
    )
    .returning();

  return row ?? null;
}

/**
 * Final intake submit — writes the full validated payload + stamps
 * `intake_completed_at = now()` so downstream gates (regenerate
 * button, banner suppression, M3.6 thesis-aware verdict) treat the
 * property as fully onboarded.
 */
export async function markIntakeComplete(params: {
  propertyId: string;
  orgId: string;
  payload: PropertyIntakeSubmitPayload;
}): Promise<Property | null> {
  const db = getDb();
  const { propertyId, orgId, payload } = params;

  const now = new Date();
  const [row] = await db
    .update(properties)
    .set({
      ...intakeFieldsForUpdate(payload),
      intakeStepCompleted: 7,
      intakeCompletedAt: now,
      intakeLastSavedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(properties.id, propertyId),
        eq(properties.orgId, orgId),
        isNull(properties.deletedAt),
      ),
    )
    .returning();
  return row ?? null;
}

/**
 * Translate the wizard's number-typed payload into Drizzle's
 * insert/update shape. The numeric(p,s) columns (bathrooms,
 * occupancy/vacancy/appreciation rates, mortgage rate, down
 * payment) are typed as strings on the binding side to preserve
 * precision, so we stringify here. Integer columns pass through.
 *
 * Drops `undefined` keys so the partial-save semantics stay
 * unambiguous: only fields present in the payload get written.
 * Explicit `null` does pass through, letting the wizard clear a
 * previously-entered field.
 */
type IntakeUpdate = Partial<typeof properties.$inferInsert>;

function intakeFieldsForUpdate(
  payload: Partial<PropertyIntakeSubmitPayload>,
): IntakeUpdate {
  const NUMERIC_KEYS = new Set<keyof PropertyIntakeSubmitPayload>([
    "bathrooms",
    "strExpectedOccupancy",
    "ltrVacancyRate",
    "ltrExpectedAppreciationRate",
    "downPaymentPercent",
    "mortgageRate",
  ]);

  const out: Record<string, unknown> = {};
  for (const k of Object.keys(payload) as Array<keyof PropertyIntakeSubmitPayload>) {
    const v = payload[k];
    if (v === undefined) continue;
    if (NUMERIC_KEYS.has(k) && typeof v === "number") {
      out[k] = v.toString();
    } else {
      out[k] = v;
    }
  }
  return out as IntakeUpdate;
}

/**
 * "Has the user finished the intake wizard for this property?"
 * — the canonical gate used by the regenerate button, the banner,
 * and (post-M3.6) thesis-aware verdict generation.
 */
export function isIntakeComplete(property: Pick<Property, "intakeCompletedAt">): boolean {
  return property.intakeCompletedAt !== null;
}

/**
 * Three-state intake banner classification used by the property
 * detail page:
 *   - `none`: intake done, no banner
 *   - `soft`: thesis backfilled (e.g. one of the 3 known properties)
 *     but other fields blank — show "Add property details" prompt
 *   - `hard`: nothing set — show "Complete property intake" gate
 */
export type IntakeBannerState = "none" | "soft" | "hard";

export function classifyIntakeBanner(
  property: Pick<Property, "intakeCompletedAt" | "thesisType">,
): IntakeBannerState {
  if (property.intakeCompletedAt) return "none";
  if (property.thesisType) return "soft";
  return "hard";
}
