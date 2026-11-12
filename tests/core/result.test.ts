import { describe, expect, test } from "bun:test";
import { err, ok, type Result } from "../../src/core/result.ts";

describe("core.result", () => {
  test("ok constructs a success value", () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
  });

  test("err constructs a failure value", () => {
    expect(err("boom")).toEqual({ ok: false, error: "boom" });
  });

  test("narrowing discriminates the union", () => {
    const r: Result<number, string> = ok(21);
    if (r.ok) {
      expect(r.value * 2).toBe(42);
    } else {
      throw new Error("unreachable branch");
    }
    const bad: Result<number, string> = err("nope");
    if (!bad.ok) {
      expect(bad.error).toBe("nope");
    } else {
      throw new Error("unreachable branch");
    }
  });
});
