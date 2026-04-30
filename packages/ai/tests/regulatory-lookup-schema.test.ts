import { describe, expect, it } from "vitest";

import {
  RegulatoryLookupOutputSchema,
  RegulatoryStrOutputSchema,
  RegulatoryLtrOutputSchema,
  RegulatoryOwnerOccupiedOutputSchema,
  RegulatoryHouseHackingOutputSchema,
  RegulatoryFlippingOutputSchema,
} from "../src/tasks/regulatory-lookup";

/**
 * Schema regression for the M3.13 thesis-aware regulatory lookup
 * output. The schema is a discriminated union over five
 * thesis_dimension arms; each arm has its own typed structured
 * fields plus a shared trailer (notable_factors, summary, sources).
 *
 * Fair-housing enforcement lives in the per-thesis prompt files —
 * each instructs the LLM to talk about rules, not residents.
 * Golden-file tests against live LLM output for known cities sit
 * in a separate file (regulatory-lookup-golden.test.ts) and are
 * skipped without ANTHROPIC_API_KEY.
 */

const sharedTrailer = {
  notable_factors: ["Recent enforcement crackdown on unpermitted listings"],
  summary:
    "City permits non-owner-occupied STRs with annual renewal; cap of 3% of residential housing units per district.",
  sources: [
    "https://library.municode.com/example",
    "https://example.gov/str-program",
  ],
};

const strGolden = {
  thesis_dimension: "str" as const,
  str_legal: "restricted" as const,
  permit_required: "yes" as const,
  owner_occupied_only: "depends" as const,
  cap_on_non_oo:
    "Non-owner-occupied STRs capped at 3% of residential units per district.",
  renewal_frequency: "annual" as const,
  minimum_stay_days: null,
  ...sharedTrailer,
};

const ltrGolden = {
  thesis_dimension: "ltr" as const,
  rent_control: "state_cap" as const,
  rent_increase_cap:
    "AB 1482: 5% + CPI capped at 10% annually for buildings 15+ years old.",
  just_cause_eviction: "yes" as const,
  security_deposit_cap: "2 months' rent unfurnished, 3 months furnished.",
  rental_registration_required: "no" as const,
  source_of_income_protection: "yes" as const,
  eviction_friendliness: "tenant_favorable" as const,
  ...sharedTrailer,
};

const ownerOccupiedGolden = {
  thesis_dimension: "owner_occupied" as const,
  homestead_exemption: "yes" as const,
  homestead_exemption_summary:
    "Florida: $50K off assessed value for primary residences; SOH cap limits annual growth to 3%.",
  property_tax_rate_summary:
    "Effective rate ~0.83% across major counties; assessed value re-set at sale.",
  transfer_tax: "$0.70 per $100 of consideration on the deed.",
  hoa_disclosure_required: "yes" as const,
  hoa_approval_required: "depends" as const,
  special_assessments_common: "yes" as const,
  ...sharedTrailer,
};

const houseHackingGolden = {
  thesis_dimension: "house_hacking" as const,
  adu_legal: "yes" as const,
  jadu_legal: "yes" as const,
  room_rental_legal: "yes" as const,
  max_unrelated_occupants: 3,
  owner_occupied_str_carveout: "yes" as const,
  owner_occupied_str_summary:
    "Owner-occupied STRs permitted by-right; non-OO capped per ordinance.",
  parking_requirement_per_unit:
    "1 space per ADU; waived within 0.5mi of transit per CA AB 2097.",
  ...sharedTrailer,
};

const flippingGolden = {
  thesis_dimension: "flipping" as const,
  permit_timeline_summary:
    "Roseville: 4-6 weeks for full-scope permit; over-the-counter for minor electrical/plumbing.",
  gc_license_threshold_summary:
    "CA: GC license required above $500 labor+materials per project (CSLB).",
  historic_district_risk: "none" as const,
  historic_district_summary: null,
  flipper_surtax: "no" as const,
  flipper_surtax_summary: null,
  transfer_tax_at_sale: "$1.10 per $1000 county documentary transfer tax.",
  disclosure_requirements_summary:
    "TDS form mandatory in CA; AS-IS disclaimers ineffective for known defects.",
  ...sharedTrailer,
};

