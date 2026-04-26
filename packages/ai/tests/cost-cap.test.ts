import { describe, expect, it } from "vitest";

import {
  decideCostCap,
  HARD_BLOCK_MULTIPLIER,
  MONTHLY_COST_CAP_CENTS,
} from "../src/cost-cap";

describe("decideCostCap", () => {
  it("returns under_cap for spend below the cap", () => {
    const decision = decideCostCap(0);
    expect(decision.state).toBe("under_cap");
    expect(decision.allowed).toBe(true);
    expect(decision.capCents).toBe(MONTHLY_COST_CAP_CENTS);
  });

  it("returns under_cap for spend just under the cap", () => {
    const decision = decideCostCap(MONTHLY_COST_CAP_CENTS - 1);
    expect(decision.state).toBe("under_cap");
    expect(decision.allowed).toBe(true);
  });

  it("returns over_cap_degrade once the cap is hit but before hard block", () => {
    const decision = decideCostCap(MONTHLY_COST_CAP_CENTS);
    expect(decision.state).toBe("over_cap_degrade");
    expect(decision.allowed).toBe(true);
  });

  it("returns over_cap_degrade in the soft-cap → hard-block band", () => {
    const decision = decideCostCap(
      Math.floor(MONTHLY_COST_CAP_CENTS * (HARD_BLOCK_MULTIPLIER - 0.1)),
    );
    expect(decision.state).toBe("over_cap_degrade");
    expect(decision.allowed).toBe(true);
  });

  it("returns over_cap_block once spend reaches the hard-block multiplier", () => {
    const decision = decideCostCap(
      Math.ceil(MONTHLY_COST_CAP_CENTS * HARD_BLOCK_MULTIPLIER),
    );
    expect(decision.state).toBe("over_cap_block");
    expect(decision.allowed).toBe(false);
  });
});
