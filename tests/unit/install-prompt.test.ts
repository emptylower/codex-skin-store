import { describe, expect, it } from "vitest";

import { MACOS_TARGET, WINDOWS_TARGET } from "~/domain/themes/compatibility";
import {
  INSTALL_PROHIBITION,
  renderInstallMarkdown,
  renderInstallPrompt,
} from "~/domain/themes/install-prompt-v1";

const fixture = {
  themeId: "theme-1",
  version: 1,
  name: "Neon Road",
  attribution: "Studio Neon",
  platforms: ["macos", "windows"] as const,
  mediaType: "static" as const,
  payloadDigest: "c".repeat(64),
  fileHashes: [
    { path: "manifest.json", sha256: "d".repeat(64) },
    { path: "preview.jpg", sha256: "e".repeat(64) },
    { path: "adapters/macos/theme.json", sha256: "f".repeat(64) },
  ],
};

describe("install prompt v1", () => {
  it("contains the fixed safety prohibition and identity fields", () => {
    const prompt = renderInstallPrompt(fixture);
    expect(prompt).toContain(INSTALL_PROHIBITION);
    expect(prompt).toContain(
      "Do not modify app.asar, WindowsApps, application signatures, API keys, Base URLs, or model providers.",
    );
    expect(prompt).toContain("theme_id: theme-1");
    expect(prompt).toContain("version: 1");
    expect(prompt).toContain(`payload_digest: ${fixture.payloadDigest}`);
    expect(prompt).toContain(MACOS_TARGET);
    expect(prompt).toContain(WINDOWS_TARGET);
  });

  it("covers macOS-only, Windows-only, dual static, and Windows animated", () => {
    const macOnly = renderInstallPrompt({
      ...fixture,
      platforms: ["macos"],
    });
    expect(macOnly).toContain("platform=macos");
    expect(macOnly).not.toContain("platform=windows");

    const winOnly = renderInstallPrompt({
      ...fixture,
      platforms: ["windows"],
    });
    expect(winOnly).toContain("platform=windows");
    expect(winOnly).not.toContain("platform=macos");

    const dual = renderInstallPrompt(fixture);
    expect(dual).toContain("platform=macos");
    expect(dual).toContain("platform=windows");

    const animated = renderInstallPrompt({
      ...fixture,
      mediaType: "animated",
      platforms: ["windows"],
    });
    expect(animated).toContain("platform=windows");
    expect(animated).not.toContain("platform=macos");

    // Animated never emits macOS even if listed.
    const coerced = renderInstallPrompt({
      ...fixture,
      mediaType: "animated",
      platforms: ["macos", "windows"],
    });
    expect(coerced).toContain("platform=windows");
    expect(coerced).not.toContain("platform=macos");
  });

  it("renders INSTALL.md from the same platform matrix", () => {
    const md = renderInstallMarkdown(fixture);
    expect(md).toContain("# Install Neon Road");
    expect(md).toContain(INSTALL_PROHIBITION);
    expect(md).toContain(MACOS_TARGET);
    expect(md).toContain(WINDOWS_TARGET);
    expect(md).toContain("adapters/macos/theme.json");
    expect(md).toContain("adapters/windows/theme.json");
    expect(md).toContain(fixture.payloadDigest);
    expect(md).toContain("manifest.json");

    const animatedMd = renderInstallMarkdown({
      ...fixture,
      mediaType: "animated",
      platforms: ["macos", "windows"],
    });
    expect(animatedMd).toContain("### Windows");
    expect(animatedMd).not.toContain("### macOS");
  });

  it("escapes creator fields and omits free-form description from instructions", () => {
    const prompt = renderInstallPrompt({
      ...fixture,
      name: "Neon|Road\nDrop",
      attribution: "A`ttr|ib",
    });
    expect(prompt).not.toContain("Neon|Road\nDrop");
    expect(prompt).toContain("name: Neon Road Drop");
    expect(prompt).not.toContain("high-contrast night drive");
  });
});
