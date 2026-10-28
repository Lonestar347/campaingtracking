// Reusable Zod field schemas for form input (strings as typed by the user ->
// parsed values), with user-facing error messages.

import { z } from "zod";
import { euroToCents, parseDateInput, parseNumberInput } from "@/lib/format";

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
      if (required) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a date" });
      return undefined;
    }
    const date = parseDateInput(value.trim());
    if (!date) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid date" });
    return date ?? undefined;
  });
}

/** Euro amount as typed by the user -> cents. */
export const moneyField = z.string().transform((value, ctx): number | undefined => {
  if (value.trim() === "") return undefined;
  const euro = parseNumberInput(value);
  if (euro == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid amount, e.g. 25,000 or 1,500.50" });
    return undefined;
  }
  if (euro < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Amount must not be negative" });
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
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a full URL (https://…)" });
    return undefined;
  });

export interface KpiFormValues {
  clientId: string;
  name: string;
  target: string;
}

export const kpiRowSchema = z.object({
  clientId: z.string(),
  name: requiredText("Enter a KPI name"),
  target: z.string().transform((value, ctx): number => {
    const parsed = parseNumberInput(value);
    if (parsed == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter the target as a number" });
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
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "name"], message: "Duplicate KPI" });
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
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: endPath, message: "End is before start" });
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
