import { z } from "zod";

/**
 * Parsed address returned by AddressAutocomplete. Shape is tight on
 * purpose — the server action receives exactly this object and no
 * more, so the trust boundary is narrow.
 *
 * `googlePlaceId` is the primary key from Google's side; `addressFull`
 * is their canonical display string. Everything else is parsed from
 * their `address_components` array at the client.
 */
export const ParsedAddressSchema = z.object({
  googlePlaceId: z.string().min(1),
  addressFull: z.string().min(1),
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(3),
  county: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
});

export type ParsedAddress = z.infer<typeof ParsedAddressSchema>;

/**
 * Pull a specific address component out of Google's Place result by
 * type. Google returns components in an arbitrary order and we always
 * want the `short_name` for state (so "TN" not "Tennessee") and the
 * `long_name` for city / county (so "Nashville" and "Davidson County").
 */
function pick(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  type: string,
  which: "long_name" | "short_name" = "long_name",
): string | null {
  const match = components?.find((c) => c.types.includes(type));
  return match ? match[which] : null;
}

/**
 * Convert a Google Place result into our ParsedAddress shape. Returns
 * null when required fields are missing (e.g. the user picked a city
 * or region instead of a street address). The caller should show a
 * helpful error asking for a full street address.
 */
export function parseGooglePlace(
  place: google.maps.places.PlaceResult,
): ParsedAddress | null {
  const components = place.address_components;
  const placeId = place.place_id;
  const addressFull = place.formatted_address;
  const location = place.geometry?.location;

  if (!placeId || !addressFull || !location || !components) return null;

  const streetNumber = pick(components, "street_number");
  const route = pick(components, "route");
  const city =
    pick(components, "locality") ??
    pick(components, "sublocality_level_1") ??
    pick(components, "sublocality") ??
    pick(components, "postal_town");
  const state = pick(components, "administrative_area_level_1", "short_name");
  const zip = pick(components, "postal_code");
  const county = pick(components, "administrative_area_level_2");

  if (!streetNumber || !route || !city || !state || !zip) return null;

  return {
    googlePlaceId: placeId,
    addressFull,
    street: `${streetNumber} ${route}`,
    city,
    state,
    zip,
    county,
    lat: location.lat(),
    lng: location.lng(),
  };
}

/**
 * Canonical address key for the (org_id, normalized_address) unique
 * index. Lowercased, whitespace-collapsed, punctuation-stripped form
 * of the street + city + state + zip. Matches the normalizer referred
 * to by properties.ts.
 */
export function normalizeAddress(a: Pick<ParsedAddress, "street" | "city" | "state" | "zip">): string {
  return [a.street, a.city, a.state, a.zip]
    .join(" ")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
