"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";

/**
 * Root error boundary. Next App Router only invokes `global-error.tsx`
 * when an error escapes every nested `error.tsx` and the root layout
 * itself crashes — without this, Sentry never sees those errors
 * because the framework's default fallback runs in a context where
 * client instrumentation hasn't loaded.
 *
 * The visual fallback is intentionally minimal (Next's built-in
 * NextError component). The whole point of this file is the
 * `Sentry.captureException` side effect.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