describe("RegulatoryLookupOutputSchema (M3.13 discriminated union)", () => {
  it("accepts a well-formed STR payload", () => {
    expect(RegulatoryLookupOutputSchema.safeParse(strGolden).success).toBe(
      true,
    );
  });

  it("accepts a well-formed LTR payload", () => {
    expect(RegulatoryLookupOutputSchema.safeParse(ltrGolden).success).toBe(
      true,
    );
  });

  it("accepts a well-formed owner_occupied payload", () => {
    expect(
      RegulatoryLookupOutputSchema.safeParse(ownerOccupiedGolden).success,
    ).toBe(true);
  });

  it("accepts a well-formed house_hacking payload", () => {
    expect(
      RegulatoryLookupOutputSchema.safeParse(houseHackingGolden).success,
    ).toBe(true);
  });

  it("accepts a well-formed flipping payload", () => {
    expect(RegulatoryLookupOutputSchema.safeParse(flippingGolden).success).toBe(
      true,
    );
  });

  it("rejects an unknown thesis_dimension", () => {
    const r = RegulatoryLookupOutputSchema.safeParse({
      ...strGolden,
      thesis_dimension: "wholesale",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an LTR payload missing rent_control field", () => {
    const { rent_control: _rentControl, ...partial } = ltrGolden;
    void _rentControl;
    expect(RegulatoryLookupOutputSchema.safeParse(partial).success).toBe(false);
  });

  it("rejects an empty sources array", () => {
    expect(
      RegulatoryLookupOutputSchema.safeParse({ ...strGolden, sources: [] })
        .success,
    ).toBe(false);
  });

  it("accepts a single source URL (small-jurisdiction case)", () => {
    expect(
      RegulatoryLookupOutputSchema.safeParse({
        ...strGolden,
        sources: ["https://example.com/municipal-code/str"],
      }).success,
    ).toBe(true);
  });

  it("rejects more than 6 source URLs", () => {
    expect(
      RegulatoryLookupOutputSchema.safeParse({
        ...strGolden,
        sources: [
          "https://a.com/1",
          "https://a.com/2",
          "https://a.com/3",
          "https://a.com/4",
          "https://a.com/5",
          "https://a.com/6",
          "https://a.com/7",
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects non-URL strings in sources", () => {
    expect(
      RegulatoryLookupOutputSchema.safeParse({
        ...strGolden,
        sources: ["not-a-url", "https://example.com"],
      }).success,
    ).toBe(false);
  });

  it("rejects empty summary", () => {
    expect(
      RegulatoryLookupOutputSchema.safeParse({ ...strGolden, summary: "" })
        .success,
    ).toBe(false);
  });

  it("rejects more than 5 notable_factors", () => {
    expect(
      RegulatoryLookupOutputSchema.safeParse({
        ...strGolden,
        notable_factors: ["a", "b", "c", "d", "e", "f"],
      }).success,
    ).toBe(false);
  });

  it("rejects notable_factor entries over 280 chars", () => {
    expect(
      RegulatoryLookupOutputSchema.safeParse({
        ...strGolden,
        notable_factors: ["x".repeat(281)],
      }).success,
    ).toBe(false);
  });

  it("accepts notable_factor entries exactly 280 chars", () => {
    expect(
      RegulatoryLookupOutputSchema.safeParse({
        ...strGolden,
        notable_factors: ["x".repeat(280)],
      }).success,
    ).toBe(true);
  });

  it("rejects invalid str_legal value on STR arm", () => {
    expect(
      RegulatoryStrOutputSchema.safeParse({ ...strGolden, str_legal: "maybe" })
        .success,
    ).toBe(false);
  });

  it("rejects invalid eviction_friendliness on LTR arm", () => {
    expect(
      RegulatoryLtrOutputSchema.safeParse({
        ...ltrGolden,
        eviction_friendliness: "neutral",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid historic_district_risk on flipping arm", () => {
    expect(
      RegulatoryFlippingOutputSchema.safeParse({
        ...flippingGolden,
        historic_district_risk: "maybe",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid hoa_approval_required on owner_occupied arm", () => {
    expect(
      RegulatoryOwnerOccupiedOutputSchema.safeParse({
        ...ownerOccupiedGolden,
        hoa_approval_required: "always",
      }).success,
    ).toBe(false);
  });

  it("rejects non-integer max_unrelated_occupants on house_hacking arm", () => {
    expect(
      RegulatoryHouseHackingOutputSchema.safeParse({
        ...houseHackingGolden,
        max_unrelated_occupants: 3.5,
      }).success,
    ).toBe(false);
  });

  it("accepts all-null categorical fields (unclear jurisdiction)", () => {
    const result = RegulatoryLookupOutputSchema.safeParse({
      ...strGolden,
      str_legal: null,
      permit_required: null,
      owner_occupied_only: null,
      cap_on_non_oo: null,
      renewal_frequency: null,
      minimum_stay_days: null,
      summary:
        "Could not determine STR regulatory status for this city from available sources. Recommend contacting the city directly.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an integer minimum_stay_days on STR arm", () => {
    expect(
      RegulatoryLookupOutputSchema.safeParse({
        ...strGolden,
        minimum_stay_days: 30,
      }).success,
    ).toBe(true);
  });
});
