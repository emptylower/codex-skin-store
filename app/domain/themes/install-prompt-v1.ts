import {
  MACOS_TARGET,
  TARGET_RUNTIME_PINS,
  WINDOWS_TARGET,
  resolveEmitPlatforms,
  type Platform,
} from "~/domain/themes/compatibility";

export const INSTALL_PROHIBITION =
  "Do not modify app.asar, WindowsApps, application signatures, API keys, Base URLs, or model providers.";

export type InstallFileHash = {
  path: string;
  sha256: string;
};

export type InstallPromptInput = {
  themeId: string;
  version: number;
  name: string;
  attribution?: string;
  platforms: readonly Platform[];
  mediaType: "static" | "animated";
  payloadDigest: string;
  fileHashes: readonly InstallFileHash[];
};

function escapeField(value: string): string {
  return value.replace(/[\r\n`|]/g, " ").trim();
}

function selectedMatrix(input: InstallPromptInput): {
  platforms: Platform[];
  targets: string[];
} {
  const platforms = resolveEmitPlatforms({
    platforms: input.platforms,
    mediaType: input.mediaType,
  });
  const targets: string[] = [];
  if (platforms.includes("macos")) targets.push(MACOS_TARGET);
  if (platforms.includes("windows")) targets.push(WINDOWS_TARGET);
  return { platforms, targets };
}

/**
 * Immutable machine-oriented install prompt v1.
 * Creator free text never enters except escaped name/attribution.
 */
export function renderInstallPrompt(input: InstallPromptInput): string {
  const { platforms, targets } = selectedMatrix(input);
  const name = escapeField(input.name);
  const attribution = escapeField(input.attribution ?? "");
  const files = [...input.fileHashes]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `- ${f.path}: ${f.sha256}`)
    .join("\n");

  const platformLines = platforms
    .map((p) => {
      const target = p === "macos" ? MACOS_TARGET : WINDOWS_TARGET;
      const pin = TARGET_RUNTIME_PINS[target];
      return `- platform=${p} target=${target} runtime_commit=${pin.commit}`;
    })
    .join("\n");

  return [
    "# Codex Skin Install Prompt v1",
    "",
    `theme_id: ${input.themeId}`,
    `version: ${input.version}`,
    `name: ${name}`,
    attribution ? `attribution: ${attribution}` : null,
    `payload_digest: ${input.payloadDigest}`,
    "",
    "## Selected platforms",
    platformLines || "- (none)",
    "",
    "## Compatibility targets",
    ...targets.map((t) => `- ${t}`),
    "",
    "## File hashes",
    files || "- (none)",
    "",
    "## Ordered instructions",
    "1. Detect the host OS and map it to a selected platform above.",
    "2. Require the official Codex app plus the pinned target runtime for that platform.",
    "3. Stop immediately if any prerequisite is missing.",
    "4. Back up existing theme state before making changes.",
    "5. Verify every listed file hash before copy.",
    "6. Copy only the detected adapter and assets for the selected platform.",
    "7. Run the supported Dream Skin install command for that runtime only.",
    "8. Verify installation succeeded; report exact failures without inventing fixes.",
    "",
    "## Prohibitions",
    INSTALL_PROHIBITION,
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Human-readable INSTALL.md generated from the same platform matrix.
 */
export function renderInstallMarkdown(input: InstallPromptInput): string {
  const { platforms, targets } = selectedMatrix(input);
  const name = escapeField(input.name);
  const attribution = escapeField(input.attribution ?? "");

  const platformSections = platforms
    .map((p) => {
      const target = p === "macos" ? MACOS_TARGET : WINDOWS_TARGET;
      const pin = TARGET_RUNTIME_PINS[target];
      const adapterPath =
        p === "macos"
          ? "adapters/macos/theme.json"
          : "adapters/windows/theme.json";
      return [
        `### ${p === "macos" ? "macOS" : "Windows"}`,
        "",
        `- Compatibility target: \`${target}\``,
        `- Runtime pin: \`${pin.commit}\``,
        `- Adapter: \`${adapterPath}\``,
        `- Background asset: package root image referenced by the adapter`,
        `- Preview: \`preview.jpg\``,
        "",
        "Steps:",
        "1. Install official Codex and the matching Dream Skin runtime.",
        "2. Confirm prerequisites, then back up your current skin state.",
        "3. Verify package file hashes against the list below.",
        "4. Copy only this platform's adapter and assets.",
        "5. Run the supported install command and confirm the theme loads.",
        "",
      ].join("\n");
    })
    .join("\n");

  const hashes = [...input.fileHashes]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `| \`${f.path}\` | \`${f.sha256}\` |`)
    .join("\n");

  return [
    `# Install ${name}`,
    "",
    `Theme ID: \`${input.themeId}\`  `,
    `Version: \`${input.version}\`  `,
    `Payload digest: \`${input.payloadDigest}\``,
    attribution ? `Attribution: ${attribution}` : null,
    "",
    "## Supported platforms",
    platforms.length ? platforms.map((p) => `- ${p}`).join("\n") : "- none",
    "",
    "## Compatibility targets",
    targets.map((t) => `- \`${t}\``).join("\n") || "- none",
    "",
    "## Platform matrix",
    "",
    platformSections || "_No platforms selected._",
    "",
    "## File hashes",
    "",
    "| Path | SHA-256 |",
    "| --- | --- |",
    hashes || "| _(none)_ | |",
    "",
    "## Safety",
    "",
    INSTALL_PROHIBITION,
    "",
    "Creator description text is intentionally omitted from install instructions.",
    "",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
