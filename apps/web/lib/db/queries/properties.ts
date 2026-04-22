import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { schema } from "@dwellverdict/db";
import type { Property } from "@dwellverdict/db";

import { getDb } from "@/lib/db";
import { type ParsedAddress, normalizeAddress } from "@/lib/address";

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
