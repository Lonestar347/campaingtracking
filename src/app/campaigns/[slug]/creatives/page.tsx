import { notFound } from "next/navigation";
import { can, getCurrentUser } from "@/lib/auth";
import { getCampaignBySlug, getCampaignCreatives } from "@/lib/queries";
import { creativeImageUrl, creativeKpis, pickCover } from "@/lib/creatives";
import { CreativesBoard, type CreativeView } from "@/components/creatives/creatives-board";

export const metadata = { title: "Creatives · Campaign Tracker" };

// Creatives of a campaign: gallery with images and KPIs. Deep link: ?creative=<id>; sort: ?kpi=<name>.
export default async function CampaignCreativesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ creative?: string; kpi?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [campaign, user] = await Promise.all([getCampaignBySlug(slug), getCurrentUser()]);
  if (!campaign) notFound();
  const creatives = await getCampaignCreatives(campaign.id);
  const cover = pickCover(creatives);

  const views: CreativeView[] = creatives.map((c) => ({
    id: c.id,
    title: c.title,
    channelId: c.channelId,
    channelName: c.channel?.name ?? null,
    format: c.format,
    notes: c.notes,
    kpiValues: c.kpiValues,
    kpis: creativeKpis(c.kpiValues, c.importedValues),
    imageUrl: c.imageKey ? creativeImageUrl(c) : null,
    isCover: c.id === cover?.id,
  }));

  return (
    <CreativesBoard
      key={campaign.id}
      campaignId={campaign.id}
      creatives={views}
      channels={campaign.channels.map((c) => ({ id: c.id, name: c.name }))}
      canEdit={!!user && can(user.role, "write")}
      initialSelectedId={query.creative ?? null}
      initialKpi={query.kpi ?? null}
    />
  );
}
