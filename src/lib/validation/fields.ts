// Reusable Zod field schemas for form input (strings as typed by the user ->
// parsed values), with German error messages.

import { z } from "zod";
import { euroToCents, parseDateInput, parseGermanNumber } from "@/lib/format";

export const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v));

export const requiredText = (message: string) => z.string().trim().min(1, message);

export const optionalId = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v));

/** YYYY-MM-DD from a date input -> date-only Date (00:00 UTC). */
export function dateField(required: boolean) {
  return z.string().transform((value, ctx): Date | undefined => {
    if (value.trim() === "") {
      if (required) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Datum angeben" });
      return undefined;
    }
    const date = parseDateInput(value.trim());
    if (!date) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ungültiges Datum" });
    return date ?? undefined;
  });
}

/** Euro amount typed in German format -> cents. */
export const moneyField = z.string().transform((value, ctx): number | undefined => {
  if (value.trim() === "") return undefined;
  const euro = parseGermanNumber(value);
  if (euro == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ungültiger Betrag, z. B. 25.000 oder 1.500,50" });
    return undefined;
  }
  if (euro < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Betrag darf nicht negativ sein" });
    return undefined;
  }
  return euroToCents(euro);
});

export const urlField = z
  .string()
  .trim()
  .transform((value, ctx): string | undefined => {
    if (value === "") return undefined;
    try {
      const url = new URL(value);
      if (url.protocol === "http:" || url.protocol === "https:") return value;
    } catch {
      // fall through
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Vollständige URL angeben (https://…)" });
    return undefined;
  });

export interface KpiFormValues {
  clientId: string;
  name: string;
  target: string;
}

export const kpiRowSchema = z.object({
  clientId: z.string(),
  name: requiredText("KPI-Namen angeben"),
  target: z.string().transform((value, ctx): number => {
    const parsed = parseGermanNumber(value);
    if (parsed == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Zielwert als Zahl angeben" });
      return 0;
    }
    return parsed;
  }),
});

/** KPI rows with a duplicate-name check (case-insensitive). */
export const kpiRowsSchema = z.array(kpiRowSchema).superRefine((kpis, ctx) => {
  const seen = new Set<string>();
  kpis.forEach((kpi, index) => {
    const key = kpi.name.toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "name"], message: "KPI doppelt" });
    }
    seen.add(key);
  });
});

/** Adds an "end before start" issue at `endPath` when both dates are set. */
export function checkDateOrder(
  start: Date | undefined,
  end: Date | undefined,
  ctx: z.RefinementCtx,
  endPath: (string | number)[],
) {
  if (start && end && end < start) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: endPath, message: "Ende liegt vor dem Start" });
  }
}

/** Field path ("basis.name", "kpis.0.target") -> first error message. */
export type FieldErrors = Record<string, string>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    errors[issue.path.join(".")] ??= issue.message;
  }
  return errors;
}
