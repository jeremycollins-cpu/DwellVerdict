import "server-only";

import {
  lookupRegulatory,
  type RegulatoryLookupOutput,
  type RegulatoryThesisDimension,
} from "@dwellverdict/ai";
import type { RegulatoryCacheRow } from "@dwellverdict/db";

import {
  getRegulatoryCacheRow,
  isRegulatoryCacheFresh,
  upsertRegulatoryCacheRow,
} from "@/lib/db/queries/regulatory-cache";

/**
 * Regulatory-signal orchestrator per ADR-6 (M3.13: thesis-aware).
 *
 * Flow:
 *   - Cache hit + fresh → return cached row immediately. $0 AI cost.
 *   - Cache hit + stale (TTL expired) → return cached row + flag
 *     stale for now; background-refresh path is a future TODO.
 *   - Cache miss → block, call Haiku + web_search, upsert, return.
 *
 * Output shape is a typed `RegulatorySignal` discriminated by
 * `thesisDimension` so callers can switch on which structured
 * fields are populated. UI surfaces age and the "verify with city"
 * disclaimer using `lastVerifiedAt`.
 */

export type RegulatorySignalCommon = {
  ok: true;
  fromCache: boolean;
  isStale: boolean;
  city: string;
  state: string;
  notableFactors: string[];
  summary: string;
  sourceUrls: string[];
  lastVerifiedAt: string; // ISO
};

export type RegulatorySignalStr = RegulatorySignalCommon & {
  thesisDimension: "str";
  strLegal: "yes" | "restricted" | "no" | "unclear" | null;
  permitRequired: "yes" | "no" | "unclear" | null;
  ownerOccupiedOnly: "yes" | "no" | "depends" | "unclear" | null;
  capOnNonOwnerOccupied: string | null;
  renewalFrequency: "annual" | "biennial" | "none" | null;
  minimumStayDays: number | null;
};

export type RegulatorySignalLtr = RegulatorySignalCommon & {
  thesisDimension: "ltr";
  rentControl: "none" | "state_cap" | "local_strict" | "unclear" | null;
  rentIncreaseCap: string | null;
  justCauseEviction: "yes" | "no" | "unclear" | null;
  securityDepositCap: string | null;
  rentalRegistrationRequired: "yes" | "no" | "unclear" | null;
  sourceOfIncomeProtection: "yes" | "no" | "unclear" | null;
  evictionFriendliness:
    | "landlord_favorable"
    | "balanced"
    | "tenant_favorable"
    | "unclear"
    | null;
};

export type RegulatorySignalOwnerOccupied = RegulatorySignalCommon & {
  thesisDimension: "owner_occupied";
  homesteadExemption: "yes" | "no" | "unclear" | null;
  homesteadExemptionSummary: string | null;
  propertyTaxRateSummary: string | null;
  transferTax: string | null;
  hoaDisclosureRequired: "yes" | "no" | "unclear" | null;
  hoaApprovalRequired: "yes" | "no" | "depends" | "unclear" | null;
  specialAssessmentsCommon: "yes" | "no" | "unclear" | null;
};

export type RegulatorySignalHouseHacking = RegulatorySignalCommon & {
  thesisDimension: "house_hacking";
  aduLegal: "yes" | "restricted" | "no" | "unclear" | null;
  jaduLegal: "yes" | "no" | "unclear" | null;
  roomRentalLegal: "yes" | "no" | "unclear" | null;
  maxUnrelatedOccupants: number | null;
  ownerOccupiedStrCarveout: "yes" | "no" | "unclear" | null;
  ownerOccupiedStrSummary: string | null;
  parkingRequirementPerUnit: string | null;
};

export type RegulatorySignalFlipping = RegulatorySignalCommon & {
  thesisDimension: "flipping";
  permitTimelineSummary: string | null;
  gcLicenseThresholdSummary: string | null;
  historicDistrictRisk: "yes" | "none" | "unclear" | null;
  historicDistrictSummary: string | null;
  flipperSurtax: "yes" | "no" | "unclear" | null;
  flipperSurtaxSummary: string | null;
  transferTaxAtSale: string | null;
  disclosureRequirementsSummary: string | null;
};

export type RegulatorySignalOk =
  | RegulatorySignalStr
  | RegulatorySignalLtr
  | RegulatorySignalOwnerOccupied
  | RegulatorySignalHouseHacking
  | RegulatorySignalFlipping;

export type RegulatorySignal =
  | RegulatorySignalOk
  | {
      ok: false;
      error: string;
      city: string;
      state: string;
      thesisDimension: RegulatoryThesisDimension;
    };

