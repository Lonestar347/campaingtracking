import { cache } from "react";
import { db } from "@/lib/db";

/** Campaign with everything the campaign pages need. Cached per request. */
export const getCampaignBySlug = cache(async (slug: string) => {
  return db.campaign.findUnique({
    where: { slug },
    include: {
      owner: { select: { id: true, name: true } },
      links: { orderBy: { createdAt: "asc" } },
      charter: {
        include: {
          versions: {
            orderBy: { version: "desc" },
            include: { createdBy: { select: { name: true } } },
          },
        },
      },
      channels: {
        orderBy: { sortOrder: "asc" },
        include: {
          channelType: { select: { name: true } },
          owner: { select: { name: true } },
          links: { orderBy: { createdAt: "asc" } },
          assets: {
            orderBy: { sortOrder: "asc" },
            include: { owner: { select: { name: true } }, links: { orderBy: { createdAt: "asc" } } },
          },
        },
      },
    },
  });
});

export type CampaignDetail = NonNullable<Awaited<ReturnType<typeof getCampaignBySlug>>>;

/** Users and active channel types for the charter wizard. */
export async function getCharterFormOptions() {
  const [users, channelTypes] = await Promise.all([
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, team: true } }),
    db.channelType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, defaultFunnelStage: true },
    }),
  ]);
  return { users, channelTypes };
}

export type CharterFormOptions = Awaited<ReturnType<typeof getCharterFormOptions>>;

/** All campaigns with what the dashboard needs for rollups, filters and the critical list. */
export async function getDashboardCampaigns() {
  return db.campaign.findMany({
    orderBy: { startDate: "asc" },
    include: {
      owner: { select: { id: true, name: true } },
      channels: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          funnelStage: true,
          assets: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, title: true, status: true, dueDate: true, owner: { select: { name: true } } },
          },
        },
      },
    },
  });
}

/** Imported KPI reports and all their values for a campaign (performance tab). */
export async function getCampaignReports(campaignId: string) {
  const [reports, values] = await Promise.all([
    db.kpiReport.findMany({
      where: { campaignId },
      orderBy: { uploadedAt: "desc" },
      include: {
        uploadedBy: { select: { name: true } },
        channel: { select: { name: true } },
        _count: { select: { values: true } },
      },
    }),
    db.kpiValue.findMany({
      where: { report: { campaignId } },
      select: { channelId: true, kpiName: true, value: true },
    }),
  ]);
  return { reports, values };
}

const activityInclude = { user: { select: { name: true } } } as const;
const commentInclude = { author: { select: { id: true, name: true } } } as const;

/** Comments on a campaign and its channels/assets, oldest first (threads read top to bottom). */
export async function getCampaignComments(campaignId: string) {
  return db.comment.findMany({ where: { campaignId }, orderBy: { createdAt: "asc" }, include: commentInclude });
}

/** Activity log of a campaign, newest first. */
export async function getCampaignActivity(campaignId: string, take = 300) {
  return db.activityLog.findMany({ where: { campaignId }, orderBy: { createdAt: "desc" }, take, include: activityInclude });
}

/** Latest activity across all campaigns (dashboard). */
export async function getRecentActivity(take = 8) {
  return db.activityLog.findMany({
    where: { campaignId: { not: null } },
    orderBy: { createdAt: "desc" },
    take,
    include: { ...activityInclude, campaign: { select: { name: true, slug: true } } },
  });
}

/** Names of all users, channels and assets for describing activity entries. */
export async function getActivityNames() {
  const [users, channels, assets] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true } }),
    db.channel.findMany({ select: { id: true, name: true } }),
    db.asset.findMany({ select: { id: true, title: true } }),
  ]);
  return {
    users: users.map((u) => [u.id, u.name] as [string, string]),
    channels: channels.map((c) => [c.id, c.name] as [string, string]),
    assets: assets.map((a) => [a.id, a.title] as [string, string]),
  };
}

/** All users with how much they own (user administration). */
export async function getUsersWithCounts() {
  return db.user.findMany({
    orderBy: [{ name: "asc" }],
    include: { _count: { select: { ownedCampaigns: true, ownedChannels: true, ownedAssets: true, comments: true } } },
  });
}
