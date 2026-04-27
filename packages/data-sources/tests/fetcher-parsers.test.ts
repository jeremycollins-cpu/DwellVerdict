import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchFemaFlood } from "../src/fema";
import { fetchUsgsWildfire } from "../src/usgs";

/**
 * Regression tests for the M3.7 fetcher repairs. Live verification
 * happened during the diagnostic phase against real API endpoints;
 * these tests pin the parser bugs that caused 100% failure pre-fix
 * so they don't silently regress.
 *
 * No live API calls — `fetch` is stubbed per test with the canonical
 * response shape we verified against on production endpoints.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function stubFetch(body: unknown) {
  const responseText = typeof body === "string" ? body : JSON.stringify(body);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(responseText, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

describe("fetchFemaFlood (M3.7 parser regressions)", () => {
  it("treats STATIC_BFE = -9999 sentinel as null (not a real BFE)", async () => {
    stubFetch({
      features: [
        {
          attributes: {
            FLD_ZONE: "X",
            SFHA_TF: "F",
            STATIC_BFE: -9999.0,
            ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD",
          },
        },
      ],
    });
    const r = await fetchFemaFlood(39.2369, -120.0258);
    expect(r.floodZone).toBe("X");
    expect(r.sfha).toBe(false);
    expect(r.bfeFeet).toBeNull();
    // Summary should NOT contain the -9999 sentinel.
    expect(r.summary).not.toContain("-9999");
  });

  it("preserves a real positive BFE value", async () => {
    stubFetch({
      features: [
        {
          attributes: {
            FLD_ZONE: "AE",
            SFHA_TF: "T",
            STATIC_BFE: 6228.5,
            ZONE_SUBTY: null,
          },
        },
      ],
    });
    const r = await fetchFemaFlood(0, 0);
    expect(r.floodZone).toBe("AE");
    expect(r.sfha).toBe(true);
    expect(r.bfeFeet).toBe(6228.5);
    expect(r.summary).toContain("6228.5");
  });

  it("prefers SFHA=T feature over the first feature when both present", async () => {
    stubFetch({
      features: [
        {
          attributes: {
            FLD_ZONE: "X",
            SFHA_TF: "F",
            STATIC_BFE: -9999,
            ZONE_SUBTY: "AREA OF MINIMAL FLOOD HAZARD",
          },
        },
        {
          attributes: {
            FLD_ZONE: "AE",
            SFHA_TF: "T",
            STATIC_BFE: 480.0,
            ZONE_SUBTY: null,
          },
        },
      ],
    });
    const r = await fetchFemaFlood(0, 0);
    expect(r.floodZone).toBe("AE");
    expect(r.sfha).toBe(true);
  });

  it("returns 'no polygon intersects' summary when features array is empty", async () => {
    stubFetch({ features: [] });
    const r = await fetchFemaFlood(0, 0);
    expect(r.floodZone).toBeNull();
    expect(r.sfha).toBe(false);
    expect(r.summary).toContain("No FEMA flood-zone polygon");
  });
});

describe("fetchUsgsWildfire (M3.7 field rename regression)", () => {
  it("parses INCIDENT / GIS_ACRES / FIRE_YEAR_INT (NIFC view fields)", async () => {
    stubFetch({
      features: [
        {
          attributes: {
            INCIDENT: "Martis",
            GIS_ACRES: 14428.78,
            FIRE_YEAR_INT: 2001,
          },
        },
        {
          attributes: {
            INCIDENT: "ROYAL",
            GIS_ACRES: 339,
            FIRE_YEAR_INT: 2003,
          },
        },
        {
          attributes: {
            INCIDENT: "Carnelian 3",
            GIS_ACRES: 20,
            FIRE_YEAR_INT: 2007,
          },
        },
      ],
    });
    const r = await fetchUsgsWildfire(39.2369, -120.0258);
    expect(r.nearbyFireCount).toBe(3);
    expect(r.largestNearbyAcres).toBeCloseTo(14428.78, 1);
    expect(r.mostRecentYear).toBe(2007);
    expect(r.summary).toContain("3 wildfires");
    expect(r.summary).toContain("14,429 acres");
  });

  it("ignores junk FIRE_YEAR_INT (out of range)", async () => {
    stubFetch({
      features: [
        { attributes: { INCIDENT: "Bad", GIS_ACRES: 100, FIRE_YEAR_INT: 0 } },
        { attributes: { INCIDENT: "Real", GIS_ACRES: 200, FIRE_YEAR_INT: 1985 } },
      ],
    });
    const r = await fetchUsgsWildfire(0, 0);
    expect(r.nearbyFireCount).toBe(2);
    expect(r.mostRecentYear).toBe(1985);
  });

  it("returns 'no recorded wildfires' summary when features empty", async () => {
    stubFetch({ features: [] });
    const r = await fetchUsgsWildfire(0, 0);
    expect(r.nearbyFireCount).toBe(0);
    expect(r.largestNearbyAcres).toBeNull();
    expect(r.mostRecentYear).toBeNull();
    expect(r.summary).toContain("No recorded wildfires");
  });
});
