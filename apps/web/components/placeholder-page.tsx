import Link from "next/link";

interface PlaceholderPageProps {
  milestone: string;
  title: string;
}

/**
 * Lightweight stub rendered for sidebar nav targets that haven't
 * shipped yet. Keeps the user oriented (where they were trying to
 * go, when it'll arrive) and offers one concrete next step instead
 * of stranding them on an empty surface.
 */
export function PlaceholderPage({ milestone, title }: PlaceholderPageProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-ink-muted">
          {milestone}
        </p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-muted">
          This surface ships in milestone {milestone}. For now, head to your
          properties.
        </p>
        <Link
          href="/app/properties"
          className="mt-6 inline-block rounded-md bg-terracotta px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-terracotta/90"
        >
          Go to properties
        </Link>
      </div>
    </div>
  );
}
