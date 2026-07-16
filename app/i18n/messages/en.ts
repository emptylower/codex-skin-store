export const messages = {
  nav: {
    explore: "Explore",
    upload: "Upload",
  },
  actions: {
    download: "Download",
    copyPrompt: "Copy Prompt",
  },
  filters: {
    heading: "Filters",
    platform: "Platform",
    mode: "Mode",
    media: "Media",
    sort: "Sort",
    search: "Search",
    any: "Any",
    apply: "Apply filters",
    platformMacos: "macOS",
    platformWindows: "Windows",
    platformBoth: "Both",
    modeLight: "Light",
    modeDark: "Dark",
    mediaStatic: "Static",
    mediaAnimated: "Animated",
    sortTrending: "Trending",
    sortNewest: "Newest",
    sortDownloads: "Downloads",
  },
  marketplace: {
    heading: "Codex theme marketplace",
    lede: "Browse free community themes for Codex Desktop.",
    description: "Discover and preview free Codex Desktop themes.",
    simulator: "Codex simulator",
    grid: "Themes",
    empty: "No themes match these filters.",
    filterError: "Some filter values are invalid. Adjust them and try again.",
  },
  preview: {
    home: "Home",
    task: "Task",
    tablist: "Codex views",
  },
  theme: {
    related: "Related themes",
    by: "by",
    favorites: "Favorites",
    downloads: "Downloads",
    overview: "Overview",
    facts: "Theme facts",
    description: "Description",
    compatibility: "Compatibility",
    license: "License",
    licenseFallback: "See package",
    version: "Version",
    package: "Package overview",
    packageStatus: "Status",
    packageReady: "ready",
    packageKey: "Package key",
    payloadDigest: "Payload digest",
    archiveDigest: "Archive digest",
    palette: "Palette",
    focal: "Focal point",
    author: "Author",
    installPrerequisites:
      "Requires Codex Desktop for macOS or Windows. Apply themes using the official Codex install flow for your platform.",
  },
  creator: {
    themes: "Public themes",
    empty: "This creator has no public themes yet.",
  },
  taxonomy: {
    themes: "Themes",
    empty: "No themes are tagged with this taxonomy yet.",
  },
  breadcrumbs: {
    home: "Home",
  },
  auth: {
    signIn: "Sign in",
    profile: "Your profile",
  },
  policy: {
    terms: "Terms of Service",
    termsBody:
      "Codex Skin Store is a community marketplace for free Codex Desktop themes. By using this site you agree to share only content you have rights to publish, respect other creators, and accept that listings may be moderated or removed for safety, copyright, or policy reasons. The store does not sell theme packages.",
    privacy: "Privacy Policy",
    privacyBody:
      "We process the minimum data needed to operate a bilingual public marketplace: theme catalog content, public creator profiles, and technical logs required for security and reliability. Do not upload personal data in theme assets or descriptions. Contact the operators if you need a data-related request handled.",
    copyright: "Copyright",
    copyrightBody:
      "Creators retain rights to their original theme assets and manifests. Do not upload material you do not own or license. Copyright concerns may be reported through the store's copyright process. Infringing themes can be removed and related accounts restricted.",
    about: "About",
    aboutBody:
      "Codex Skin Store helps people discover and preview free community themes for Codex Desktop. The public marketplace is bilingual (English and Simplified Chinese) and focuses on transparent theme facts, controlled taxonomy, and crawlable pages.",
  },
} as const;

/** Deep string map of the English catalog shape so locales can share keys. */
export type Messages = {
  readonly [K in keyof typeof messages]: {
    readonly [P in keyof (typeof messages)[K]]: string;
  };
};
