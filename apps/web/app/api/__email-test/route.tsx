import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";

import { sendEmail } from "@/lib/email/send";
import { WelcomeEmail } from "@/emails/welcome";

/**
 * Deliberate-fire endpoint for the M0.1 email-pipeline smoke test.
 *
 * REMOVE BEFORE MERGE per the M0.1 test plan:
 *
 *   1. Wait for the Vercel preview deploy of this PR.
 *   2. Sign in to the preview, then:
 *        curl -X POST -b "<your-clerk-cookies>" \
 *          "https://<preview>/api/__email-test?to=jeremyrcollins34@gmail.com"
 *   3. Confirm the welcome email arrives in that inbox within ~30s.
 *   4. Delete this file in a follow-up commit on the same branch,
 *      then merge the PR. Main never sees the test endpoint.
 *
 * Auth-gated: only signed-in users can hit this. `?to=` is required
 * so a stray POST can never blast email to a hard-coded address.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  Sentry.setTag("operation", "email_smoke_test");

  const { userId } = await auth();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const to = url.searchParams.get("to");
  if (!to) {
    return Response.json(
      { ok: false, error: "missing_to_param" },
      { status: 400 },
    );
  }

  const result = await sendEmail({
    to,
    subject: "DwellVerdict email pipeline test",
    template: <WelcomeEmail name="Jeremy" />,
    tags: [{ name: "category", value: "pipeline_test" }],
  });

  return Response.json(result, { status: result.success ? 200 : 502 });
}
