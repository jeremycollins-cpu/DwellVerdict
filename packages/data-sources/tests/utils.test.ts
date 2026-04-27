import { describe, expect, it } from "vitest";

import { settledSignal, withTimeout } from "../src/utils";

describe("withTimeout", () => {
  it("resolves with the original value when the promise settles in time", async () => {
    const r = await withTimeout(Promise.resolve("ok"), 100);
    expect(r).toBe("ok");
  });

  it("rejects with a timeout error after `ms`", async () => {
    const slow = new Promise<string>((res) => setTimeout(() => res("late"), 200));
    await expect(withTimeout(slow, 50, "test")).rejects.toThrow(
      /test: timed out after 50ms/,
    );
  });

  it("propagates the original error if the promise rejects first", async () => {
    const fail = Promise.reject(new Error("boom"));
    await expect(withTimeout(fail, 100)).rejects.toThrow("boom");
  });
});

describe("settledSignal", () => {
  it("passes through the SignalResult unchanged on success", async () => {
    const r = await settledSignal(
      Promise.resolve({ ok: true as const, data: { x: 1 }, source: "test", fetchedAt: "now" }),
      100,
      "test",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.x).toBe(1);
  });

  it("converts a thrown error into a soft-fail envelope", async () => {
    const thrower = Promise.reject(new Error("network down"));
    const r = await settledSignal(thrower, 100, "test_source");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("network down");
      expect(r.source).toBe("test_source");
    }
  });

  it("converts a timeout into a soft-fail envelope", async () => {
    const slow = new Promise((res) =>
      setTimeout(
        () => res({ ok: true as const, data: {}, source: "x", fetchedAt: "now" }),
        500,
      ),
    );
    const r = await settledSignal(
      slow as Parameters<typeof settledSignal>[0],
      30,
      "slow_source",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/timed out/);
      expect(r.source).toBe("slow_source");
    }
  });
});
