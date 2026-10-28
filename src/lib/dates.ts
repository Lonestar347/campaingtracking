import { appConfig, statusConfig } from "@/lib/config";

const MS_PER_DAY = 86_400_000;

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Calendar day of `date` in the given time zone as a day number
 * (days since 1970-01-01). Makes day comparisons independent of the time of day.
 */
export function toDayNumber(date: Date, timeZone: string = statusConfig.timeZone): number {
  const [y, m, d] = dayFormatter(timeZone).format(date).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: Date, to: Date, timeZone: string = statusConfig.timeZone): number {
  return toDayNumber(to, timeZone) - toDayNumber(from, timeZone);
}

/** Formats a date in the app locale, e.g. 28/10/2026. */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return "–";
  return new Intl.DateTimeFormat(appConfig.locale, {
    timeZone: statusConfig.timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateRange(start: Date | null | undefined, end: Date | null | undefined): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** Formats an amount in EUR cents, e.g. 1234500 -> "€12,345.00". */
export function formatEuroCents(cents: number | null | undefined): string {
  if (cents == null) return "–";
  return new Intl.NumberFormat(appConfig.locale, {
    style: "currency",
    currency: appConfig.currency,
  }).format(cents / 100);
}
