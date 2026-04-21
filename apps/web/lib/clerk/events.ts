import { z } from "zod";

/**
 * Zod schemas for the Clerk webhook events we consume.
 *
 * Clerk's payloads are rich; we only validate what we actually use. Zod's
 * `.passthrough()` keeps extra fields intact so we don't break on schema
 * additions from Clerk.
 */

const emailAddress = z
  .object({
    id: z.string(),
    email_address: z.string(),
  })
  .passthrough();

const userData = z
  .object({
    id: z.string(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    primary_email_address_id: z.string().nullable().optional(),
    email_addresses: z.array(emailAddress).default([]),
  })
  .passthrough();

export const userCreatedEvent = z
  .object({
    type: z.literal("user.created"),
    data: userData,
  })
  .passthrough();

export const userUpdatedEvent = z
  .object({
    type: z.literal("user.updated"),
    data: userData,
  })
  .passthrough();

export const userDeletedEvent = z
  .object({
    type: z.literal("user.deleted"),
    data: z
      .object({
        id: z.string(),
        deleted: z.boolean().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const clerkEvent = z.discriminatedUnion("type", [
  userCreatedEvent,
  userUpdatedEvent,
  userDeletedEvent,
]);

export type ClerkEvent = z.infer<typeof clerkEvent>;
export type UserCreatedEvent = z.infer<typeof userCreatedEvent>;
export type UserUpdatedEvent = z.infer<typeof userUpdatedEvent>;
export type UserDeletedEvent = z.infer<typeof userDeletedEvent>;
export type UserEventData = z.infer<typeof userData>;

/**
 * Extract the primary email from a Clerk user payload.
 *
 * Clerk sends a list of email addresses with a separate primary id; we
 * resolve it here so downstream code takes a single string.
 */
export function resolvePrimaryEmail(data: UserEventData): string | null {
  const { email_addresses, primary_email_address_id } = data;
  if (!email_addresses.length) return null;
  if (primary_email_address_id) {
    const primary = email_addresses.find((e) => e.id === primary_email_address_id);
    if (primary) return primary.email_address;
  }
  return email_addresses[0]?.email_address ?? null;
}

/**
 * Compose the users.name value from first/last. Returns null if both are
 * missing so the column stays NULLable for partial Clerk profiles.
 */
export function composeDisplayName(data: UserEventData): string | null {
  const first = data.first_name?.trim();
  const last = data.last_name?.trim();
  const full = [first, last].filter(Boolean).join(" ");
  return full.length > 0 ? full : null;
}

/**
 * Personal-org display name. Matches schema verbiage ("organization"), falls
 * back to email-local-part when the user has no first name yet.
 */
export function composePersonalOrgName(data: UserEventData): string {
  const first = data.first_name?.trim();
  if (first) return `${first}'s organization`;
  const email = resolvePrimaryEmail(data);
  const local = email?.split("@")[0];
  if (local) return `${local}'s organization`;
  return "Personal organization";
}
