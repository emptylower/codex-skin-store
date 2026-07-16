import { describe, expect, it } from "vitest";

import {
  AUTH_INTENT_ACTIONS,
  AUTH_INTENT_TTL_MS,
  intentPayloadSchema,
  isAuthIntentAction,
  validateReturnPath,
} from "~/domain/engagement/intent";

describe("validateReturnPath", () => {
  it("accepts relative app paths", () => {
    expect(validateReturnPath("/en/themes/neon-road")).toBe(true);
    expect(validateReturnPath("/zh-hans")).toBe(true);
    expect(validateReturnPath("/en/themes/x?resume=copy_prompt")).toBe(true);
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(validateReturnPath("https://evil.example/")).toBe(false);
    expect(validateReturnPath("http://evil.example/path")).toBe(false);
    expect(validateReturnPath("//evil.example/")).toBe(false);
    expect(validateReturnPath("///evil.example")).toBe(false);
  });

  it("rejects empty, non-root-relative, and control characters", () => {
    expect(validateReturnPath("")).toBe(false);
    expect(validateReturnPath("en/themes")).toBe(false);
    expect(validateReturnPath("/path with space")).toBe(false);
    expect(validateReturnPath("/path\n/x")).toBe(false);
    expect(validateReturnPath("\\evil")).toBe(false);
  });
});

describe("auth intent actions", () => {
  it("allows only gated community actions", () => {
    expect(AUTH_INTENT_ACTIONS).toEqual([
      "download",
      "copy_prompt",
      "favorite",
      "comment",
      "report",
    ]);
    expect(isAuthIntentAction("download")).toBe(true);
    expect(isAuthIntentAction("delete_account")).toBe(false);
  });

  it("uses a 10-minute TTL", () => {
    expect(AUTH_INTENT_TTL_MS).toBe(10 * 60 * 1000);
  });
});

describe("intentPayloadSchema", () => {
  it("accepts returnPath, platform, and draft body fields", () => {
    const parsed = intentPayloadSchema.parse({
      returnPath: "/en/themes/neon-road",
      platform: "macos",
      body: "Nice theme",
    });
    expect(parsed.returnPath).toBe("/en/themes/neon-road");
  });

  it("rejects unsafe return paths and unknown keys", () => {
    expect(() =>
      intentPayloadSchema.parse({ returnPath: "https://evil.example/" }),
    ).toThrow();
    expect(() =>
      intentPayloadSchema.parse({ evil: true }),
    ).toThrow();
  });
});
