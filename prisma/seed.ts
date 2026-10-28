// Seed data: master data (channel types), demo users and three fictional
// example campaigns. No real campaign data. All dates are relative to the day
// the seed runs, so the example traffic lights stay meaningful:
//   1. "Autumn Campaign Dog"   – running, one asset overdue      -> RED / Live
//   2. "Winter Sampling Cat"   – starts soon, briefings due      -> YELLOW / In progress
//   3. "Spring Shop Promotion" – far in the future, only ideas   -> GREEN / Planning
//
// Run with: npm run db:seed (wipes existing data first).

import { PrismaClient } from "@prisma/client";
import { DEFAULT_CHANNEL_TYPES } from "../src/lib/domain/channel-types";
import type { AssetStatus, AssetType, FunnelStage } from "../src/lib/domain/enums";
import { launchCharterDataSchema, type LaunchCharterData } from "../src/lib/validation";
import { storage } from "../src/lib/storage";
import { renderVisual, type VisualSpec } from "./seed-images";

const db = new PrismaClient();

const today = new Date();
/** Midnight UTC of today + offset days (date-only value). */
function day(offset: number): Date {
  return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + offset));
}

interface AssetSeed {
  title: string;
  assetType: AssetType;
  format?: string;
  status: AssetStatus;
  due?: number;
  owner?: string;
  approver?: string;
}

interface ChannelSeed {
  type: string;
  name?: string;
  stage?: FunnelStage; // overrides the type's default stage
  owner?: string;
  start?: number;
  end?: number;
  kpiTargets?: Record<string, number>;
  notes?: string;
  assets: AssetSeed[];
}

interface CampaignSeed {
  name: string;
  slug: string;
  description: string;
  brand: string;
  productLine: string;
  markets: string[];
  start: number;
  end: number;
  budgetCents: number;
  owner: string;
  partners: string[];
  executionType: "agency" | "inhouse" | "mixed";
  charter: LaunchCharterData;
  links: { type: "frontify" | "sharepoint" | "looker_studio"; url: string; label: string; embed?: boolean }[];
  channels: ChannelSeed[];
}

const USERS = [
  { key: "anna", name: "Anna Sample", email: "anna.sample@example.com", role: "admin", team: "Brand" },
  { key: "ben", name: "Ben Mock", email: "ben.mock@example.com", role: "editor", team: "Design" },
  { key: "clara", name: "Clara Draft", email: "clara.draft@example.com", role: "editor", team: "Content" },
  { key: "david", name: "David Test", email: "david.test@example.com", role: "editor", team: "Social Media" },
  { key: "eva", name: "Eva Demo", email: "eva.demo@example.com", role: "editor", team: "Digital Marketplaces" },
  { key: "felix", name: "Felix Placeholder", email: "felix.placeholder@example.com", role: "viewer", team: "Sales DE" },
] as const;

type UserKey = (typeof USERS)[number]["key"];

