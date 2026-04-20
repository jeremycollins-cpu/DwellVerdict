import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-16 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        DwellVerdict
      </p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Phase 0 — skeleton is up.
      </h1>
      <p className="max-w-xl text-balance text-muted-foreground">
        Auth, dashboards, and Scout land in later milestones. For now this page
        exists to confirm the Next.js 15 + Tailwind + shadcn pipeline builds and
        renders end to end.
      </p>
      <Button disabled>Sign up — coming in Milestone 3</Button>
    </main>
  );
}
