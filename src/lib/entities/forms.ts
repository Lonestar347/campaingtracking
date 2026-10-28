// Edit forms for channels and assets (detail panel of the mindmap): raw form
// values, Zod schemas, pre-filling from records, and change detection for the
// activity log.

import { z } from "zod";
import { ASSET_STATUSES, ASSET_TYPES, FUNNEL_STAGES, type FunnelStage } from "@/lib/domain/enums";
import { formatGermanNumber, toDateInput } from "@/lib/format";
import { parseKpiTargets } from "@/lib/validation";
import {
  checkDateOrder,
  dateField,
  kpiRowsSchema,
  optionalId,
  optionalText,
  requiredText,
  toFieldErrors,
  type FieldErrors,
  type KpiFormValues,
} from "@/lib/validation/fields";

// ---------------------------------------------------------------------------
// Channel

export interface ChannelEditValues {
  channelTypeId: string;
  name: string;
  funnelStage: string;
  ownerId: string;
  startDate: string;
  endDate: string;
  kpis: KpiFormValues[];
  notes: string;
}

export const channelEditSchema = z
  .object({
    channelTypeId: requiredText("Kanaltyp wählen"),
    name: requiredText("Namen angeben").max(120, "Maximal 120 Zeichen"),
    funnelStage: z.enum(FUNNEL_STAGES, { errorMap: () => ({ message: "Funnel-Stufe wählen" }) }),
    ownerId: optionalId,
    startDate: dateField(false),
    endDate: dateField(false),
    kpis: kpiRowsSchema,
    notes: optionalText,
  })
  .superRefine((c, ctx) => checkDateOrder(c.startDate, c.endDate, ctx, ["endDate"]));

export type ChannelEditInput = z.output<typeof channelEditSchema>;

export function emptyChannelForm(defaults: { funnelStage?: FunnelStage; channelTypeId?: string; name?: string } = {}): ChannelEditValues {
  return {
    channelTypeId: defaults.channelTypeId ?? "",
    name: defaults.name ?? "",
    funnelStage: defaults.funnelStage ?? "",
    ownerId: "",
    startDate: "",
    endDate: "",
    kpis: [],
    notes: "",
  };
}

export function channelFormFromRecord(channel: {
  channelTypeId: string;
  name: string;
  funnelStage: string;
  ownerId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  kpiTargets: unknown;
  notes: string | null;
}): ChannelEditValues {
  return {
    channelTypeId: channel.channelTypeId,
    name: channel.name,
    funnelStage: channel.funnelStage,
    ownerId: channel.ownerId ?? "",
    startDate: toDateInput(channel.startDate),
    endDate: toDateInput(channel.endDate),
    kpis: Object.entries(parseKpiTargets(channel.kpiTargets)).map(([name, target], index) => ({
      clientId: `k${index}`,
      name,
      target: formatGermanNumber(target, 4),
    })),
    notes: channel.notes ?? "",
  };
}

/** Database fields of a channel from validated input. */
export function channelDataFromInput(input: ChannelEditInput) {
  return {
    channelTypeId: input.channelTypeId,
    name: input.name,
    funnelStage: input.funnelStage,
    ownerId: input.ownerId ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    kpiTargets: Object.fromEntries(input.kpis.map((k) => [k.name, k.target])),
    notes: input.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Asset

export interface AssetEditValues {
  title: string;
  assetType: string;
  format: string;
  status: string;
  dueDate: string;
  ownerId: string;
  approverId: string;
  notes: string;
}

export const assetEditSchema = z.object({
  title: requiredText("Titel angeben").max(200, "Maximal 200 Zeichen"),
  assetType: z.enum(ASSET_TYPES, { errorMap: () => ({ message: "Asset-Typ wählen" }) }),
  format: optionalText,
  status: z.enum(ASSET_STATUSES, { errorMap: () => ({ message: "Status wählen" }) }),
  dueDate: dateField(false),
  ownerId: optionalId,
  approverId: optionalId,
  notes: optionalText,
});

export type AssetEditInput = z.output<typeof assetEditSchema>;

export function emptyAssetForm(): AssetEditValues {
  return { title: "", assetType: "", format: "", status: "IDEE", dueDate: "", ownerId: "", approverId: "", notes: "" };
}

export function assetFormFromRecord(asset: {
  title: string;
  assetType: string;
  format: string | null;
  status: string;
  dueDate: Date | null;
  ownerId: string | null;
  approverId: string | null;
  notes: string | null;
}): AssetEditValues {
  return {
    title: asset.title,
    assetType: asset.assetType,
    format: asset.format ?? "",
    status: asset.status,
    dueDate: toDateInput(asset.dueDate),
    ownerId: asset.ownerId ?? "",
    approverId: asset.approverId ?? "",
    notes: asset.notes ?? "",
  };
}

export function assetDataFromInput(input: AssetEditInput) {
  return {
    title: input.title,
    assetType: input.assetType,
    format: input.format ?? null,
    status: input.status,
    dueDate: input.dueDate ?? null,
    ownerId: input.ownerId ?? null,
    approverId: input.approverId ?? null,
    notes: input.notes ?? null,
  };
}

// ---------------------------------------------------------------------------
// Validation and change detection

export function validate<T extends z.ZodTypeAny>(
  schema: T,
  values: unknown,
): { success: true; data: z.output<T> } | { success: false; errors: FieldErrors } {
  const result = schema.safeParse(values);
  return result.success ? { success: true, data: result.data } : { success: false, errors: toFieldErrors(result.error) };
}

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === undefined) return null;
  return value;
}

/** Fields whose values differ between a record and its update (dates compared by day). */
export function diffFields<T extends Record<string, unknown>>(before: T, after: Partial<T>): FieldChange[] {
  return Object.keys(after)
    .filter((field) => JSON.stringify(normalize(before[field])) !== JSON.stringify(normalize(after[field])))
    .map((field) => ({ field, from: normalize(before[field]), to: normalize(after[field]) }));
}