const CAMPAIGNS: CampaignSeed[] = [
  {
    name: "Autumn Campaign Dog",
    slug: "autumn-campaign-dog",
    description: "Fictional sample campaign: raise awareness of a dry food line for dogs.",
    brand: "Sample Brand",
    productLine: "Dog Dry Food",
    markets: ["DE", "AT"],
    start: -20,
    end: 40,
    budgetCents: 25_000_000,
    owner: "anna",
    partners: ["Sample Agency Ltd", "Mock Film Production"],
    executionType: "mixed",
    charter: {
      strategy: {
        objective: "Increase brand awareness in the target group by 10 percentage points",
        targetAudience: "Dog owners aged 25–55, quality-minded",
        keyMessage: "Good nutrition you can see.",
        insight: "Owners recognise quality by their dog's coat and energy.",
        reasonToBelieve: "Selected ingredients, developed with animal nutrition experts (fictional).",
      },
      budget: {
        totalCents: 25_000_000,
        byFunnelStageCents: { AWARENESS: 15_000_000, CONSIDERATION: 5_000_000, SALES: 5_000_000 },
      },
      links: {
        frontify: "https://example.frontify.com/folder/autumn-dog",
        sharepoint: "https://example.sharepoint.com/sites/marketing/autumn-dog",
        lookerStudio: "https://lookerstudio.google.com/reporting/example-autumn-dog",
      },
      stakeholders: [
        { team: "Brand", people: ["Anna Sample"], role: "Lead" },
        { team: "Design", people: ["Ben Mock"], role: "Creative" },
        { team: "Social Media", people: ["David Test"] },
        { team: "Sales DE", people: ["Felix Placeholder"], role: "Retail execution" },
      ],
      approvalProcess: "Creative → brand lead → management (fictional)",
    },
    links: [
      { type: "frontify", url: "https://example.frontify.com/folder/autumn-dog", label: "Frontify folder" },
      { type: "sharepoint", url: "https://example.sharepoint.com/sites/marketing/autumn-dog", label: "SharePoint" },
      {
        type: "looker_studio",
        url: "https://lookerstudio.google.com/reporting/example-autumn-dog",
        label: "Performance report",
        embed: true,
      },
    ],
    channels: [
      {
        type: "tv_ctv",
        name: "CTV spot",
        owner: "anna",
        start: -20,
        end: 30,
        kpiTargets: { Impressions: 5_000_000, "Completion rate %": 70 },
        assets: [
          { title: "TV spot 20s", assetType: "VIDEO", format: "16:9, 20s", status: "LIVE", due: -25, owner: "ben", approver: "anna" },
          { title: "Cutdown 6s", assetType: "VIDEO", format: "16:9, 6s", status: "DONE", due: -15, owner: "ben", approver: "anna" },
        ],
      },
      {
        type: "social_reach_paid",
        owner: "david",
        kpiTargets: { Reach: 2_000_000, CPM: 6 },
        assets: [
          { title: "Reel 9:16 – coat", assetType: "VIDEO", format: "9:16, 15s", status: "LIVE", due: -18, owner: "david", approver: "anna" },
          { title: "Carousel ingredients", assetType: "CAROUSEL", format: "1:1, 5 slides", status: "IN_PRODUCTION", due: -3, owner: "ben", approver: "anna" },
          { title: "Story set week 4", assetType: "STORY", format: "9:16", status: "BRIEFING", due: 12, owner: "david" },
        ],
      },
      {
        type: "website_content",
        owner: "clara",
        kpiTargets: { Sessions: 40_000, "Time on page (s)": 90 },
        assets: [
          { title: "Guide: coat care through nutrition", assetType: "TEXT", status: "APPROVAL", due: 3, owner: "clara", approver: "anna" },
          { title: "Landing page header", assetType: "STATIC", format: "1920x600", status: "DONE", due: -21, owner: "ben" },
        ],
      },
      {
        type: "pos_retail",
        owner: "felix",
        kpiTargets: { Placements: 300 },
        assets: [
          { title: "Shelf stopper", assetType: "PRINT", format: "A5", status: "DONE", due: -30, owner: "ben", approver: "felix" },
          { title: "Display stand", assetType: "PRINT", format: "Display 60x180", status: "LIVE", due: -22, owner: "ben", approver: "felix" },
        ],
      },
    ],
  },
  {
    name: "Winter Sampling Cat",
    slug: "winter-sampling-cat",
    description: "Fictional sample campaign: trial packs for a wet food line for cats.",
    brand: "Sample Brand",
    productLine: "Cat Wet Food",
    markets: ["DE", "PL"],
    start: 10,
    end: 70,
    budgetCents: 8_000_000,
    owner: "clara",
    partners: [],
    executionType: "inhouse",
    charter: {
      strategy: {
        objective: "Distribute 20,000 trial packs, 5% repurchase rate",
        targetAudience: "Cat owners who do not know the brand yet",
        keyMessage: "Try it and taste the difference.",
        insight: "Cats are picky – owners only switch food after a trial.",
        reasonToBelieve: "High acceptance in internal taste tests (fictional).",
      },
      budget: { totalCents: 8_000_000 },
      links: {},
      stakeholders: [
        { team: "Content", people: ["Clara Draft"], role: "Lead" },
        { team: "Social Media", people: ["David Test"] },
        { team: "Sales International", people: [], role: "PL coordination" },
      ],
      approvalProcess: "Content lead → brand",
    },
    links: [
      { type: "sharepoint", url: "https://example.sharepoint.com/sites/marketing/winter-cat", label: "Project folder" },
    ],
    channels: [
      {
        type: "sampling",
        owner: "clara",
        start: 10,
        end: 60,
        kpiTargets: { "Samples distributed": 20_000 },
        assets: [
          { title: "Sampling box design", assetType: "PRINT", format: "Folding box", status: "BRIEFING", due: 4, owner: "ben", approver: "clara" },
          { title: "Insert flyer", assetType: "PRINT", format: "DL", status: "IDEA", due: 6, owner: "clara" },
        ],
      },
      {
        type: "newsletter_crm",
        owner: "clara",
        kpiTargets: { "Open rate %": 35, Clicks: 3_000 },
        assets: [
          { title: "Newsletter: trial pack sign-up", assetType: "TEXT", status: "IN_PRODUCTION", due: 9, owner: "clara" },
        ],
      },
      {
        type: "influencer",
        owner: "david",
        kpiTargets: { Reach: 500_000 },
        assets: [
          { title: "Unboxing briefing", assetType: "TEXT", status: "BRIEFING", due: 15, owner: "david" },
          { title: "Influencer partnership PL", assetType: "VIDEO", status: "CANCELLED", due: 2, owner: "david" },
        ],
      },
    ],
  },
  {
    name: "Spring Shop Promotion",
    slug: "spring-shop-promotion",
    description: "Fictional sample campaign: sales promotion via online shop and marketplaces.",
    brand: "Sample Brand",
    productLine: "Snacks",
    markets: ["DE", "AT", "PL"],
    start: 60,
    end: 120,
    budgetCents: 4_500_000,
    owner: "eva",
    partners: ["Sample Performance Agency"],
    executionType: "agency",
    charter: {
      strategy: {
        objective: "Online snack revenue +15% vs. the prior-year period",
        targetAudience: "Existing online customers",
        keyMessage: "A reward for every walk.",
      },
      budget: {
        totalCents: 4_500_000,
        byFunnelStageCents: { CONSIDERATION: 500_000, SALES: 4_000_000 },
      },
      links: {},
      stakeholders: [
        { team: "Digital Marketplaces", people: ["Eva Demo"], role: "Lead" },
        { team: "Design", people: ["Ben Mock"] },
      ],
    },
    links: [],
    channels: [
      {
        type: "digital_marketplaces",
        name: "Amazon & Zooplus",
        owner: "eva",
        kpiTargets: { Revenue: 120_000, ROAS: 4 },
        assets: [
          { title: "A+ content snacks", assetType: "STATIC", status: "IDEA", due: 45, owner: "eva" },
          { title: "Sponsored Brands video", assetType: "VIDEO", format: "16:9, 15s", status: "IDEA", due: 50, owner: "eva" },
        ],
      },
      {
        type: "promotions",
        owner: "eva",
        kpiTargets: { "Redeemed vouchers": 2_500 },
        assets: [{ title: "Voucher mechanics", assetType: "TEXT", status: "IDEA", due: 40, owner: "eva" }],
      },
      {
        // Example of overriding the default funnel stage (Sales -> Consideration)
        type: "online_shop",
        name: "Online shop guide teaser",
        stage: "CONSIDERATION",
        owner: "clara",
        assets: [],
      },
    ],
  },
];

