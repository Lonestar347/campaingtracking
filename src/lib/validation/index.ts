import { z } from "zod";
import {
  ASSET_STATUSES,
  ASSET_TYPES,
  EXECUTION_TYPES,
  FUNNEL_STAGES,
  LINK_TYPES,
  MARKETS,
  USER_ROLES,
} from "@/lib/domain/enums";

export const funnelStageSchema = z.enum(FUNNEL_STAGES);
export const assetStatusSchema = z.enum(ASSET_STATUSES);
export const assetTypeSchema = z.enum(ASSET_TYPES);
export const userRoleSchema = z.enum(USER_ROLES);
export const executionTypeSchema = z.enum(EXECUTION_TYPES);
export const linkTypeSchema = z.enum(LINK_TYPES);

export const marketsSchema = z.array(z.enum(MARKETS)).min(1, "Mindestens einen Markt auswählen");
export const partnersSchema = z.array(z.string().trim().min(1));

/** KPI name -> target value. */
export const kpiTargetsSchema = z.record(z.string().trim().min(1), z.number().finite());
export type KpiTargets = z.infer<typeof kpiTargetsSchema>;

const optionalText = z.string().trim().optional();

/**
 * Content of a launch charter that is not already a column on Campaign
 * (basis data like name, dates and markets lives on the campaign itself).
 */
export const launchCharterDataSchema = z.object({
  strategy: z.object({
    objective: optionalText,
    targetAudience: optionalText,
    keyMessage: optionalText,
    insight: optionalText,
    reasonToBelieve: optionalText,
  }),
  budget: z.object({
    totalCents: z.number().int().nonnegative().optional(),
    byFunnelStageCents: z.record(funnelStageSchema, z.number().int().nonnegative()).optional(),
  }),
  links: z
    .object({
      frontify: z.string().url().optional(),
      sharepoint: z.string().url().optional(),
      lookerStudio: z.string().url().optional(),
    })
    .default({}),
  stakeholders: z
    .array(
      z.object({
        team: z.string().trim().min(1),
        people: z.array(z.string().trim().min(1)).default([]),
        role: optionalText,
      }),
    )
    .default([]),
  approvalProcess: optionalText,
});
export type LaunchCharterData = z.infer<typeof launchCharterDataSchema>;

/** Parses a Json column that should contain a string list; falls back to []. */
export function parseStringList(value: unknown): string[] {
  const result = z.array(z.string()).safeParse(value);
  return result.success ? result.data : [];
}

export function parseKpiTargets(value: unknown): KpiTargets {
  const result = kpiTargetsSchema.safeParse(value);
  return result.success ? result.data : {};
}
