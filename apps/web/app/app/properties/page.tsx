import { auth } from "@clerk/nextjs/server";

export default async function PropertiesPage() {
  // Route is already protected by middleware; this call just hydrates userId
  // for future personalization and confirms the server component has a session.
  await auth.protect();

  return (
    <section className="container flex min-h-[60vh] flex-col items-center justify-center gap-3 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">No properties yet</h1>
      <p className="max-w-md text-balance text-sm text-muted-foreground">
        Paste-an-address, reports, and Scout arrive in a later milestone. For
        now this is the empty state of your DwellVerdict dashboard.
      </p>
    </section>
  );
}