interface CreativeSeed {
  title: string;
  channel?: string; // channel name within the campaign
  format: string;
  visual?: VisualSpec;
  cover?: boolean;
  kpis: Record<string, number>;
}

// Fictional creatives with generated placeholder visuals and manual KPI values.
const CREATIVES: Record<string, CreativeSeed[]> = {
  "autumn-campaign-dog": [
    {
      title: "Golden paw – hero visual",
      channel: "Social Reach (Paid)",
      format: "1080×1080",
      visual: { from: "#7a4b2a", to: "#d9a066", accent: "#FECC00", motif: "paw" },
      cover: true,
      kpis: { Impressions: 1_240_000, Clicks: 21_800, "CTR %": 1.76, CPC: 0.41 },
    },
    {
      title: "Coat shine pack shot",
      channel: "Social Reach (Paid)",
      format: "1080×1350",
      visual: { from: "#3d2b1f", to: "#a5714a", accent: "#E2001A", motif: "pack" },
      kpis: { Impressions: 980_000, Clicks: 11_300, "CTR %": 1.15, CPC: 0.63 },
    },
    {
      title: "Autumn bowl – story",
      channel: "Social Reach (Paid)",
      format: "9:16",
      visual: { from: "#5c3b1e", to: "#e0b27a", accent: "#f4e3c1", motif: "bowl" },
      kpis: { Impressions: 1_560_000, Clicks: 30_100, "CTR %": 1.93, CPC: 0.36 },
    },
    {
      title: "CTV end card",
      channel: "CTV spot",
      format: "16:9",
      visual: { from: "#22223b", to: "#4a4e69", accent: "#FECC00", motif: "pack" },
      kpis: { Impressions: 2_100_000, "Completion rate %": 74 },
    },
    {
      title: "POS shelf wobbler",
      channel: "POS/Retail",
      format: "A6",
      visual: { from: "#8d5524", to: "#f3c08b", accent: "#ffffff", motif: "paw" },
      kpis: {},
    },
  ],
  "winter-sampling-cat": [
    {
      title: "Sampling box – key visual",
      channel: "Sampling",
      format: "1200×628",
      visual: { from: "#1d3557", to: "#6c8ebf", accent: "#f1faee", motif: "pack" },
      cover: true,
      kpis: {},
    },
    {
      title: "Winter newsletter header",
      channel: "Newsletter/CRM",
      format: "600×300",
      visual: { from: "#264653", to: "#8ab17d", accent: "#FECC00", motif: "bowl" },
      kpis: { "Open rate %": 38.2, Clicks: 1_240, "CTR %": 2.4 },
    },
    {
      title: "Cat paw teaser",
      channel: "Influencer",
      format: "9:16",
      visual: { from: "#3c1642", to: "#a06cd5", accent: "#ffd6ff", motif: "paw" },
      kpis: { Impressions: 410_000, Clicks: 5_900, "CTR %": 1.44 },
    },
  ],
  "spring-shop-promotion": [
    {
      title: "Spring voucher banner",
      channel: "Promotions",
      format: "970×250",
      visual: { from: "#2a6f4e", to: "#8fc79a", accent: "#f4e3c1", motif: "bowl" },
      kpis: {},
    },
  ],
};

