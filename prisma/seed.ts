// Seed data: master data (channel types), demo users and three fictional
// example campaigns. No real campaign data. All dates are relative to the day
// the seed runs, so the example traffic lights stay meaningful:
//   1. "Herbstkampagne Hund"   – running, one asset overdue      -> RED / Live
//   2. "Winter-Sampling Katze" – starts soon, briefings due      -> YELLOW / In Arbeit
//   3. "Frühjahrsaktion Shop"  – far in the future, only ideas   -> GREEN / Planung
//
// Run with: npm run db:seed (wipes existing data first).

import { PrismaClient } from "@prisma/client";
import { DEFAULT_CHANNEL_TYPES } from "../src/lib/domain/channel-types";
import type { AssetStatus, AssetType, FunnelStage } from "../src/lib/domain/enums";
import { launchCharterDataSchema, type LaunchCharterData } from "../src/lib/validation";

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
  links: { type: "frontify" | "sharepoint" | "looker_studio"; url: string; label: string }[];
  channels: ChannelSeed[];
}

const USERS = [
  { key: "anna", name: "Anna Beispiel", email: "anna.beispiel@example.com", role: "admin", team: "Brand" },
  { key: "ben", name: "Ben Muster", email: "ben.muster@example.com", role: "editor", team: "Design" },
  { key: "clara", name: "Clara Probe", email: "clara.probe@example.com", role: "editor", team: "Content" },
  { key: "david", name: "David Test", email: "david.test@example.com", role: "editor", team: "Social Media" },
  { key: "eva", name: "Eva Demo", email: "eva.demo@example.com", role: "editor", team: "Digital Marketplaces" },
  { key: "felix", name: "Felix Platzhalter", email: "felix.platzhalter@example.com", role: "viewer", team: "Sales DE" },
] as const;

type UserKey = (typeof USERS)[number]["key"];

