import { createRequire } from "node:module";
import { join } from "node:path";
import type { CountryOption } from "@shared/countries";

// Resolve from project root so this works in dev (tsx), prod (node dist/index.cjs from repo root), and CJS bundle.
const require = createRequire(join(process.cwd(), "package.json"));

// i18n-iso-countries is CommonJS; load once at module init.
const i18nCountries = require("i18n-iso-countries") as typeof import("i18n-iso-countries");
const enLocale = require("i18n-iso-countries/langs/en.json") as import("i18n-iso-countries").LocaleData;

i18nCountries.registerLocale(enLocale);

let cached: CountryOption[] | null = null;

/** All officially assigned ISO 3166-1 alpha-2 countries, English official names, sorted by name. */
export function getCountriesList(): CountryOption[] {
  if (cached) return cached;
  const names = i18nCountries.getNames("en", { select: "official" }) as Record<string, string>;
  cached = Object.entries(names)
    .map(([code, name]) => ({ code, name: String(name) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  return cached;
}
