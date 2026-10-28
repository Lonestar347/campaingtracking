// Parsing and formatting helpers for user input.

import { appConfig } from "@/lib/config";

/**
 * Parses a number typed in English format: "12,345.50" -> 12345.5,
 * "1500" -> 1500, "0.5" -> 0.5. Currency/percent signs and spaces are
 * ignored. Returns null for empty or invalid input.
 */
export function parseNumberInput(input: string): number | null {
  const trimmed = input.trim().replace(/\s|€|%/g, "");
  if (trimmed === "") return null;
  if (!/^-?[\d,]*(\.\d+)?$/.test(trimmed)) return null;
  // Commas are thousands separators only if they group digits in threes.
  const [intPart, fracPart] = trimmed.split(".");
  if (intPart.includes(",") && !/^-?\d{1,3}(,\d{3})+$/.test(intPart)) return null;
  const normalized = intPart.replace(/,/g, "") + (fracPart != null ? `.${fracPart}` : "");
  if (normalized === "" || normalized === "-") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Formats a number for display and input, e.g. 12345.5 -> "12,345.5". */
export function formatNumber(value: number | null | undefined, maxFractionDigits = 2): string {
  if (value == null) return "";
  return new Intl.NumberFormat(appConfig.locale, { maximumFractionDigits: maxFractionDigits }).format(value);
}

/** Euro amount -> integer cents, avoiding floating point drift. */
export function euroToCents(euro: number): number {
  return Math.round(euro * 100);
}

/** URL-safe slug; German umlauts are transliterated: "Frühjahr Aktion" -> "fruehjahr-aktion". */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Converts a date input value (YYYY-MM-DD) to a date-only Date at 00:00 UTC. */
export function parseDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject overflow like 2026-02-31
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

/** Date-only Date -> date input value (YYYY-MM-DD). */
export function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}
