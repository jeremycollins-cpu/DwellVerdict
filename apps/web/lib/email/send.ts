import type { ReactElement } from "react";
import { render } from "@react-email/render";
import * as Sentry from "@sentry/nextjs";

import { resend, FROM_EMAIL, REPLY_TO_EMAIL } from "./client";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  template: ReactElement;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send a transactional email through Resend.
 *
 * Always returns a `{ success, messageId, error }` object — callers
 * handle failure without try/catch boilerplate. Failures route to
 * Sentry with the `operation: send_email` tag (matches the M0.3
 * tagging pattern).
 *
 * Both HTML and plain-text bodies are rendered for deliverability —
 * inboxes that can't render HTML still see a readable email.
 *
 * In dev without an API key set, this logs to console and returns
 * success — keeps local development unblocked when Resend isn't
 * configured locally.
 */
export async function sendEmail({
  to,
  subject,
  template,
  replyTo = REPLY_TO_EMAIL,
  tags,
}: SendEmailParams): Promise<SendEmailResult> {
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      Sentry.captureMessage(
        "sendEmail called but Resend client is null in production",
        "error",
      );
      return { success: false, error: "Email client not initialized" };
    }
    console.log("[sendEmail] Dev mode, no Resend key set. Would send:", {
      to,
      subject,
    });
    return { success: true, messageId: "dev-mode-noop" };
  }

  try {
    const html = await render(template);
    const text = await render(template, { plainText: true });

    const result = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text,
      replyTo,
      tags,
    });

    if (result.error) {
      Sentry.captureException(
        new Error(`Resend send failed: ${result.error.message}`),
        {
          tags: { operation: "send_email" },
          extra: { to, subject, errorName: result.error.name },
        },
      );
      return { success: false, error: result.error.message };
    }

    return { success: true, messageId: result.data?.id };
  } catch (error) {
    Sentry.captureException(error, {
      tags: { operation: "send_email" },
      extra: { to, subject },
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