const CAMPAIGNS: CampaignSeed[] = [
  {
    name: "Herbstkampagne Hund",
    slug: "herbstkampagne-hund",
    description: "Fiktive Beispielkampagne: Bekanntheit einer Trockenfutter-Linie für Hunde steigern.",
    brand: "Beispielmarke",
    productLine: "Hund Trockenfutter",
    markets: ["DE", "AT"],
    start: -20,
    end: 40,
    budgetCents: 25_000_000,
    owner: "anna",
    partners: ["Beispiel-Agentur GmbH", "Muster Film Produktion"],
    executionType: "mixed",
    charter: {
      strategy: {
        objective: "Markenbekanntheit in der Zielgruppe um 10 Prozentpunkte steigern",
        targetAudience: "Hundehalter:innen 25–55, qualitätsorientiert",
        keyMessage: "Gute Ernährung, die man sieht.",
        insight: "Halter:innen erkennen Qualität am Fell und an der Energie ihres Hundes.",
        reasonToBelieve: "Ausgewählte Zutaten, entwickelt mit Tierernährungsexpert:innen (fiktiv).",
      },
      budget: {
        totalCents: 25_000_000,
        byFunnelStageCents: { AWARENESS: 15_000_000, CONSIDERATION: 5_000_000, SALES: 5_000_000 },
      },
      links: {
        frontify: "https://example.frontify.com/folder/herbst-hund",
        sharepoint: "https://example.sharepoint.com/sites/marketing/herbst-hund",
        lookerStudio: "https://lookerstudio.google.com/reporting/example-herbst-hund",
      },
      stakeholders: [
        { team: "Brand", people: ["Anna Beispiel"], role: "Lead" },
        { team: "Design", people: ["Ben Muster"], role: "Kreation" },
        { team: "Social Media", people: ["David Test"] },
        { team: "Sales DE", people: ["Felix Platzhalter"], role: "Handelsumsetzung" },
      ],
      approvalProcess: "Kreation → Brand Lead → Geschäftsführung (fiktiv)",
    },
    links: [
      { type: "frontify", url: "https://example.frontify.com/folder/herbst-hund", label: "Frontify-Ordner" },
      { type: "sharepoint", url: "https://example.sharepoint.com/sites/marketing/herbst-hund", label: "SharePoint" },
      { type: "looker_studio", url: "https://lookerstudio.google.com/reporting/example-herbst-hund", label: "Performance-Report" },
    ],
    channels: [
      {
        type: "tv_ctv",
        name: "CTV-Spot",
        owner: "anna",
        start: -20,
        end: 30,
        kpiTargets: { Impressions: 5_000_000, "Completion Rate %": 70 },
        assets: [
          { title: "TV-Spot 20s", assetType: "VIDEO", format: "16:9, 20s", status: "LIVE", due: -25, owner: "ben", approver: "anna" },
          { title: "Cutdown 6s", assetType: "VIDEO", format: "16:9, 6s", status: "FERTIG", due: -15, owner: "ben", approver: "anna" },
        ],
      },
      {
        type: "social_reach_paid",
        owner: "david",
        kpiTargets: { Reichweite: 2_000_000, CPM: 6 },
        assets: [
          { title: "Reel 9:16 – Fell", assetType: "VIDEO", format: "9:16, 15s", status: "LIVE", due: -18, owner: "david", approver: "anna" },
          { title: "Carousel Zutaten", assetType: "CAROUSEL", format: "1:1, 5 Slides", status: "IN_PRODUKTION", due: -3, owner: "ben", approver: "anna" },
          { title: "Story-Set Woche 4", assetType: "STORY", format: "9:16", status: "BRIEFING", due: 12, owner: "david" },
        ],
      },
      {
        type: "website_content",
        owner: "clara",
        kpiTargets: { Sessions: 40_000, "Verweildauer s": 90 },
        assets: [
          { title: "Ratgeber: Fellpflege durch Ernährung", assetType: "TEXT", status: "FREIGABE", due: 3, owner: "clara", approver: "anna" },
          { title: "Landingpage-Header", assetType: "STATIC", format: "1920x600", status: "FERTIG", due: -21, owner: "ben" },
        ],
      },
      {
        type: "pos_retail",
        owner: "felix",
        kpiTargets: { "Platzierungen": 300 },
        assets: [
          { title: "Regalstopper", assetType: "PRINT", format: "DIN A5", status: "FERTIG", due: -30, owner: "ben", approver: "felix" },
          { title: "Aufsteller", assetType: "PRINT", format: "Display 60x180", status: "LIVE", due: -22, owner: "ben", approver: "felix" },
        ],
      },
    ],
  },
  {
    name: "Winter-Sampling Katze",
    slug: "winter-sampling-katze",
    description: "Fiktive Beispielkampagne: Probierpakete für eine Nassfutter-Linie für Katzen.",
    brand: "Beispielmarke",
    productLine: "Katze Nassfutter",
    markets: ["DE", "PL"],
    start: 10,
    end: 70,
    budgetCents: 8_000_000,
    owner: "clara",
    partners: [],
    executionType: "inhouse",
    charter: {
      strategy: {
        objective: "20.000 Probierpakete verteilen, 5 % Wiederkaufrate",
        targetAudience: "Katzenhalter:innen, die die Marke noch nicht kennen",
        keyMessage: "Probieren geht über Studieren.",
        insight: "Katzen sind wählerisch – Halter:innen wechseln Futter nur nach einem Test.",
        reasonToBelieve: "Hohe Akzeptanz in internen Geschmackstests (fiktiv).",
      },
      budget: { totalCents: 8_000_000 },
      links: {},
      stakeholders: [
        { team: "Content", people: ["Clara Probe"], role: "Lead" },
        { team: "Social Media", people: ["David Test"] },
        { team: "Sales International", people: [], role: "Abstimmung PL" },
      ],
      approvalProcess: "Content Lead → Brand",
    },
    links: [
      { type: "sharepoint", url: "https://example.sharepoint.com/sites/marketing/winter-katze", label: "Projektordner" },
    ],
    channels: [
      {
        type: "sampling",
        owner: "clara",
        start: 10,
        end: 60,
        kpiTargets: { "Verteilte Pakete": 20_000 },
        assets: [
          { title: "Sampling-Box Design", assetType: "PRINT", format: "Faltschachtel", status: "BRIEFING", due: 4, owner: "ben", approver: "clara" },
          { title: "Beileger-Flyer", assetType: "PRINT", format: "DIN lang", status: "IDEE", due: 6, owner: "clara" },
        ],
      },
      {
        type: "newsletter_crm",
        owner: "clara",
        kpiTargets: { "Öffnungsrate %": 35, Klicks: 3_000 },
        assets: [
          { title: "Newsletter Anmeldung Probierpaket", assetType: "TEXT", status: "IN_PRODUKTION", due: 9, owner: "clara" },
        ],
      },
      {
        type: "influencer",
        owner: "david",
        kpiTargets: { Reichweite: 500_000 },
        assets: [
          { title: "Unboxing-Briefing", assetType: "TEXT", status: "BRIEFING", due: 15, owner: "david" },
          { title: "Influencer-Kooperation PL", assetType: "VIDEO", status: "ABGEBROCHEN", due: 2, owner: "david" },
        ],
      },
    ],
  },
  {
    name: "Frühjahrsaktion Shop",
    slug: "fruehjahrsaktion-shop",
    description: "Fiktive Beispielkampagne: Abverkaufsaktion über Onlineshop und Marktplätze.",
    brand: "Beispielmarke",
    productLine: "Snacks",
    markets: ["DE", "AT", "PL"],
    start: 60,
    end: 120,
    budgetCents: 4_500_000,
    owner: "eva",
    partners: ["Performance-Agentur Beispiel"],
    executionType: "agency",
    charter: {
      strategy: {
        objective: "Umsatz Snacks online +15 % gegenüber Vorjahreszeitraum",
        targetAudience: "Bestandskund:innen im Onlinehandel",
        keyMessage: "Belohnung für jeden Spaziergang.",
      },
      budget: {
        totalCents: 4_500_000,
        byFunnelStageCents: { CONSIDERATION: 500_000, SALES: 4_000_000 },
      },
      links: {},
      stakeholders: [
        { team: "Digital Marketplaces", people: ["Eva Demo"], role: "Lead" },
        { team: "Design", people: ["Ben Muster"] },
      ],
    },
    links: [],
    channels: [
      {
        type: "digital_marketplaces",
        name: "Amazon & Zooplus",
        owner: "eva",
        kpiTargets: { Umsatz: 120_000, ROAS: 4 },
        assets: [
          { title: "A+ Content Snacks", assetType: "STATIC", status: "IDEE", due: 45, owner: "eva" },
          { title: "Sponsored Brands Video", assetType: "VIDEO", format: "16:9, 15s", status: "IDEE", due: 50, owner: "eva" },
        ],
      },
      {
        type: "promotions",
        owner: "eva",
        kpiTargets: { "Eingelöste Gutscheine": 2_500 },
        assets: [{ title: "Gutschein-Mechanik", assetType: "TEXT", status: "IDEE", due: 40, owner: "eva" }],
      },
      {
        // Example of overriding the default funnel stage (Sales -> Consideration)
        type: "online_shop",
        name: "Onlineshop Ratgeber-Teaser",
        stage: "CONSIDERATION",
        owner: "clara",
        assets: [],
      },
    ],
  },
];

