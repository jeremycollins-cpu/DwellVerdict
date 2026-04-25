"use client";

import * as React from "react";
import { Filter } from "lucide-react";

import { Chip } from "@/components/ui/chip";

/**
 * Client wrapper around interactive filter chips.
 *
 * Lives next to the design-system page so the page itself can stay a
 * Server Component (auth gate via `auth()` + `notFound()`). Any chip
 * with an `onClick` must be inside a Client Component, otherwise React
 * rejects the boundary with "Event handlers cannot be passed to Client
 * Component props".
 *
 * Filter state is a single value here (matches typical filter-bar
 * mockup usage where one filter is active at a time). Clicking a chip
 * sets it active.
 */
export function ChipFilterDemo() {
  const [active, setActive] = React.useState<string>("all");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip
        variant="filter"
        leadingIcon={<Filter />}
        active={active === "all"}
        onClick={() => setActive("all")}
      >
        All
      </Chip>
      <Chip
        variant="filter"
        active={active === "active"}
        onClick={() => setActive("active")}
      >
        Active
      </Chip>
      <Chip
        variant="filter"
        active={active === "underwriting"}
        onClick={() => setActive("underwriting")}
        count={12}
      >
        Underwriting
      </Chip>
      <Chip
        variant="filter"
        active={active === "closing"}
        onClick={() => setActive("closing")}
        count={3}
      >
        Closing
      </Chip>
      <Chip
        variant="filter"
        size="md"
        active={active === "owned"}
        onClick={() => setActive("owned")}
      >
        Owned
      </Chip>
    </div>
  );
}
