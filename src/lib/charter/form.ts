// Launch charter wizard: raw form values (strings, as typed by the user), the
// Zod schema that validates and parses them, and the mapping of validation
// issues to wizard steps.

import { z } from "zod";
import { euroToCents, parseDateInput, parseGermanNumber } from "@/lib/format";
import {
  ASSET_TYPES,
  EXECUTION_TYPES,
  FUNNEL_STAGES,
  MARKETS,
  type FunnelStage,
} from "@/lib/domain/enums";

// ---------------------------------------------------------------------------
// Raw form values

export interface KpiFormValues {
  clientId: string;
  name: string;
  target: string;
}

export interface AssetFormValues {
  clientId: string;
  title: string;
  assetType: string;
  format: string;
  dueDate: string;
  ownerId: string;
}

export interface ChannelFormValues {
  clientId: string;
  channelTypeId: string;
  funnelStage: FunnelStage;
  name: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  kpis: KpiFormValues[];
  assets: AssetFormValues[];
}

export interface StakeholderFormValues {
  clientId: string;
  team: string;
  people: string; // comma separated
  role: string;
}

export interface CharterFormValues {
  basis: {
    name: string;
    description: string;
    brand: string;
    productLine: string;
    markets: string[];
    startDate: string;
    endDate: string;
    ownerId: string;
    executionType: string;
    partners: string; // one per line
  };
  strategy: {
    objective: string;
    targetAudience: string;
    keyMessage: string;
    insight: string;
    reasonToBelieve: string;
  };
  budget: {
    total: string;
    byStage: Record<FunnelStage, string>;
  };
  channels: ChannelFormValues[];
  links: {
    frontify: string;
    sharepoint: string;
    lookerStudio: string;
  };
  stakeholders: StakeholderFormValues[];
  approvalProcess: string;
  changeNote: string;
}

export function emptyCharterForm(defaults: { ownerId?: string } = {}): CharterFormValues {
  return {
    basis: {
      name: "",
      description: "",
      brand: "",
      productLine: "",
      markets: [],
      startDate: "",
      endDate: "",
      ownerId: defaults.ownerId ?? "",
      executionType: "",
      partners: "",
    },
    strategy: { objective: "", targetAudience: "", keyMessage: "", insight: "", reasonToBelieve: "" },
    budget: { total: "", byStage: { AWARENESS: "", CONSIDERATION: "", SALES: "" } },
    channels: [],
    links: { frontify: "", sharepoint: "", lookerStudio: "" },
    stakeholders: [],
    approvalProcess: "",
    changeNote: "",
  };
}

// ---------------------------------------------------------------------------
// Field schemas (string in, parsed value out)

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v));

const requiredText = (message: string) => z.string().trim().min(1, message);

const optionalId = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v));

function dateField(required: boolean) {
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
const moneyField = z.string().transform((value, ctx): number | undefined => {
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

const urlField = z
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

const kpiSchema = z.object({
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

const assetSchema = z.object({
  clientId: z.string(),
  title: requiredText("Titel angeben"),
  assetType: z.enum(ASSET_TYPES, { errorMap: () => ({ message: "Asset-Typ wählen" }) }),
  format: optionalText,
  dueDate: dateField(false),
  ownerId: optionalId,
});

const channelSchema = z
  .object({
    clientId: z.string(),
    channelTypeId: requiredText("Kanaltyp fehlt"),
    funnelStage: z.enum(FUNNEL_STAGES),
    name: requiredText("Namen angeben"),
    ownerId: optionalId,
    startDate: dateField(false),
    endDate: dateField(false),
    kpis: z.array(kpiSchema),
    assets: z.array(assetSchema),
  })
  .superRefine((channel, ctx) => {
    if (channel.startDate && channel.endDate && channel.endDate < channel.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "Ende liegt vor dem Start" });
    }
    const seen = new Set<string>();
    channel.kpis.forEach((kpi, index) => {
      const key = kpi.name.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["kpis", index, "name"], message: "KPI doppelt" });
      }
      seen.add(key);
    });
  });

