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
