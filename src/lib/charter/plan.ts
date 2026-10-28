// Turns a validated charter into everything that gets created for a campaign:
// campaign columns, the charter document, campaign links, channels and assets.
// Pure function, so the generation logic is testable without a database.

import type { AssetType, FunnelStage, LinkType } from "@/lib/domain/enums";
import type { LaunchCharterData } from "@/lib/validation";
import type { CharterInput } from "@/lib/charter/form";
import { toLookerEmbedUrl } from "@/lib/links";

export const CHARTER_LINK_DEFS: readonly { key: keyof CharterInput["links"]; type: LinkType; label: string }[] = [
  { key: "frontify", type: "frontify", label: "Frontify folder" },
  { key: "sharepoint", type: "sharepoint", label: "SharePoint folder" },
  { key: "lookerStudio", type: "looker_studio", label: "Looker Studio report" },
];

export interface PlannedAsset {
  title: string;
  assetType: AssetType;
  format: string | null;
  status: "IDEA";
  dueDate: Date | null;
  ownerId: string | null;
  sortOrder: number;
}

export interface PlannedChannel {
  channelTypeId: string;
  funnelStage: FunnelStage;
  name: string;
  ownerId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  kpiTargets: Record<string, number>;
  sortOrder: number;
  assets: PlannedAsset[];
}

export interface CampaignFields {
  name: string;
  description: string | null;
  objective: string | null;
  keyMessage: string | null;
  startDate: Date;
  endDate: Date;
  budgetCents: number | null;
  markets: string[];
  brand: string | null;
  productLine: string | null;
  ownerId: string;
  partners: string[];
  executionType: string;
}

export interface CampaignPlan {
  campaign: CampaignFields;
  charterData: LaunchCharterData;
  links: { type: LinkType; url: string; label: string; embed: boolean }[];
  channels: PlannedChannel[];
}

/** Campaign columns that mirror the charter's basis and strategy. */
export function campaignFieldsFromCharter(input: CharterInput): CampaignFields {
  const { basis, strategy, budget } = input;
  return {
    name: basis.name,
    description: basis.description ?? null,
    objective: strategy.objective ?? null,
    keyMessage: strategy.keyMessage ?? null,
    // Required by the schema; non-null after successful validation.
    startDate: basis.startDate!,
    endDate: basis.endDate!,
    budgetCents: budget.total ?? null,
    markets: basis.markets,
    brand: basis.brand ?? null,
    productLine: basis.productLine ?? null,
    ownerId: basis.ownerId,
    partners: basis.partners,
    executionType: basis.executionType,
  };
}

/** The charter document stored (and versioned) in LaunchCharter.data. */
export function charterDataFromInput(input: CharterInput): LaunchCharterData {
  const byStage = Object.fromEntries(
    Object.entries(input.budget.byStage).filter(([, cents]) => cents != null),
  ) as Partial<Record<FunnelStage, number>>;
  const fields = campaignFieldsFromCharter(input);

  return {
    basis: {
      name: fields.name,
      description: input.basis.description,
      brand: input.basis.brand,
      productLine: input.basis.productLine,
      markets: input.basis.markets,
      startDate: fields.startDate.toISOString().slice(0, 10),
      endDate: fields.endDate.toISOString().slice(0, 10),
      ownerId: fields.ownerId,
      executionType: input.basis.executionType,
      partners: input.basis.partners,
    },
    strategy: input.strategy,
    budget: {
      totalCents: input.budget.total,
      byFunnelStageCents: Object.keys(byStage).length > 0 ? byStage : undefined,
    },
    links: input.links,
    stakeholders: input.stakeholders.map(({ team, people, role }) => ({ team, people, role })),
    approvalProcess: input.approvalProcess,
  };
}

export function buildCampaignPlan(input: CharterInput): CampaignPlan {
  return {
    campaign: campaignFieldsFromCharter(input),
    charterData: charterDataFromInput(input),
    links: CHARTER_LINK_DEFS.flatMap(({ key, type, label }) => {
      const url = input.links[key];
      // Looker Studio reports from the charter are embedded in the performance tab when possible.
      return url ? [{ type, url, label, embed: type === "looker_studio" && toLookerEmbedUrl(url) != null }] : [];
    }),
    channels: input.channels.map((channel, channelIndex) => ({
      channelTypeId: channel.channelTypeId,
      funnelStage: channel.funnelStage,
      name: channel.name,
      ownerId: channel.ownerId ?? null,
      startDate: channel.startDate ?? null,
      endDate: channel.endDate ?? null,
      kpiTargets: Object.fromEntries(channel.kpis.map((kpi) => [kpi.name, kpi.target])),
      sortOrder: channelIndex,
      assets: channel.assets.map((asset, assetIndex) => ({
        title: asset.title,
        assetType: asset.assetType,
        format: asset.format ?? null,
        status: "IDEA",
        dueDate: asset.dueDate ?? null,
        ownerId: asset.ownerId ?? null,
        sortOrder: assetIndex,
      })),
    })),
  };
}

export interface LinkChange {
  type: LinkType;
  label: string;
  /** URL to remove from the campaign's links (the previous charter value). */
  remove?: string;
  /** URL to add. */
  add?: string;
}

/** Which campaign links must change when the charter's links change. */
export function diffCharterLinks(
  previous: Partial<Record<keyof CharterInput["links"], string | undefined>>,
  next: CharterInput["links"],
): LinkChange[] {
  return CHARTER_LINK_DEFS.flatMap(({ key, type, label }) => {
    const before = previous[key] || undefined;
    const after = next[key] || undefined;
    if (before === after) return [];
    return [{ type, label, remove: before, add: after }];
  });
}

const SECTION_LABELS: Record<keyof LaunchCharterData, string> = {
  basis: "Basics",
  strategy: "Strategy",
  budget: "Budget",
  links: "Links",
  stakeholders: "Stakeholders",
  approvalProcess: "Approval process",
};

/** Charter sections that differ between two versions, as display labels. */
export function changedCharterSections(previous: LaunchCharterData, next: LaunchCharterData): string[] {
  return (Object.keys(SECTION_LABELS) as (keyof LaunchCharterData)[])
    .filter((key) => stableStringify(previous[key]) !== stableStringify(next[key]))
    .map((key) => SECTION_LABELS[key]);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value ?? null, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, inner]) => inner !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}