const stakeholderSchema = z.object({
  clientId: z.string(),
  team: requiredText("Team angeben"),
  people: z.string().transform((v) =>
    v
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
  ),
  role: optionalText,
});

export const charterFormSchema = z
  .object({
    basis: z.object({
      name: requiredText("Kampagnennamen angeben").max(120, "Maximal 120 Zeichen"),
      description: optionalText,
      brand: optionalText,
      productLine: optionalText,
      markets: z
        .array(z.enum(MARKETS))
        .min(1, "Mindestens einen Markt auswählen"),
      startDate: dateField(true),
      endDate: dateField(true),
      ownerId: requiredText("Owner auswählen"),
      executionType: z.enum(EXECUTION_TYPES, {
        errorMap: () => ({ message: "Agentur, Inhouse oder Gemischt wählen" }),
      }),
      partners: z.string().transform((v) =>
        v
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    }),
    strategy: z.object({
      objective: optionalText,
      targetAudience: optionalText,
      keyMessage: optionalText,
      insight: optionalText,
      reasonToBelieve: optionalText,
    }),
    budget: z.object({
      total: moneyField,
      byStage: z.object({
        AWARENESS: moneyField,
        CONSIDERATION: moneyField,
        SALES: moneyField,
      }),
    }),
    channels: z.array(channelSchema),
    links: z.object({
      frontify: urlField,
      sharepoint: urlField,
      lookerStudio: urlField,
    }),
    stakeholders: z.array(stakeholderSchema),
    approvalProcess: optionalText,
    changeNote: optionalText,
  })
  .superRefine((form, ctx) => {
    const { startDate, endDate } = form.basis;
    if (startDate && endDate && endDate < startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["basis", "endDate"],
        message: "Ende liegt vor dem Start",
      });
    }
    const split = Object.values(form.budget.byStage).reduce<number>((sum, v) => sum + (v ?? 0), 0);
    if (form.budget.total != null && split > form.budget.total) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["budget", "byStage"],
        message: "Die Aufteilung ist höher als das Gesamtbudget",
      });
    }
  });

export type CharterInput = z.output<typeof charterFormSchema>;

// ---------------------------------------------------------------------------
// Wizard steps and error mapping

export const WIZARD_STEPS = [
  { id: "basis", title: "Basis" },
  { id: "strategy", title: "Strategie" },
  { id: "budget", title: "Budget" },
  { id: "channels", title: "Kanäle" },
  { id: "assets", title: "Assets" },
  { id: "links", title: "Links" },
  { id: "stakeholders", title: "Stakeholder" },
  { id: "review", title: "Prüfen" },
] as const;
export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

/** Field path ("basis.name", "channels.0.assets.1.title") -> error message. */
export type FieldErrors = Record<string, string>;

/** Which wizard step a field path belongs to. */
export function stepForPath(path: string): WizardStepId {
  const [head, , third] = path.split(".");
  if (head === "channels") return third === "assets" ? "assets" : "channels";
  if (head === "approvalProcess") return "stakeholders";
  if (head === "changeNote") return "review";
  return head as WizardStepId;
}

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    errors[key] ??= issue.message;
  }
  return errors;
}

export function errorsForStep(errors: FieldErrors, step: WizardStepId): FieldErrors {
  return Object.fromEntries(Object.entries(errors).filter(([path]) => stepForPath(path) === step));
}

/** Validates the whole form and returns either the parsed input or all field errors. */
export function validateCharterForm(
  values: CharterFormValues,
): { success: true; data: CharterInput } | { success: false; errors: FieldErrors } {
  const result = charterFormSchema.safeParse(values);
  return result.success ? { success: true, data: result.data } : { success: false, errors: toFieldErrors(result.error) };
}
