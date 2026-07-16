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
    platform: "Platform",
  },
  preview: {
    home: "Home",
    task: "Task",
  },
  theme: {
    related: "Related themes",
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
