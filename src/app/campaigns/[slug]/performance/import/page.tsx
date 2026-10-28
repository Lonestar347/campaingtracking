import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { can, getCurrentUser } from "@/lib/auth";
import { getCampaignBySlug } from "@/lib/queries";
import { parseKpiTargets } from "@/lib/validation";
import { ImportWizard } from "@/components/kpi-import/import-wizard";

export const metadata = { title: "Import report · Campaign Tracker" };

export default async function ImportReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [campaign, user] = await Promise.all([getCampaignBySlug(slug), getCurrentUser()]);
  if (!campaign) notFound();
  if (!user || !can(user.role, "write")) redirect(`/campaigns/${slug}/performance`);

  const knownKpis = [...new Set(campaign.channels.flatMap((c) => Object.keys(parseKpiTargets(c.kpiTargets))))];

  return (
    <div className="space-y-4">
      <Link
        href={`/campaigns/${slug}/performance`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Performance
      </Link>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Import external report</h2>
        <p className="text-sm text-muted-foreground">
          Map values from agency and partner Excel or CSV reports to channels and KPI targets.
        </p>
      </div>
      <ImportWizard
        campaignId={campaign.id}
        slug={slug}
        channels={campaign.channels.map((c) => ({ id: c.id, name: c.name }))}
        knownKpis={knownKpis}
      />
    </div>
  );
}