export async function getRegulatorySignal(params: {
  city: string;
  state: string;
  thesisDimension: RegulatoryThesisDimension;
  /** When set, the AI usage event is attributed to this user.
   *  Cache hits skip the AI call entirely so attribution only
   *  matters on cache miss. */
  userId?: string;
  orgId?: string;
}): Promise<RegulatorySignal> {
  const { city, state, thesisDimension, userId, orgId } = params;

  const cached = await getRegulatoryCacheRow({ city, state, thesisDimension });
  if (cached && isRegulatoryCacheFresh(cached)) {
    return rowToSignal({ row: cached, isStale: false });
  }

  // Cache miss OR stale: fetch live.
  const result = await lookupRegulatory({
    city,
    state,
    thesisDimension,
    userId,
    orgId,
  });
  if (!result.ok) {
    if (cached) {
      return rowToSignal({ row: cached, isStale: true });
    }
    return { ok: false, error: result.error, city, state, thesisDimension };
  }

  const { common, typed, jsonbFields } = splitOutput(result.output);

  await upsertRegulatoryCacheRow({
    city,
    state,
    thesisDimension,
    ...typed,
    thesisSpecificFields: jsonbFields,
    notableFactors: common.notableFactors,
    summary: common.summary,
    sourceUrls: common.sourceUrls,
    modelVersion: result.observability.modelVersion,
    promptVersion: result.observability.promptVersion,
    inputTokens: result.observability.inputTokens,
    outputTokens: result.observability.outputTokens,
    costCents: result.observability.costCents,
  });

  return outputToSignal({ city, state, output: result.output });
}

function rowToSignal(params: {
  row: RegulatoryCacheRow;
  isStale: boolean;
}): RegulatorySignalOk {
  const { row, isStale } = params;
  const common: RegulatorySignalCommon = {
    ok: true,
    fromCache: true,
    isStale,
    city: row.city,
    state: row.state,
    notableFactors: Array.isArray(row.notableFactors)
      ? (row.notableFactors as string[])
      : [],
    summary: row.summary ?? "",
    sourceUrls: Array.isArray(row.sourceUrls)
      ? (row.sourceUrls as string[])
      : [],
    lastVerifiedAt: row.lastVerifiedAt.toISOString(),
  };

  const dim = row.thesisDimension as RegulatoryThesisDimension;
  const tsf = (row.thesisSpecificFields ?? {}) as Record<string, unknown>;

  switch (dim) {
    case "str":
      return {
        ...common,
        thesisDimension: "str",
        strLegal: row.strLegal as RegulatorySignalStr["strLegal"],
        permitRequired:
          row.permitRequired as RegulatorySignalStr["permitRequired"],
        ownerOccupiedOnly:
          row.ownerOccupiedOnly as RegulatorySignalStr["ownerOccupiedOnly"],
        capOnNonOwnerOccupied: row.capOnNonOwnerOccupied,
        renewalFrequency:
          row.renewalFrequency as RegulatorySignalStr["renewalFrequency"],
        minimumStayDays: row.minimumStayDays,
      };
    case "ltr":
      return {
        ...common,
        thesisDimension: "ltr",
        rentControl: (tsf.rent_control ??
          null) as RegulatorySignalLtr["rentControl"],
        rentIncreaseCap: (tsf.rent_increase_cap ?? null) as string | null,
        justCauseEviction: (tsf.just_cause_eviction ??
          null) as RegulatorySignalLtr["justCauseEviction"],
        securityDepositCap: (tsf.security_deposit_cap ?? null) as string | null,
        rentalRegistrationRequired: (tsf.rental_registration_required ??
          null) as RegulatorySignalLtr["rentalRegistrationRequired"],
        sourceOfIncomeProtection: (tsf.source_of_income_protection ??
          null) as RegulatorySignalLtr["sourceOfIncomeProtection"],
        evictionFriendliness: (tsf.eviction_friendliness ??
          null) as RegulatorySignalLtr["evictionFriendliness"],
      };
    case "owner_occupied":
      return {
        ...common,
        thesisDimension: "owner_occupied",
        homesteadExemption: (tsf.homestead_exemption ??
          null) as RegulatorySignalOwnerOccupied["homesteadExemption"],
        homesteadExemptionSummary: (tsf.homestead_exemption_summary ?? null) as
          | string
          | null,
        propertyTaxRateSummary: (tsf.property_tax_rate_summary ?? null) as
          | string
          | null,
        transferTax: (tsf.transfer_tax ?? null) as string | null,
        hoaDisclosureRequired: (tsf.hoa_disclosure_required ??
          null) as RegulatorySignalOwnerOccupied["hoaDisclosureRequired"],
        hoaApprovalRequired: (tsf.hoa_approval_required ??
          null) as RegulatorySignalOwnerOccupied["hoaApprovalRequired"],
        specialAssessmentsCommon: (tsf.special_assessments_common ??
          null) as RegulatorySignalOwnerOccupied["specialAssessmentsCommon"],
      };
    case "house_hacking":
      return {
        ...common,
        thesisDimension: "house_hacking",
        aduLegal: (tsf.adu_legal ??
          null) as RegulatorySignalHouseHacking["aduLegal"],
        jaduLegal: (tsf.jadu_legal ??
          null) as RegulatorySignalHouseHacking["jaduLegal"],
        roomRentalLegal: (tsf.room_rental_legal ??
          null) as RegulatorySignalHouseHacking["roomRentalLegal"],
        maxUnrelatedOccupants: (tsf.max_unrelated_occupants ?? null) as
          | number
          | null,
        ownerOccupiedStrCarveout: (tsf.owner_occupied_str_carveout ??
          null) as RegulatorySignalHouseHacking["ownerOccupiedStrCarveout"],
        ownerOccupiedStrSummary: (tsf.owner_occupied_str_summary ?? null) as
          | string
          | null,
        parkingRequirementPerUnit: (tsf.parking_requirement_per_unit ??
          null) as string | null,
      };
    case "flipping":
      return {
        ...common,
        thesisDimension: "flipping",
        permitTimelineSummary: (tsf.permit_timeline_summary ?? null) as
          | string
          | null,
        gcLicenseThresholdSummary: (tsf.gc_license_threshold_summary ??
          null) as string | null,
        historicDistrictRisk: (tsf.historic_district_risk ??
          null) as RegulatorySignalFlipping["historicDistrictRisk"],
        historicDistrictSummary: (tsf.historic_district_summary ?? null) as
          | string
          | null,
        flipperSurtax: (tsf.flipper_surtax ??
          null) as RegulatorySignalFlipping["flipperSurtax"],
        flipperSurtaxSummary: (tsf.flipper_surtax_summary ?? null) as
          | string
          | null,
        transferTaxAtSale: (tsf.transfer_tax_at_sale ?? null) as string | null,
        disclosureRequirementsSummary: (tsf.disclosure_requirements_summary ??
          null) as string | null,
      };
  }
}