const slugifyTitle = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function main() {
  // Uploaded creative images of the previous seed run.
  for (const c of await db.creative.findMany({ where: { imageKey: { not: null } }, select: { imageKey: true } })) {
    await storage.delete(c.imageKey!).catch(() => undefined);
  }

  // Wipe in dependency order.
  await db.activityLog.deleteMany();
  await db.comment.deleteMany();
  await db.kpiValue.deleteMany();
  await db.kpiReport.deleteMany();
  await db.kpiImportMapping.deleteMany();
  await db.creative.deleteMany();
  await db.link.deleteMany();
  await db.asset.deleteMany();
  await db.channel.deleteMany();
  await db.launchCharterVersion.deleteMany();
  await db.launchCharter.deleteMany();
  await db.campaign.deleteMany();
  await db.channelType.deleteMany();
  await db.user.deleteMany();

  const channelTypes = new Map<string, { id: string; defaultFunnelStage: string; name: string }>();
  for (const [index, ct] of DEFAULT_CHANNEL_TYPES.entries()) {
    const created = await db.channelType.create({ data: { ...ct, sortOrder: index } });
    channelTypes.set(ct.key, created);
  }

  const users = new Map<UserKey, string>();
  for (const { key, ...user } of USERS) {
    const created = await db.user.create({ data: user });
    users.set(key, created.id);
  }
  const userId = (key?: string) => (key ? users.get(key as UserKey) : undefined);

  for (const c of CAMPAIGNS) {
    const ownerId = userId(c.owner)!;
    const charterData = launchCharterDataSchema.parse({
      ...c.charter,
      basis: {
        name: c.name,
        description: c.description,
        brand: c.brand,
        productLine: c.productLine,
        markets: c.markets,
        startDate: day(c.start).toISOString().slice(0, 10),
        endDate: day(c.end).toISOString().slice(0, 10),
        ownerId,
        executionType: c.executionType,
        partners: c.partners,
      },
    });

    const campaign = await db.campaign.create({
      data: {
        name: c.name,
        slug: c.slug,
        description: c.description,
        objective: charterData.strategy.objective,
        keyMessage: charterData.strategy.keyMessage,
        startDate: day(c.start),
        endDate: day(c.end),
        budgetCents: c.budgetCents,
        markets: c.markets,
        brand: c.brand,
        productLine: c.productLine,
        ownerId,
        partners: c.partners,
        executionType: c.executionType,
        charter: {
          create: {
            currentVersion: 1,
            data: charterData,
            versions: { create: { version: 1, data: charterData, createdById: ownerId, changeNote: "Initial version" } },
          },
        },
        links: { create: c.links },
      },
    });

    await db.activityLog.create({
      data: {
        campaignId: campaign.id,
        entityType: "campaign",
        entityId: campaign.id,
        action: "created",
        details: { via: "launch_charter", channels: c.channels.length, assets: c.channels.reduce((n, ch) => n + ch.assets.length, 0) },
        userId: ownerId,
        // Campaigns were "created" a few weeks before their start, and at least a few days ago.
        createdAt: new Date(Math.min(Date.now() - 4 * 86_400_000, day(c.start - 21).getTime())),
      },
    });

    for (const [chIndex, ch] of c.channels.entries()) {
      const type = channelTypes.get(ch.type);
      if (!type) throw new Error(`Unknown channel type: ${ch.type}`);

      await db.channel.create({
        data: {
          campaignId: campaign.id,
          channelTypeId: type.id,
          funnelStage: ch.stage ?? type.defaultFunnelStage,
          name: ch.name ?? type.name,
          ownerId: userId(ch.owner),
          startDate: ch.start != null ? day(ch.start) : null,
          endDate: ch.end != null ? day(ch.end) : null,
          kpiTargets: ch.kpiTargets ?? {},
          notes: ch.notes,
          sortOrder: chIndex,
          assets: {
            create: ch.assets.map((a, aIndex) => ({
              title: a.title,
              assetType: a.assetType,
              format: a.format,
              status: a.status,
              dueDate: a.due != null ? day(a.due) : null,
              ownerId: userId(a.owner),
              approverId: userId(a.approver),
              sortOrder: aIndex,
            })),
          },
        },
      });
    }
  }

  for (const [slug, creatives] of Object.entries(CREATIVES)) {
    const campaign = await db.campaign.findUniqueOrThrow({ where: { slug }, include: { channels: true } });
    for (const [index, c] of creatives.entries()) {
      const channel = c.channel ? campaign.channels.find((ch) => ch.name === c.channel) : undefined;
      if (c.channel && !channel) throw new Error(`Unknown channel for creative: ${c.channel}`);
      const imageKey = c.visual
        ? await storage.put(renderVisual(c.visual), `${slugifyTitle(c.title)}.png`, `creatives/${campaign.id}`)
        : null;
      await db.creative.create({
        data: {
          campaignId: campaign.id,
          channelId: channel?.id ?? null,
          title: c.title,
          format: c.format,
          imageKey,
          imageType: imageKey ? "image/png" : null,
          isCover: c.cover ?? false,
          kpiValues: c.kpis,
          sortOrder: index,
        },
      });
    }
  }

  // Comments and status changes so the team features have data.
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  const findAsset = (title: string) =>
    db.asset.findFirstOrThrow({ where: { title }, include: { channel: { select: { campaignId: true } } } });
  const findChannel = (name: string) => db.channel.findFirstOrThrow({ where: { name } });

  const carousel = await findAsset("Carousel ingredients");
  const guide = await findAsset("Guide: coat care through nutrition");
  const reel = await findAsset("Reel 9:16 – coat");
  const samplingBox = await findAsset("Sampling box design");
  const social = await findChannel("Social Reach (Paid)");
  const autumn = await db.campaign.findUniqueOrThrow({ where: { slug: "autumn-campaign-dog" } });

  const comments: { entityType: string; entityId: string; campaignId: string; author: UserKey; body: string; at: number }[] = [
    {
      entityType: "asset",
      entityId: carousel.id,
      campaignId: carousel.channel.campaignId,
      author: "anna",
      body: "Please finish by the end of the week – the week 3 placement depends on it.",
      at: 50,
    },
    {
      entityType: "asset",
      entityId: carousel.id,
      campaignId: carousel.channel.campaignId,
      author: "ben",
      body: "Final version will be ready on Thursday, we are still waiting for the product shots.",
      at: 26,
    },
    {
      entityType: "channel",
      entityId: social.id,
      campaignId: social.campaignId,
      author: "david",
      body: "Budget shift towards Reels approved – details in the SharePoint folder.",
      at: 72,
    },
    {
      entityType: "campaign",
      entityId: autumn.id,
      campaignId: autumn.id,
      author: "felix",
      body: "Retail partners confirmed placements in 214 stores.",
      at: 5,
    },
    {
      entityType: "asset",
      entityId: samplingBox.id,
      campaignId: samplingBox.channel.campaignId,
      author: "clara",
      body: "Briefing sent to the printer, proof expected next week.",
      at: 8,
    },
  ];
  for (const c of comments) {
    await db.comment.create({
      data: {
        entityType: c.entityType,
        entityId: c.entityId,
        campaignId: c.campaignId,
        authorId: userId(c.author)!,
        body: c.body,
        createdAt: hoursAgo(c.at),
        updatedAt: hoursAgo(c.at),
      },
    });
  }

  const statusChanges: { asset: typeof carousel; from: string; to: string; by: UserKey; at: number }[] = [
    { asset: reel, from: "DONE", to: "LIVE", by: "david", at: 430 },
    { asset: carousel, from: "BRIEFING", to: "IN_PRODUCTION", by: "ben", at: 74 },
    { asset: guide, from: "IN_PRODUCTION", to: "APPROVAL", by: "clara", at: 20 },
  ];
  for (const sc of statusChanges) {
    await db.activityLog.create({
      data: {
        campaignId: sc.asset.channel.campaignId,
        entityType: "asset",
        entityId: sc.asset.id,
        action: "status_changed",
        details: { title: sc.asset.title, from: sc.from, to: sc.to },
        userId: userId(sc.by),
        createdAt: hoursAgo(sc.at),
      },
    });
  }

  const counts = {
    users: await db.user.count(),
    comments: await db.comment.count(),
    channelTypes: await db.channelType.count(),
    campaigns: await db.campaign.count(),
    channels: await db.channel.count(),
    assets: await db.asset.count(),
    creatives: await db.creative.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
