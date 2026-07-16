import type { Locale } from "~/i18n/config";
import { localePath } from "~/i18n/config";

export type JsonLd = Record<string, unknown>;

export type BreadcrumbItem = {
  name: string;
  path?: string;
};

export function absoluteUrl(origin: string, path: string): string {
  const base = origin.replace(/\/$/, "");
  if (!path || path === "/") return base;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function buildCreativeWork(options: {
  name: string;
  description: string;
  url: string;
  image?: string | null;
  creatorName: string;
  creatorUrl: string;
  dateModified?: number;
}): JsonLd {
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: options.name,
    description: options.description,
    url: options.url,
    author: {
      "@type": "Person",
      name: options.creatorName,
      url: options.creatorUrl,
    },
  };

  if (options.image) {
    node.image = options.image.startsWith("http") ? options.image : undefined;
  }

  if (options.dateModified) {
    node.dateModified = new Date(options.dateModified).toISOString();
  }

  return node;
}

export function buildPerson(options: {
  name: string;
  url: string;
  description?: string;
  image?: string | null;
}): JsonLd {
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: options.name,
    url: options.url,
  };

  if (options.description) {
    node.description = options.description;
  }
  if (options.image) {
    node.image = options.image;
  }

  return node;
}

export function buildBreadcrumbList(
  origin: string,
  items: BreadcrumbItem[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => {
      const entry: JsonLd = {
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
      };
      if (item.path) {
        entry.item = absoluteUrl(origin, item.path);
      }
      return entry;
    }),
  };
}

export function themeBreadcrumbs(options: {
  locale: Locale;
  homeLabel: string;
  themeName: string;
  themePath: string;
}): BreadcrumbItem[] {
  return [
    { name: options.homeLabel, path: localePath(options.locale) },
    { name: options.themeName, path: options.themePath },
  ];
}

export function creatorBreadcrumbs(options: {
  locale: Locale;
  homeLabel: string;
  creatorName: string;
  creatorPath: string;
}): BreadcrumbItem[] {
  return [
    { name: options.homeLabel, path: localePath(options.locale) },
    { name: options.creatorName, path: options.creatorPath },
  ];
}

export function taxonomyBreadcrumbs(options: {
  locale: Locale;
  homeLabel: string;
  label: string;
  path: string;
}): BreadcrumbItem[] {
  return [
    { name: options.homeLabel, path: localePath(options.locale) },
    { name: options.label, path: options.path },
  ];
}

/**
 * Collection / landing ItemList. Never include AggregateRating.
 */
export function buildItemList(options: {
  name: string;
  url: string;
  items: Array<{ name: string; url: string }>;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: options.name,
    url: options.url,
    numberOfItems: options.items.length,
    itemListElement: options.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}

export function buildComment(options: {
  text: string;
  authorName: string;
  dateCreated?: number;
}): JsonLd {
  const node: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Comment",
    text: options.text,
    author: {
      "@type": "Person",
      name: options.authorName,
    },
  };
  if (options.dateCreated) {
    node.dateCreated = new Date(options.dateCreated).toISOString();
  }
  return node;
}

/** Guard: structured data builders must never emit AggregateRating. */
export function assertNoAggregateRating(nodes: JsonLd | JsonLd[]): void {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  for (const node of list) {
    const raw = JSON.stringify(node);
    if (raw.includes("AggregateRating")) {
      throw new Error("aggregate_rating_forbidden");
    }
  }
}
