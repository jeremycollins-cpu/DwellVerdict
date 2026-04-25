"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Building2,
  Clock,
  Columns3,
  Home,
  Menu,
  Settings,
  StickyNote,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/ui/avatar";

/**
 * The application sidebar shell rendered alongside every authenticated
 * surface. Mounted by `apps/web/app/app/layout.tsx` so every `/app/*`
 * route inherits it.
 *
 * Width:        232px desktop, full-width drawer on mobile
 * Background:   `--sidebar-bg` (warm cream)
 * Active item:  3px terracotta left-border + tinted background
 * Section heads: Geist Mono uppercase, 0.16em tracking
 */

export interface SidebarUser {
  name: string;
  initials: string;
  /** Plan label, e.g. "Pro · $40/mo" or "Starter". */
  plan: string;
}

export interface SidebarNavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Optional badge count rendered to the right of the label. */
  badge?: number;
  /** When true, the badge gets the terracotta accent (used for Alerts). */
  badgeAccent?: boolean;
}

export interface SidebarSection {
  label: string;
  items: SidebarNavItem[];
}

export interface SidebarProps {
  user: SidebarUser;
  /** Optional active route (defaults to matching window pathname for the preview page). */
  activeRoute?: string;
  /** Optional override for the nav items. Defaults to the M1.1 hard-coded list. */
  sections?: SidebarSection[];
  className?: string;
}

const DEFAULT_SECTIONS: SidebarSection[] = [
  {
    label: "Primary",
    items: [
      { label: "Dashboard", href: "/app/dashboard", icon: Home },
      { label: "Properties", href: "/app/properties", icon: Building2 },
      { label: "Verdicts", href: "/app/verdicts", icon: Clock },
      { label: "Compare", href: "/app/compare", icon: Columns3 },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "Portfolio", href: "/app/portfolio", icon: BarChart3 },
      { label: "Briefs", href: "/app/briefs", icon: StickyNote },
      { label: "Alerts", href: "/app/alerts", icon: Bell },
    ],
  },
  {
    label: "Account",
    items: [{ label: "Settings", href: "/app/settings", icon: Settings }],
  },
];

function isActive(itemHref: string, activeRoute: string | undefined): boolean {
  if (!activeRoute) return false;
  if (activeRoute === itemHref) return true;
  return activeRoute.startsWith(`${itemHref}/`);
}

function NavItem({ item, active }: { item: SidebarNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        "border-l-[3px] border-transparent",
        active
          ? "border-terracotta bg-terracotta-soft text-ink"
          : "text-ink-70 hover:bg-paper-warm hover:text-ink",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-terracotta" : "text-ink-muted group-hover:text-ink-70",
        )}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {typeof item.badge === "number" ? (
        <span
          className={cn(
            "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-medium tabular-nums",
            item.badgeAccent
              ? "bg-terracotta text-paper"
              : "bg-paper-warm text-ink-muted",
          )}
        >
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function SidebarBody({
  user,
  sections,
  activeRoute,
}: {
  user: SidebarUser;
  sections: SidebarSection[];
  activeRoute: string | undefined;
}) {
  return (
    <div className="flex h-full w-full flex-col bg-sidebar-bg">
      <div className="flex h-14 items-center border-b border-hairline px-4">
        <Logo variant="full" size="sm" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.label} className="mb-6 last:mb-0">
            <div className="px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-subtle">
              {section.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  active={isActive(item.href, activeRoute)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-hairline px-3 py-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-1.5">
          <Avatar initials={user.initials} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink">
              {user.name}
            </div>
            <div className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-ink-muted">
              {user.plan}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({
  user,
  activeRoute,
  sections = DEFAULT_SECTIONS,
  className,
}: SidebarProps) {
  // Fall back to the current pathname when the layout doesn't pass an
  // explicit override. This is what authed `/app/*` rendering uses —
  // the layout is a server component and can't read pathname itself.
  const pathname = usePathname();
  const resolvedActive = activeRoute ?? pathname ?? undefined;

  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <>
      {/* Mobile trigger — visible <768px. */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open navigation"
        className="fixed left-3 top-3 z-40 inline-flex size-9 items-center justify-center rounded-md border border-hairline-strong bg-card-ink text-ink-70 shadow-sm md:hidden"
      >
        <Menu className="size-4" />
      </button>

      {/* Desktop sidebar — sticky full-height column. */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen w-[232px] shrink-0 border-r border-hairline md:flex",
          className,
        )}
      >
        <SidebarBody user={user} sections={sections} activeRoute={resolvedActive} />
      </aside>

      {/* Mobile drawer — off-canvas. */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] border-r border-hairline shadow-xl">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-md text-ink-70 hover:bg-paper-warm"
            >
              <X className="size-4" />
            </button>
            <SidebarBody
              user={user}
              sections={sections}
              activeRoute={resolvedActive}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

export { DEFAULT_SECTIONS as defaultSidebarSections };
