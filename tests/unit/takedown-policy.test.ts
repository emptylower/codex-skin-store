import { describe, expect, it } from "vitest";

import {
  copyrightClaimSchema,
  evidenceObjectKey,
  validateEvidenceMeta,
  TakedownError,
} from "~/services/moderation/takedown.server";

describe("takedown policy", () => {
  it("validates required claimant fields and perjury/good-faith statement", () => {
    const ok = copyrightClaimSchema.safeParse({
      claimantEmail: "owner@example.com",
      claimantName: "Owner",
      targetThemeId: "theme-1",
      rightsBasis: "original author",
      statement:
        "I am the copyright owner of this work and state this under penalty of perjury in good faith.",
      signature: "Owner",
    });
    expect(ok.success).toBe(true);

    const bad = copyrightClaimSchema.safeParse({
      claimantEmail: "not-an-email",
      claimantName: "O",
      targetThemeId: "",
      rightsBasis: "x",
      statement: "mine",
      signature: "",
    });
    expect(bad.success).toBe(false);
  });

  it("builds evidence keys under evidence/{claim}/{id} only", () => {
    expect(evidenceObjectKey("c1", "e1")).toBe("evidence/c1/e1");
    expect(() =>
      validateEvidenceMeta({
        mediaType: "image/png",
        byteSize: 100,
        objectKey: "packages/x.zip",
        claimId: "c1",
        evidenceId: "e1",
      }),
    ).toThrowError(TakedownError);

    expect(() =>
      validateEvidenceMeta({
        mediaType: "image/png",
        byteSize: 100,
        objectKey: "evidence/c1/e1",
        claimId: "c1",
        evidenceId: "e1",
      }),
    ).not.toThrow();
  });

  it("rejects oversized or bad MIME evidence", () => {
    expect(() =>
      validateEvidenceMeta({
        mediaType: "application/x-msdownload",
        byteSize: 10,
        objectKey: "evidence/c1/e1",
        claimId: "c1",
        evidenceId: "e1",
      }),
    ).toThrowError(TakedownError);

    expect(() =>
      validateEvidenceMeta({
        mediaType: "image/png",
        byteSize: 20 * 1024 * 1024,
        objectKey: "evidence/c1/e1",
        claimId: "c1",
        evidenceId: "e1",
      }),
    ).toThrowError(TakedownError);
  });
});
