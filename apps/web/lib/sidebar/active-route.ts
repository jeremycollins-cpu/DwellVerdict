/**
 * Map an authenticated pathname to one of the sidebar nav slot ids.
 * The Sidebar uses this to compute which item gets the terracotta
 * accent. Order matters: settings/billing is a sub-route of
 * settings, properties has the most sub-routes (lifecycle stages,
 * scout), so we match prefixes from most-specific to least.
 */
export type SidebarActiveRoute =
  | "dashboard"
  | "properties"
  | "verdicts"
  | "compare"
  | "portfolio"
  | "briefs"
  | "alerts"
  | "settings"
  | null;

const PREFIX_MAP: Array<{ prefix: string; id: Exclude<SidebarActiveRoute, null> }> = [
  { prefix: "/app/dashboard", id: "dashboard" },
  { prefix: "/app/properties", id: "properties" },
  { prefix: "/app/verdicts", id: "verdicts" },
  { prefix: "/app/compare", id: "compare" },
  { prefix: "/app/portfolio", id: "portfolio" },
  { prefix: "/app/briefs", id: "briefs" },
  { prefix: "/app/alerts", id: "alerts" },
  { prefix: "/app/settings", id: "settings" },
];

export function getActiveRoute(pathname: string | null | undefined): SidebarActiveRoute {
  if (!pathname) return null;
  for (const { prefix, id } of PREFIX_MAP) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return id;
  }
  return null;
}

/**
 * Map a SidebarActiveRoute id back to the canonical href that the
 * Sidebar renders. Used to produce the `activeRoute` prop value the
 * Sidebar expects (it compares against item hrefs).
 */
export function activeRouteToHref(active: SidebarActiveRoute): string | undefined {
  if (!active) return undefined;
  const entry = PREFIX_MAP.find((p) => p.id === active);
  return entry?.prefix;
}
