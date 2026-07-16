import type { Locale } from "../config";
import { messages as en } from "./en";
import type { Messages } from "./en";
import { messages as zhHans } from "./zh-hans";

const catalogs: Record<Locale, Messages> = {
  en,
  "zh-hans": zhHans,
};

export type { Messages };

export function getMessages(locale: Locale): Messages {
  return catalogs[locale];
}
