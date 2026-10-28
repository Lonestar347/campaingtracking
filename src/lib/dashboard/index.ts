// Dashboard logic: campaign summaries, filters (encoded in the URL), sorting,
// the "critical" asset list and the comparison timeline. Pure functions.

import { statusConfig, type StatusConfig } from "@/lib/config";
import { daysBetween } from "@/lib/dates";
import { parseDateInput, toDateInput } from "@/lib/format";
import {
  CAMPAIGN_PHASES,
  EXECUTION_TYPES,
  MARKETS,
  TRAFFIC_LIGHTS,
  type CampaignPhase,
  type ExecutionType,
  type Market,
  type TrafficLight,
} from "@/lib/domain/enums";
import { isDueSoonAndBehind, isOverdue, rollupCampaign, type CampaignRollup } from "@/lib/status";
import { parseStringList } from "@/lib/validation";

// ---------------------------------------------------------------------------
// Input shape (subset of the Prisma campaign query)

export interface DashboardAsset {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  owner: { name: string } | null;
}

export interface DashboardChannel {
  id: string;
  name: string;
  funnelStage: string;
  assets: DashboardAsset[];
}

export interface DashboardCampaign {
  id: string;
  slug: string;
  name: string;
  startDate: Date;
  endDate: Date;
  markets: unknown;
  brand: string | null;
  productLine: string | null;
  executionType: string;
  budgetCents: number | null;
  owner: { id: string; name: string };
  channels: DashboardChannel[];
}

export interface CampaignSummary {
  campaign: DashboardCampaign;
  markets: string[];
  rollup: CampaignRollup;
  dueSoonCount: number;
}

export function summarizeCampaigns(
  campaigns: readonly DashboardCampaign[],
  now: Date,
  config: StatusConfig = statusConfig,
): CampaignSummary[] {
  return campaigns.map((campaign) => ({
    campaign,
    markets: parseStringList(campaign.markets),
    rollup: rollupCampaign(campaign, now, config),
    dueSoonCount: campaign.channels
      .flatMap((c) => c.assets)
      .filter((a) => isDueSoonAndBehind(a, now, config)).length,
  }));
}

// ---------------------------------------------------------------------------
// Filters

export interface DashboardFilters {
  q?: string;
  markets: Market[];
  brand?: string;
  productLine?: string;
  ownerId?: string;
  executionTypes: ExecutionType[];
  phases: CampaignPhase[];
  lights: TrafficLight[];
  from?: Date;
  to?: Date;
}

export const SORT_OPTIONS = ["start", "ampel", "name", "ende"] as const;
export type DashboardSort = (typeof SORT_OPTIONS)[number];

/** URL parameter names (German, user-visible in shared links). */
export const FILTER_PARAMS = {
  q: "q",
  markets: "markt",
  brand: "marke",
  productLine: "produktlinie",
  ownerId: "owner",
  executionTypes: "umsetzung",
  phases: "phase",
  lights: "ampel",
  from: "von",
  to: "bis",
  sort: "sortierung",
} as const;

type SearchParams = Record<string, string | string[] | undefined>;

function values(params: SearchParams, key: string): string[] {
  const raw = params[key];
  if (raw == null) return [];
  return (Array.isArray(raw) ? raw : [raw]).flatMap((v) => v.split(",")).map((v) => v.trim()).filter(Boolean);
}

function oneOf<T extends string>(allowed: readonly T[], list: string[]): T[] {
  return [...new Set(list.filter((v): v is T => (allowed as readonly string[]).includes(v)))];
}

function single(params: SearchParams, key: string): string | undefined {
  return values(params, key)[0];
}

export function parseFilters(params: SearchParams): DashboardFilters {
  return {
    q: single(params, FILTER_PARAMS.q),
    markets: oneOf(MARKETS, values(params, FILTER_PARAMS.markets)),
    brand: single(params, FILTER_PARAMS.brand),
    productLine: single(params, FILTER_PARAMS.productLine),
    ownerId: single(params, FILTER_PARAMS.ownerId),
    executionTypes: oneOf(EXECUTION_TYPES, values(params, FILTER_PARAMS.executionTypes)),
    phases: oneOf(CAMPAIGN_PHASES, values(params, FILTER_PARAMS.phases)),
    lights: oneOf(TRAFFIC_LIGHTS, values(params, FILTER_PARAMS.lights)),
    from: parseDateInput(single(params, FILTER_PARAMS.from) ?? "") ?? undefined,
    to: parseDateInput(single(params, FILTER_PARAMS.to) ?? "") ?? undefined,
  };
}

