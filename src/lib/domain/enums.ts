// Fixed value sets of the domain. SQLite has no native enums in Prisma, so these
// are stored as strings and validated via Zod. When moving to PostgreSQL they can
// be turned into real Prisma enums without changing the values.

export const FUNNEL_STAGES = ["AWARENESS", "CONSIDERATION", "SALES"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_STAGE_LABELS: Record<FunnelStage, string> = {
  AWARENESS: "Awareness",
  CONSIDERATION: "Consideration",
  SALES: "Sales",
};

/** Ordered workflow statuses followed by the two side statuses. */
export const ASSET_STATUSES = [
  "IDEA",
  "BRIEFING",
  "IN_PRODUCTION",
  "APPROVAL",
  "DONE",
  "LIVE",
  "PAUSED",
  "CANCELLED",
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  IDEA: "Idea",
  BRIEFING: "Briefing",
  IN_PRODUCTION: "In production",
  APPROVAL: "Approval",
  DONE: "Done",
  LIVE: "Live",
  PAUSED: "Paused",
  CANCELLED: "Cancelled",
};

export const ASSET_TYPES = [
  "VIDEO",
  "STATIC",
  "CAROUSEL",
  "STORY",
  "PRINT",
  "DISPLAY",
  "TEXT",
  "OTHER",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  VIDEO: "Video",
  STATIC: "Static",
  CAROUSEL: "Carousel",
  STORY: "Story",
  PRINT: "Print",
  DISPLAY: "Display",
  TEXT: "Text",
  OTHER: "Other",
};

export const USER_ROLES = ["admin", "editor", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const EXECUTION_TYPES = ["agency", "inhouse", "mixed"] as const;
export type ExecutionType = (typeof EXECUTION_TYPES)[number];

export const EXECUTION_TYPE_LABELS: Record<ExecutionType, string> = {
  agency: "Agency",
  inhouse: "In-house",
  mixed: "Mixed",
};

export const MARKETS = ["DE", "AT", "PL"] as const;
export type Market = (typeof MARKETS)[number];

export const LINK_TYPES = ["frontify", "sharepoint", "looker_studio", "other"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export const TEAMS = [
  "Brand",
  "Design",
  "Content",
  "Social Media",
  "Digital Marketplaces",
  "Sales DE",
  "Sales International",
] as const;
export type Team = (typeof TEAMS)[number];

/** Object types that comments and activity log entries can be attached to. */
export const ENTITY_TYPES = ["campaign", "charter", "channel", "asset", "kpi_report"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const CAMPAIGN_PHASES = ["PLANNING", "IN_PROGRESS", "LIVE", "COMPLETED"] as const;
export type CampaignPhase = (typeof CAMPAIGN_PHASES)[number];

export const CAMPAIGN_PHASE_LABELS: Record<CampaignPhase, string> = {
  PLANNING: "Planning",
  IN_PROGRESS: "In progress",
  LIVE: "Live",
  COMPLETED: "Completed",
};

export const TRAFFIC_LIGHTS = ["RED", "YELLOW", "GREEN"] as const;
export type TrafficLight = (typeof TRAFFIC_LIGHTS)[number];
