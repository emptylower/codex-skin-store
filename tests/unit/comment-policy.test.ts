import { describe, expect, it } from "vitest";

import {
  COMMENT_MAX_CODE_POINTS,
  escapeCommentHtml,
  normalizeCommentBody,
} from "~/domain/comments/policy";

describe("normalizeCommentBody", () => {
  it("trims unicode whitespace and rejects empty", () => {
    expect(normalizeCommentBody("  hello  ")).toEqual({
      ok: true,
      body: "hello",
    });
    expect(normalizeCommentBody("\u00a0\u2003")).toEqual({
      ok: false,
      code: "empty",
    });
  });

  it("caps at 1000 unicode code points", () => {
    const ok = "a".repeat(COMMENT_MAX_CODE_POINTS);
    expect(normalizeCommentBody(ok).ok).toBe(true);
    expect(normalizeCommentBody(`${ok}x`)).toEqual({
      ok: false,
      code: "too_long",
    });
    // Surrogate pairs count as one code point via spread.
    const emoji = "😀".repeat(COMMENT_MAX_CODE_POINTS);
    expect(normalizeCommentBody(emoji).ok).toBe(true);
    expect(normalizeCommentBody(`${emoji}x`).ok).toBe(false);
  });

  it("rejects control characters", () => {
    expect(normalizeCommentBody("hi\u0000there").ok).toBe(false);
  });
});

describe("escapeCommentHtml", () => {
  it("escapes HTML and does not auto-link", () => {
    expect(escapeCommentHtml(`<a href="x">y</a> & '"`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;y&lt;/a&gt; &amp; &#39;&quot;",
    );
    expect(escapeCommentHtml("https://example.com")).toBe(
      "https://example.com",
    );
  });
});