export function parseSort(params: SearchParams): DashboardSort {
  const value = single(params, FILTER_PARAMS.sort);
  return (SORT_OPTIONS as readonly string[]).includes(value ?? "") ? (value as DashboardSort) : "start";
}

/** Serialises filters (and sort) back into URL search params; empty values are omitted. */
export function filtersToSearchParams(filters: DashboardFilters, sort: DashboardSort = "start"): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | undefined) => {
    if (value) params.set(key, value);
  };
  set(FILTER_PARAMS.q, filters.q);
  set(FILTER_PARAMS.markets, filters.markets.join(","));
  set(FILTER_PARAMS.brand, filters.brand);
  set(FILTER_PARAMS.productLine, filters.productLine);
  set(FILTER_PARAMS.ownerId, filters.ownerId);
  set(FILTER_PARAMS.executionTypes, filters.executionTypes.join(","));
  set(FILTER_PARAMS.phases, filters.phases.join(","));
  set(FILTER_PARAMS.lights, filters.lights.join(","));
  set(FILTER_PARAMS.from, filters.from && toDateInput(filters.from));
  set(FILTER_PARAMS.to, filters.to && toDateInput(filters.to));
  if (sort !== "start") params.set(FILTER_PARAMS.sort, sort);
  return params;
}

export function countActiveFilters(filters: DashboardFilters): number {
  return [
    filters.q,
    filters.markets.length,
    filters.brand,
    filters.productLine,
    filters.ownerId,
    filters.executionTypes.length,
    filters.phases.length,
    filters.lights.length,
    filters.from || filters.to,
  ].filter(Boolean).length;
}

const normalize = (s: string) => s.toLocaleLowerCase("de-DE");

export function matchesFilters(
  summary: CampaignSummary,
  filters: DashboardFilters,
  config: StatusConfig = statusConfig,
): boolean {
  const { campaign, markets, rollup } = summary;
  if (filters.q) {
    const haystack = normalize([campaign.name, campaign.brand, campaign.productLine].filter(Boolean).join(" "));
    if (!haystack.includes(normalize(filters.q))) return false;
  }
  // Markets: campaign must run in at least one of the selected markets.
  if (filters.markets.length > 0 && !filters.markets.some((m) => markets.includes(m))) return false;
  if (filters.brand && campaign.brand !== filters.brand) return false;
  if (filters.productLine && campaign.productLine !== filters.productLine) return false;
  if (filters.ownerId && campaign.owner.id !== filters.ownerId) return false;
  if (filters.executionTypes.length > 0 && !filters.executionTypes.includes(campaign.executionType as ExecutionType)) {
    return false;
  }
  if (filters.phases.length > 0 && !filters.phases.includes(rollup.campaign.phase)) return false;
  if (filters.lights.length > 0 && !filters.lights.includes(rollup.campaign.trafficLight)) return false;
  // Period: campaign period overlaps the selected range (calendar days).
  if (filters.from && daysBetween(filters.from, campaign.endDate, config.timeZone) < 0) return false;
  if (filters.to && daysBetween(campaign.startDate, filters.to, config.timeZone) < 0) return false;
  return true;
}

const LIGHT_RANK: Record<TrafficLight, number> = { RED: 0, YELLOW: 1, GREEN: 2 };

export function sortSummaries(summaries: readonly CampaignSummary[], sort: DashboardSort): CampaignSummary[] {
  const byStart = (a: CampaignSummary, b: CampaignSummary) =>
    a.campaign.startDate.getTime() - b.campaign.startDate.getTime();
  const compare: Record<DashboardSort, (a: CampaignSummary, b: CampaignSummary) => number> = {
    start: byStart,
    ende: (a, b) => a.campaign.endDate.getTime() - b.campaign.endDate.getTime() || byStart(a, b),
    name: (a, b) => a.campaign.name.localeCompare(b.campaign.name, "de"),
    ampel: (a, b) =>
      LIGHT_RANK[a.rollup.campaign.trafficLight] - LIGHT_RANK[b.rollup.campaign.trafficLight] ||
      b.rollup.campaign.overdueCount - a.rollup.campaign.overdueCount ||
      b.dueSoonCount - a.dueSoonCount ||
      byStart(a, b),
  };
  return [...summaries].sort(compare[sort]);
}

/** Distinct values for the filter dropdowns, taken from all campaigns. */
export function filterOptions(campaigns: readonly DashboardCampaign[]) {
  const distinct = (list: (string | null)[]) =>
    [...new Set(list.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "de"));
  const owners = new Map(campaigns.map((c) => [c.owner.id, c.owner.name]));
  return {
    brands: distinct(campaigns.map((c) => c.brand)),
    productLines: distinct(campaigns.map((c) => c.productLine)),
    owners: [...owners].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "de")),
  };
}

