import { Country, State } from "country-state-city";
import type { StateOption } from "@shared/states";

const AFRICA_COUNTRY_CODES = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CD", "CG", "CI", "DJ",
  "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG",
  "MW", "ML", "MR", "MU", "YT", "MA", "MZ", "NA", "NE", "NG", "RE", "RW", "ST", "SN", "SC",
  "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "EH", "ZM", "ZW",
]);

/**
 * Returns first-level administrative divisions (state/province/region) for African countries.
 * Uses country-state-city data and returns [] when country has no subdivisions.
 */
export function getStatesForCountry(countryCode: string): StateOption[] {
  const code = String(countryCode || "").trim().toUpperCase();
  if (!code) return [];
  if (!AFRICA_COUNTRY_CODES.has(code)) return [];
  const states = State.getStatesOfCountry(code);
  return states
    .map((s) => ({
      code: String(s.isoCode || s.name),
      name: s.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

