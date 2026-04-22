"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { MapPin, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { parseGooglePlace, type ParsedAddress } from "@/lib/address";
import { Input } from "@/components/ui/input";

/**
 * AddressAutocomplete — the front door of DwellVerdict.
 *
 * Wraps Google Places Autocomplete behind a shadcn <Input>. On valid
 * selection, fires `onSelect` with a fully-parsed ParsedAddress. On
 * invalid selection (region, city-only, ambiguous) fires `onInvalid`
 * so the caller can render an inline nudge.
 *
 * Deliberate choices:
 *   - `apiKey` is read from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY at render
 *     time. No fallback — if the key is missing the component renders
 *     a disabled input with a tooltip. Prevents a silent-failure mode
 *     where users type an address and nothing happens.
 *   - Restricted to US + street-level addresses (`types: ["address"]`).
 *     The product only supports US properties in v1.
 *   - Manual DOM handoff instead of `<gmp-place-autocomplete>` because
 *     the web component's events don't give us the full Place
 *     details object without a follow-up fetchFields call.
 */

type Props = {
  onSelect: (address: ParsedAddress) => void;
  onInvalid?: (reason: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * When provided, the input starts populated with this string.
   * Typical use: restoring a draft after a validation failure.
   */
  initialValue?: string;
};

const SCRIPT_LOAD_TIMEOUT_MS = 8000;

export function AddressAutocomplete({
  onSelect,
  onInvalid,
  placeholder = "Paste any US address…",
  disabled = false,
  initialValue = "",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!apiKey) {
      setLoadError("missing-api-key");
      return;
    }
    if (!inputRef.current) return;

    let cancelled = false;

    // Fail fast if Google's script hangs on a flaky network — we'd
    // rather fall back to "you can type but autocomplete is down" than
    // leave a spinner forever.
    const timeout = window.setTimeout(() => {
      if (!cancelled && !autocompleteRef.current) {
        setLoadError("script-load-timeout");
      }
    }, SCRIPT_LOAD_TIMEOUT_MS);

    // setOptions is a no-op after the first call; safe to call on
     // every mount. The actual script request only fires on the first
     // importLibrary call in the session.
    setOptions({ key: apiKey, v: "weekly", libraries: ["places"] });

    importLibrary("places")
      .then((places) => {
        if (cancelled || !inputRef.current) return;
        window.clearTimeout(timeout);
        const ac = new places.Autocomplete(inputRef.current, {
          types: ["address"],
          componentRestrictions: { country: "us" },
          fields: [
            "place_id",
            "formatted_address",
            "address_components",
            "geometry.location",
          ],
        });
        ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          const parsed = parseGooglePlace(place);
          if (parsed) {
            onSelect(parsed);
          } else {
            onInvalid?.(
              "That didn't look like a full street address. Try including the house number.",
            );
          }
        });
        autocompleteRef.current = ac;
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        window.clearTimeout(timeout);
        setLoadError("load-failed");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      // Google doesn't expose a destroy method on Autocomplete; it
      // cleans up when the input element unmounts. The listener we
      // attached is owned by `ac` so it goes with it.
      autocompleteRef.current = null;
    };
  }, [apiKey, onSelect, onInvalid]);

  const isDisabled = disabled || loadError === "missing-api-key";

  return (
    <div className="relative w-full">
      <MapPin
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-terracotta"
      />
      <Input
        ref={inputRef}
        type="text"
        defaultValue={initialValue}
        placeholder={placeholder}
        disabled={isDisabled}
        // Prevent browser autofill from competing with Google's dropdown.
        autoComplete="off"
        aria-label="Property address"
        className="h-12 pl-10 pr-10 text-base"
        // Enter without a selection shouldn't submit a form; the
        // component relies on place_changed. Swallow it.
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
      {!ready && !loadError ? (
        <Loader2
          aria-hidden
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-muted/60"
        />
      ) : null}
      {loadError ? (
        <p className="mt-2 font-mono text-xs text-ink-muted">
          {loadError === "missing-api-key"
            ? "Address autocomplete is offline (API key not configured)."
            : "Couldn't reach Google Maps. Refresh to try again."}
        </p>
      ) : null}
    </div>
  );
}