function outputToSignal(params: {
  city: string;
  state: string;
  output: RegulatoryLookupOutput;
}): RegulatorySignalOk {
  const { city, state, output } = params;
  const common: RegulatorySignalCommon = {
    ok: true,
    fromCache: false,
    isStale: false,
    city,
    state,
    notableFactors: output.notable_factors,
    summary: output.summary,
    sourceUrls: output.sources,
    lastVerifiedAt: new Date().toISOString(),
  };

  switch (output.thesis_dimension) {
    case "str":
      return {
        ...common,
        thesisDimension: "str",
        strLegal: output.str_legal,
        permitRequired: output.permit_required,
        ownerOccupiedOnly: output.owner_occupied_only,
        capOnNonOwnerOccupied: output.cap_on_non_oo,
        renewalFrequency: output.renewal_frequency,
        minimumStayDays: output.minimum_stay_days,
      };
    case "ltr":
      return {
        ...common,
        thesisDimension: "ltr",
        rentControl: output.rent_control,
        rentIncreaseCap: output.rent_increase_cap,
        justCauseEviction: output.just_cause_eviction,
        securityDepositCap: output.security_deposit_cap,
        rentalRegistrationRequired: output.rental_registration_required,
        sourceOfIncomeProtection: output.source_of_income_protection,
        evictionFriendliness: output.eviction_friendliness,
      };
    case "owner_occupied":
      return {
        ...common,
        thesisDimension: "owner_occupied",
        homesteadExemption: output.homestead_exemption,
        homesteadExemptionSummary: output.homestead_exemption_summary,
        propertyTaxRateSummary: output.property_tax_rate_summary,
        transferTax: output.transfer_tax,
        hoaDisclosureRequired: output.hoa_disclosure_required,
        hoaApprovalRequired: output.hoa_approval_required,
        specialAssessmentsCommon: output.special_assessments_common,
      };
    case "house_hacking":
      return {
        ...common,
        thesisDimension: "house_hacking",
        aduLegal: output.adu_legal,
        jaduLegal: output.jadu_legal,
        roomRentalLegal: output.room_rental_legal,
        maxUnrelatedOccupants: output.max_unrelated_occupants,
        ownerOccupiedStrCarveout: output.owner_occupied_str_carveout,
        ownerOccupiedStrSummary: output.owner_occupied_str_summary,
        parkingRequirementPerUnit: output.parking_requirement_per_unit,
      };
    case "flipping":
      return {
        ...common,
        thesisDimension: "flipping",
        permitTimelineSummary: output.permit_timeline_summary,
        gcLicenseThresholdSummary: output.gc_license_threshold_summary,
        historicDistrictRisk: output.historic_district_risk,
        historicDistrictSummary: output.historic_district_summary,
        flipperSurtax: output.flipper_surtax,
        flipperSurtaxSummary: output.flipper_surtax_summary,
        transferTaxAtSale: output.transfer_tax_at_sale,
        disclosureRequirementsSummary: output.disclosure_requirements_summary,
      };
  }
}

