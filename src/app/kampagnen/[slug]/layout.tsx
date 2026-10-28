import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCampaignBySlug } from "@/lib/queries";
import { formatDateRange } from "@/lib/dates";
import { rollupCampaign } from "@/lib/status";
import { parseStringList } from "@/lib/validation";
import { MarketBadge, PhaseBadge, ProgressBar, TrafficLightBadge } from "@/components/status-badges";
import { CampaignTabs } from "@/components/campaign-tabs";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  return { title: campaign ? `${campaign.name} · Kampagnen-Tracker` : "Kampagne nicht gefunden" };
}

export default async function CampaignLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}) {
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();
  const rollup = rollupCampaign(campaign, new Date());

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ChevronLeft className="size-4" /> Alle Kampagnen
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{campaign.name}</h1>
          <PhaseBadge value={rollup.campaign.phase} />
          <TrafficLightBadge value={rollup.campaign.trafficLight} />
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
