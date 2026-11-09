// Starting values for planning benchmarks and asset lead times. They are rough,
// illustrative assumptions (no market data) and meant to be replaced with the
// team's own values under Settings → Benchmarks. Used for the seed and as a
// fallback when no value is stored.

import type { AssetType } from "@/lib/domain/enums";

export interface BenchmarkValues {
  /** Awareness: EUR per 1,000 impressions. */
  cpm: number | null;
  /** Awareness: impressions per person reached. */
  frequency: number | null;
  /** % moving on to the next stage: impressions → sessions (awareness), sessions → sales (consideration). */
  rateToNext: number | null;
  /** Consideration: EUR per session/click. */
  costPerAction: number | null;
  /** Sales: EUR per sale. */
  avgOrderValue: number | null;
}

const empty: BenchmarkValues = {
  cpm: null,
  frequency: null,
  rateToNext: null,
  costPerAction: null,
  avgOrderValue: null,
};
const awareness = (cpm: number, frequency: number, rateToNext: number): BenchmarkValues => ({
  ...empty,
  cpm,
  frequency,
  rateToNext,
});
const consideration = (costPerAction: number, rateToNext: number): BenchmarkValues => ({
  ...empty,
  costPerAction,
  rateToNext,
});
const sales = (avgOrderValue: number): BenchmarkValues => ({ ...empty, avgOrderValue });

/**
 * Additional KPI planned as a share of the channel's volume: of impressions
 * (awareness), sessions (consideration) or units sold (sales).
 */
export interface ExtraKpi {
  name: string;
  /** % of the stage volume. */
  rate: number;
}

/** Stage volume an additional KPI is based on. */
export const EXTRA_KPI_BASE = { AWARENESS: "impressions", CONSIDERATION: "sessions", SALES: "units sold" } as const;

/** Default additional KPIs by channel type key. */
export const DEFAULT_EXTRA_KPIS: Record<string, ExtraKpi[]> = {
  social_reach_paid: [{ name: "Clicks", rate: 1.2 }],
  influencer: [{ name: "Engagements", rate: 3 }],
  tv_ctv: [{ name: "Completed views", rate: 70 }],
  website_content: [{ name: "Leads", rate: 2 }],
  newsletter_crm: [{ name: "Clicks", rate: 12 }],
};

/** Default benchmarks by channel type key (see DEFAULT_CHANNEL_TYPES). */
export const DEFAULT_BENCHMARKS: Record<string, BenchmarkValues> = {
  cinema_placement: awareness(25, 1.5, 0.05),
  tv_ctv: awareness(22, 3, 0.1),
  ooh: awareness(8, 4, 0.02),
  social_reach_paid: awareness(6, 2.5, 0.8),
  influencer: awareness(18, 1.8, 1.2),
  pr_press: awareness(3, 1.5, 0.1),
  social_organic: consideration(0.3, 1.5),
  website_content: consideration(0.8, 3),
  newsletter_crm: consideration(0.2, 5),
  events_fairs: consideration(6, 8),
  sampling: consideration(2.5, 12),
  pos_retail: sales(18),
  digital_marketplaces: sales(32),
  online_shop: sales(38),
  promotions: sales(15),
  b2b_trade_marketing: sales(250),
};

export const EMPTY_BENCHMARK = empty;

export interface LeadTime {
  briefingDays: number;
  productionDays: number;
  approvalDays: number;
}

/** Default lead times per asset type (calendar days). */
export const DEFAULT_LEAD_TIMES: Record<AssetType, LeadTime> = {
  VIDEO: { briefingDays: 5, productionDays: 20, approvalDays: 5 },
  STATIC: { briefingDays: 3, productionDays: 5, approvalDays: 3 },
  CAROUSEL: { briefingDays: 3, productionDays: 7, approvalDays: 3 },
  STORY: { briefingDays: 2, productionDays: 4, approvalDays: 2 },
  PRINT: { briefingDays: 5, productionDays: 10, approvalDays: 4 },
  DISPLAY: { briefingDays: 3, productionDays: 5, approvalDays: 2 },
  TEXT: { briefingDays: 3, productionDays: 5, approvalDays: 3 },
  OTHER: { briefingDays: 3, productionDays: 7, approvalDays: 3 },
};

/** Days between "ready" (approved) and go-live, e.g. for trafficking and upload. */
export const DEFAULT_BUFFER_DAYS = 3;
