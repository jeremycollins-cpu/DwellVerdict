"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { parseGooglePlace, type ParsedAddress } from "@/lib/address";

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

  // The M3.1 visual is a single boxed row (icon + flush input +
  // CTA), so this component renders only the input itself plus the
  // loading/error affordances. The wrapping shell — pin icon, CTA
  // button, focus ring, autocomplete-dropdown styling — lives in
  // the parent (AddressEntry) and on Google's `.pac-container` via
  // globals.css.
  return (
    <div className="relative flex w-full items-center">
      <input
        ref={inputRef}
        type="text"
        defaultValue={initialValue}
        placeholder={placeholder}
        disabled={isDisabled}
        autoComplete="off"
        aria-label="Property address"
        className="w-full flex-1 bg-transparent py-4 text-[18px] tracking-[-0.005em] text-ink placeholder:text-ink-faint focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        // Enter without a selection shouldn't submit a form; the
        // component relies on place_changed. Swallow it.
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
      {!ready && !loadError ? (
        <Loader2
          aria-hidden
          className="size-4 shrink-0 animate-spin text-ink-muted/60"
        />
      ) : null}
      {loadError ? (
        <p className="ml-3 shrink-0 font-mono text-xs text-ink-muted">
          {loadError === "missing-api-key"
            ? "Autocomplete offline"
            : "Couldn't reach Google Maps"}
        </p>
      ) : null}
    </div>
  );
}
