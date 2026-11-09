import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCampaignBySlug } from "@/lib/queries";
import { can, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DeleteCampaignButton } from "@/components/delete-campaign-button";
import { formatDateRange } from "@/lib/dates";
import { rollupCampaign } from "@/lib/status";
import { parseStringList } from "@/lib/validation";
import { MarketBadge, PhaseBadge, ProgressBar, TrafficLightBadge } from "@/components/status-badges";
import { CampaignTabs } from "@/components/campaign-tabs";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  return { title: campaign ? `${campaign.name} · Campaign Tracker` : "Campaign not found" };
}

export default async function CampaignLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const [campaign, user] = await Promise.all([getCampaignBySlug(slug), getCurrentUser()]);
  if (!campaign) notFound();
  const rollup = rollupCampaign(campaign, new Date());
  const canDelete = !!user && can(user.role, "manage");
  const counts = canDelete
    ? {
        channels: campaign.channels.length,
        assets: campaign.channels.reduce((n, c) => n + c.assets.length, 0),
        creatives: await db.creative.count({ where: { campaignId: campaign.id } }),
        reports: await db.kpiReport.count({ where: { campaignId: campaign.id } }),
      }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ChevronLeft className="size-4" /> All campaigns
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
          <PhaseBadge value={rollup.campaign.phase} />
          <TrafficLightBadge value={rollup.campaign.trafficLight} />
          {counts && (
            <span className="ml-auto">
              <DeleteCampaignButton campaignId={campaign.id} name={campaign.name} counts={counts} />
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <span>{formatDateRange(campaign.startDate, campaign.endDate)}</span>
          <span>Owner: {campaign.owner.name}</span>
          <span className="flex gap-1">
            {parseStringList(campaign.markets).map((m) => (
              <MarketBadge key={m} market={m} />
            ))}
          </span>
          <span className="w-40">
            <ProgressBar progress={rollup.campaign.progress} />
          </span>
        </div>
      </div>
      <CampaignTabs slug={slug} />
      {children}
    </div>
  );
}
