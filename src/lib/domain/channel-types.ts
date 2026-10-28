import type { FunnelStage } from "@/lib/domain/enums";

export interface ChannelTypeDefinition {
  key: string;
  name: string;
  defaultFunnelStage: FunnelStage;
}

/** Default channel types (master data). Seeded into ChannelType, editable later. */
export const DEFAULT_CHANNEL_TYPES: readonly ChannelTypeDefinition[] = [
  // Awareness
  { key: "cinema_placement", name: "Kino/Placement", defaultFunnelStage: "AWARENESS" },
  { key: "tv_ctv", name: "TV/CTV", defaultFunnelStage: "AWARENESS" },
  { key: "ooh", name: "OOH", defaultFunnelStage: "AWARENESS" },
  { key: "social_reach_paid", name: "Social Reach (Paid)", defaultFunnelStage: "AWARENESS" },
  { key: "influencer", name: "Influencer", defaultFunnelStage: "AWARENESS" },
  { key: "pr_press", name: "PR/Presse", defaultFunnelStage: "AWARENESS" },
  // Consideration
  { key: "social_organic", name: "Social Engagement/Organic", defaultFunnelStage: "CONSIDERATION" },
  { key: "website_content", name: "Website/Ratgeber-Content", defaultFunnelStage: "CONSIDERATION" },
  { key: "newsletter_crm", name: "Newsletter/CRM", defaultFunnelStage: "CONSIDERATION" },
  { key: "events_fairs", name: "Events/Messen", defaultFunnelStage: "CONSIDERATION" },
  { key: "sampling", name: "Sampling", defaultFunnelStage: "CONSIDERATION" },
  // Sales
  { key: "pos_retail", name: "POS/Handel", defaultFunnelStage: "SALES" },
  { key: "digital_marketplaces", name: "Digital Marketplaces (Amazon, Zooplus …)", defaultFunnelStage: "SALES" },
  { key: "online_shop", name: "Onlineshop", defaultFunnelStage: "SALES" },
  { key: "promotions", name: "Promotions/Aktionen", defaultFunnelStage: "SALES" },
  { key: "b2b_trade_marketing", name: "B2B/Handelsmarketing", defaultFunnelStage: "SALES" },
];
