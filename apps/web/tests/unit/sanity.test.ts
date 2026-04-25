import { describe, expect, it } from "vitest";

/**
 * Smoke test added with M0.2. Confirms vitest, the CI runner, and the
 * `pnpm test` pipeline are all wired up. Real coverage gets added in
 * later milestones as features warrant.
 */
describe("sanity", () => {
  it("runs the test runner", () => {
    expect(1 + 1).toBe(2);
  });
});