async function main() {
  // Wipe in dependency order.
  await db.activityLog.deleteMany();
  await db.comment.deleteMany();
  await db.kpiValue.deleteMany();
  await db.kpiReport.deleteMany();
  await db.kpiImportMapping.deleteMany();
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
    const charterData = launchCharterDataSchema.parse(c.charter);
    const ownerId = userId(c.owner)!;

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
            versions: { create: { version: 1, data: charterData, createdById: ownerId, changeNote: "Erstanlage" } },
          },
        },
        links: { create: c.links },
      },
    });

    await db.activityLog.create({
      data: { entityType: "campaign", entityId: campaign.id, action: "created", userId: ownerId },
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

  // A couple of comments and status changes so the team features have data.
  const overdue = await db.asset.findFirstOrThrow({ where: { title: "Carousel Zutaten" } });
  await db.comment.create({
    data: {
      entityType: "asset",
      entityId: overdue.id,
      authorId: userId("anna")!,
      body: "Bitte bis Ende der Woche fertigstellen – die Woche-3-Schaltung wartet darauf.",
    },
  });
  await db.activityLog.create({
    data: {
      entityType: "asset",
      entityId: overdue.id,
      action: "status_changed",
      details: { from: "BRIEFING", to: "IN_PRODUKTION" },
      userId: userId("ben"),
    },
  });

  const counts = {
    users: await db.user.count(),
    channelTypes: await db.channelType.count(),
    campaigns: await db.campaign.count(),
    channels: await db.channel.count(),
    assets: await db.asset.count(),
  };
  console.log("Seed complete:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