/**
 * Split an LLM output into the cache-write shape: STR-typed columns
 * (filled when STR, null otherwise) + the JSONB blob of remaining
 * thesis-specific fields.
 */
function splitOutput(output: RegulatoryLookupOutput): {
  common: { notableFactors: string[]; summary: string; sourceUrls: string[] };
  typed: {
    strLegal?: "yes" | "restricted" | "no" | "unclear" | null;
    permitRequired?: "yes" | "no" | "unclear" | null;
    ownerOccupiedOnly?: "yes" | "no" | "depends" | "unclear" | null;
    capOnNonOwnerOccupied?: string | null;
    renewalFrequency?: "annual" | "biennial" | "none" | null;
    minimumStayDays?: number | null;
  };
  jsonbFields: Record<string, unknown> | null;
} {
  const common = {
    notableFactors: output.notable_factors,
    summary: output.summary,
    sourceUrls: output.sources,
  };

  switch (output.thesis_dimension) {
    case "str":
      return {
        common,
        typed: {
          strLegal: output.str_legal,
          permitRequired: output.permit_required,
          ownerOccupiedOnly: output.owner_occupied_only,
          capOnNonOwnerOccupied: output.cap_on_non_oo,
          renewalFrequency: output.renewal_frequency,
          minimumStayDays: output.minimum_stay_days,
        },
        jsonbFields: null,
      };
    case "ltr":
      return {
        common,
        typed: {},
        jsonbFields: {
          rent_control: output.rent_control,
          rent_increase_cap: output.rent_increase_cap,
          just_cause_eviction: output.just_cause_eviction,
          security_deposit_cap: output.security_deposit_cap,
          rental_registration_required: output.rental_registration_required,
          source_of_income_protection: output.source_of_income_protection,
          eviction_friendliness: output.eviction_friendliness,
        },
      };
    case "owner_occupied":
      return {
        common,
        typed: {},
        jsonbFields: {
          homestead_exemption: output.homestead_exemption,
          homestead_exemption_summary: output.homestead_exemption_summary,
          property_tax_rate_summary: output.property_tax_rate_summary,
          transfer_tax: output.transfer_tax,
          hoa_disclosure_required: output.hoa_disclosure_required,
          hoa_approval_required: output.hoa_approval_required,
          special_assessments_common: output.special_assessments_common,
        },
      };
    case "house_hacking":
      return {
        common,
        typed: {},
        jsonbFields: {
          adu_legal: output.adu_legal,
          jadu_legal: output.jadu_legal,
          room_rental_legal: output.room_rental_legal,
          max_unrelated_occupants: output.max_unrelated_occupants,
          owner_occupied_str_carveout: output.owner_occupied_str_carveout,
          owner_occupied_str_summary: output.owner_occupied_str_summary,
          parking_requirement_per_unit: output.parking_requirement_per_unit,
        },
      };
    case "flipping":
      return {
        common,
        typed: {},
        jsonbFields: {
          permit_timeline_summary: output.permit_timeline_summary,
          gc_license_threshold_summary: output.gc_license_threshold_summary,
          historic_district_risk: output.historic_district_risk,
          historic_district_summary: output.historic_district_summary,
          flipper_surtax: output.flipper_surtax,
          flipper_surtax_summary: output.flipper_surtax_summary,
          transfer_tax_at_sale: output.transfer_tax_at_sale,
          disclosure_requirements_summary:
            output.disclosure_requirements_summary,
        },
      };
  }
}

/**
 * Map a property's `thesisType` (six-value enum including 'other')
 * to the regulatory thesis dimension (five-value enum). 'other'
 * falls back to 'str' since STR rules are the broadest baseline
 * regulatory profile and the user's free-form description doesn't
 * deterministically resolve to one of the four other dimensions.
 */
export function mapThesisToRegulatoryDimension(
  thesisType: string | null | undefined,
): RegulatoryThesisDimension {
  switch (thesisType) {
    case "str":
    case "ltr":
    case "owner_occupied":
    case "house_hacking":
    case "flipping":
      return thesisType;
    default:
      return "str";
  }
}
