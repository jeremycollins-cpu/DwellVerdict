import { Resend } from "resend";

/**
 * Resend client singleton.
 *
 * In production (NODE_ENV === 'production', which Vercel sets on both
 * production and preview deploys) the API key is required — bail loud
 * if it's missing so a missing-secret deploy doesn't silently swallow
 * mail sends.
 *
 * In dev / CI the key is optional. When unset, this exports `null` and
 * `sendEmail()` (in ./send.ts) degrades to a console-log no-op so
 * local development doesn't depend on Resend setup.
 */

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey && process.env.NODE_ENV === "production") {
  throw new Error("RESEND_API_KEY is required in production");
}

export const resend = apiKey ? new Resend(apiKey) : null;

export const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "notifications@dwellverdict.com";
export const REPLY_TO_EMAIL =
  process.env.RESEND_REPLY_TO_EMAIL ?? "hello@dwellverdict.com";
