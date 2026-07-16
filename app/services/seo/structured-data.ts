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
