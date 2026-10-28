// Launch charter wizard: raw form values (strings, as typed by the user), the
// Zod schema that validates and parses them, and the mapping of validation
// issues to wizard steps.

import { z } from "zod";
import {
  checkDateOrder,
  dateField,
  kpiRowsSchema,
  moneyField,
  optionalId,
  optionalText,
  requiredText,
  toFieldErrors,
  urlField,
  type FieldErrors,
  type KpiFormValues,
} from "@/lib/validation/fields";
import {
  ASSET_TYPES,
  EXECUTION_TYPES,
  FUNNEL_STAGES,
  MARKETS,
  type FunnelStage,
} from "@/lib/domain/enums";

// ---------------------------------------------------------------------------
// Raw form values

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
// Schemas (string in, parsed value out)

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
    kpis: kpiRowsSchema,
    assets: z.array(assetSchema),
  })
  .superRefine((channel, ctx) => checkDateOrder(channel.startDate, channel.endDate, ctx, ["endDate"]));

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
    checkDateOrder(form.basis.startDate, form.basis.endDate, ctx, ["basis", "endDate"]);
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

export type { FieldErrors, KpiFormValues };

/** Which wizard step a field path belongs to. */
export function stepForPath(path: string): WizardStepId {
  const [head, , third] = path.split(".");
  if (head === "channels") return third === "assets" ? "assets" : "channels";
  if (head === "approvalProcess") return "stakeholders";
  if (head === "changeNote") return "review";
  return head as WizardStepId;
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
