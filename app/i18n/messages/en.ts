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
  },
  theme: {
    related: "Related themes",
    by: "by",
    favorites: "Favorites",
    downloads: "Downloads",
  },
  policy: {
    terms: "Terms of Service",
    privacy: "Privacy Policy",
    copyright: "Copyright",
    about: "About",
  },
} as const;

/** Deep string map of the English catalog shape so locales can share keys. */
export type Messages = {
  readonly [K in keyof typeof messages]: {
    readonly [P in keyof (typeof messages)[K]]: string;
  };
};
