import { describe, expect, it } from "vitest";

import { normalizeAddress, parseGooglePlace } from "@/lib/address";

/**
 * Pure-function tests — address parsing and the normalized dedupe
 * key. No Anthropic, no DB, no network. Runs in the default unit
 * pass.
 */

type Loc = { lat: () => number; lng: () => number };

function fakePlace(overrides: {
  components?: google.maps.GeocoderAddressComponent[];
  placeId?: string | null;
  formattedAddress?: string;
  location?: Loc | null;
} = {}): google.maps.places.PlaceResult {
  // Distinguish "key not passed" from "key passed as null/undefined" so
  // tests can simulate a missing field explicitly.
  const pick = <T>(key: keyof typeof overrides, defaultValue: T): T | undefined => {
    if (key in overrides) {
      return overrides[key] as T | undefined;
    }
    return defaultValue;
  };
  const defaults: google.maps.places.PlaceResult = {
    place_id: pick("placeId", "ChIJtest123") as string | undefined,
    formatted_address: pick(
      "formattedAddress",
      "123 Main St, Nashville, TN 37201, USA",
    ) as string | undefined,
    address_components: pick("components", [
      { long_name: "123", short_name: "123", types: ["street_number"] },
      { long_name: "Main Street", short_name: "Main St", types: ["route"] },
      { long_name: "Nashville", short_name: "Nashville", types: ["locality", "political"] },
      {
        long_name: "Davidson County",
        short_name: "Davidson County",
        types: ["administrative_area_level_2", "political"],
      },
      {
        long_name: "Tennessee",
        short_name: "TN",
        types: ["administrative_area_level_1", "political"],
      },
      { long_name: "United States", short_name: "US", types: ["country", "political"] },
      { long_name: "37201", short_name: "37201", types: ["postal_code"] },
    ]) as google.maps.GeocoderAddressComponent[] | undefined,
    geometry: {
      location: (pick("location", {
        lat: () => 36.1627,
        lng: () => -86.7816,
      }) ?? undefined) as unknown as google.maps.LatLng | undefined,
    },
  };
  return defaults;
}

describe("parseGooglePlace", () => {
  it("parses a complete US street address into ParsedAddress", () => {
    const parsed = parseGooglePlace(fakePlace());
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual({
      googlePlaceId: "ChIJtest123",
      addressFull: "123 Main St, Nashville, TN 37201, USA",
      street: "123 Main Street",
      city: "Nashville",
      state: "TN", // short_name
      zip: "37201",
      county: "Davidson County",
      lat: 36.1627,
      lng: -86.7816,
    });
  });

  it("returns null when street_number is missing (user picked a city)", () => {
    const parsed = parseGooglePlace(
      fakePlace({
        components: [
          { long_name: "Nashville", short_name: "Nashville", types: ["locality"] },
          { long_name: "Tennessee", short_name: "TN", types: ["administrative_area_level_1"] },
          { long_name: "37201", short_name: "37201", types: ["postal_code"] },
        ],
      }),
    );
    expect(parsed).toBeNull();
  });

  it("returns null when place_id is missing", () => {
    const parsed = parseGooglePlace(fakePlace({ placeId: null }));
    expect(parsed).toBeNull();
  });

  it("falls back to sublocality when locality is absent (NYC boroughs, etc)", () => {
    const parsed = parseGooglePlace(
      fakePlace({
        components: [
          { long_name: "321", short_name: "321", types: ["street_number"] },
          { long_name: "Broadway", short_name: "Broadway", types: ["route"] },
          {
            long_name: "Brooklyn",
            short_name: "Brooklyn",
            types: ["sublocality_level_1", "sublocality", "political"],
          },
          {
            long_name: "New York",
            short_name: "NY",
            types: ["administrative_area_level_1", "political"],
          },
          { long_name: "11201", short_name: "11201", types: ["postal_code"] },
        ],
      }),
    );
    expect(parsed?.city).toBe("Brooklyn");
  });

  it("returns the short_name for state (TN, not Tennessee)", () => {
    const parsed = parseGooglePlace(fakePlace());
    expect(parsed?.state).toBe("TN");
  });

  it("returns null when coordinates are missing", () => {
    const bad: google.maps.places.PlaceResult = {
      place_id: "ChIJtest",
      formatted_address: "123 Main St, Nashville, TN 37201",
      address_components: fakePlace().address_components,
      geometry: undefined,
    };
    expect(parseGooglePlace(bad)).toBeNull();
  });
});

describe("normalizeAddress", () => {
  it("lowercases, collapses whitespace, and strips punctuation", () => {
    const a = normalizeAddress({
      street: "123 Main St.",
      city: "Nashville",
      state: "TN",
      zip: "37201",
    });
    expect(a).toBe("123 main st nashville tn 37201");
  });

  it("collapses runs of spaces so minor formatting differences dedupe", () => {
    const a = normalizeAddress({
      street: "  123   Main   St ",
      city: " Nashville ",
      state: "TN",
      zip: "37201",
    });
    expect(a).toBe("123 main st nashville tn 37201");
  });

  it("produces the same key for semantic duplicates", () => {
    const a = normalizeAddress({
      street: "123 Main St.",
      city: "Nashville",
      state: "TN",
      zip: "37201",
    });
    const b = normalizeAddress({
      street: "123 MAIN ST",
      city: "nashville",
      state: "TN",
      zip: "37201",
    });
    expect(a).toBe(b);
  });
});