// ---------------------------------------------------------------------------
// Critical assets

export interface CriticalAsset {
  assetId: string;
  title: string;
  status: string;
  dueDate: Date;
  /** Negative = overdue by that many days, 0 = due today, positive = due in N days. */
  daysUntilDue: number;
  ownerName: string | null;
  channelName: string;
  funnelStage: string;
  campaignName: string;
  campaignSlug: string;
}

function collectAssets(
  summaries: readonly CampaignSummary[],
  now: Date,
  predicate: (asset: DashboardAsset) => boolean,
  config: StatusConfig,
): CriticalAsset[] {
  return summaries.flatMap(({ campaign }) =>
    campaign.channels.flatMap((channel) =>
      channel.assets.filter(predicate).map((asset) => ({
        assetId: asset.id,
        title: asset.title,
        status: asset.status,
        dueDate: asset.dueDate!,
        daysUntilDue: daysBetween(now, asset.dueDate!, config.timeZone),
        ownerName: asset.owner?.name ?? null,
        channelName: channel.name,
        funnelStage: channel.funnelStage,
        campaignName: campaign.name,
        campaignSlug: campaign.slug,
      })),
    ),
  );
}

/** Overdue assets across campaigns, most overdue first. */
export function overdueAssets(
  summaries: readonly CampaignSummary[],
  now: Date,
  config: StatusConfig = statusConfig,
): CriticalAsset[] {
  return collectAssets(summaries, now, (a) => isOverdue(a, now, config), config).sort(
    (a, b) => a.daysUntilDue - b.daysUntilDue || a.title.localeCompare(b.title, "de"),
  );
}

/** Assets due soon and not yet in approval, soonest first. */
export function dueSoonAssets(
  summaries: readonly CampaignSummary[],
  now: Date,
  config: StatusConfig = statusConfig,
): CriticalAsset[] {
  return collectAssets(summaries, now, (a) => isDueSoonAndBehind(a, now, config), config).sort(
    (a, b) => a.daysUntilDue - b.daysUntilDue || a.title.localeCompare(b.title, "de"),
  );
}

export interface DashboardStats {
  campaigns: number;
  live: number;
  red: number;
  overdueAssets: number;
  dueSoonAssets: number;
}

export function dashboardStats(summaries: readonly CampaignSummary[]): DashboardStats {
  return {
    campaigns: summaries.length,
    live: summaries.filter((s) => s.rollup.campaign.phase === "LIVE").length,
    red: summaries.filter((s) => s.rollup.campaign.trafficLight === "RED").length,
    overdueAssets: summaries.reduce((sum, s) => sum + s.rollup.campaign.overdueCount, 0),
    dueSoonAssets: summaries.reduce((sum, s) => sum + s.dueSoonCount, 0),
  };
}

// ---------------------------------------------------------------------------
// Comparison timeline

export interface TimelineBar {
  /** Offset and width in percent of the common range. */
  left: number;
  width: number;
}

export interface Timeline {
  start: Date;
  end: Date;
  bars: TimelineBar[];
  /** Position of "today" in percent, or null when outside the range. */
  today: number | null;
}

/** Places campaign periods on a common time axis (inclusive calendar days). */
export function buildTimeline(
  periods: readonly { startDate: Date; endDate: Date }[],
  now: Date,
  config: StatusConfig = statusConfig,
): Timeline | null {
  if (periods.length === 0) return null;
  const start = periods.reduce((min, p) => (p.startDate < min ? p.startDate : min), periods[0].startDate);
  const end = periods.reduce((max, p) => (p.endDate > max ? p.endDate : max), periods[0].endDate);
  const totalDays = daysBetween(start, end, config.timeZone) + 1;
  const pct = (days: number) => (days / totalDays) * 100;

  const todayOffset = daysBetween(start, now, config.timeZone);
  return {
    start,
    end,
    bars: periods.map((p) => ({
      left: pct(daysBetween(start, p.startDate, config.timeZone)),
      width: pct(daysBetween(p.startDate, p.endDate, config.timeZone) + 1),
    })),
    today: todayOffset >= 0 && todayOffset < totalDays ? pct(todayOffset + 0.5) : null,
  };
}

export const MAX_COMPARE = 4;

/** Parses the comparison selection (?k=slug-a,slug-b), deduplicated and capped. */
export function parseCompareSlugs(params: SearchParams): string[] {
  return [...new Set(values(params, "k"))].slice(0, MAX_COMPARE);
}
