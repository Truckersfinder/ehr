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
const AFRICA_COUNTRY_CODES = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CD", "CG", "CI", "DJ",
  "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG",
  "MW", "ML", "MR", "MU", "YT", "MA", "MZ", "NA", "NE", "NG", "RE", "RW", "ST", "SN", "SC",
  "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "EH", "ZM", "ZW",
]);

/** African ISO 3166-1 alpha-2 countries, English official names, sorted by name. */
export function getCountriesList(): CountryOption[] {
  if (cached) return cached;
  const names = i18nCountries.getNames("en", { select: "official" }) as Record<string, string>;
  cached = Object.entries(names)
    .filter(([code]) => AFRICA_COUNTRY_CODES.has(code.toUpperCase()))
    .map(([code, name]) => ({ code, name: String(name) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  return cached;
}
