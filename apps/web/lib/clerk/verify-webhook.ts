import { Webhook, WebhookVerificationError } from "svix";

import { clerkEvent, type ClerkEvent } from "./events";

export type VerifyResult =
  | { ok: true; event: ClerkEvent }
  | { ok: false; reason: "missing_headers" | "missing_secret" | "bad_signature" | "bad_payload"; detail?: string };

/**
 * Verify a Clerk webhook request using svix.
 *
 * Reads the three svix-* headers and the raw request body, verifies the
 * signature, then parses the payload through our Zod discriminated union.
 * The body MUST be the exact bytes Clerk sent — don't pass a re-stringified
 * JSON object or signature verification will fail.
 *
 * Returns a discriminated union so the caller can map each failure mode to
 * the right HTTP status (400 vs 401 vs 422 vs 500).
 */
export function verifyClerkWebhook(
  rawBody: string,
  headers: Headers,
  signingSecret: string | undefined,
): VerifyResult {
  if (!signingSecret) {
    return { ok: false, reason: "missing_secret" };
  }

  const svixId = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { ok: false, reason: "missing_headers" };
  }

  const wh = new Webhook(signingSecret);

  let verified: unknown;
  try {
    verified = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    });
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return { ok: false, reason: "bad_signature", detail: err.message };
    }
    throw err;
  }

  const parsed = clerkEvent.safeParse(verified);
  if (!parsed.success) {
    return { ok: false, reason: "bad_payload", detail: parsed.error.message };
  }

  return { ok: true, event: parsed.data };
}
