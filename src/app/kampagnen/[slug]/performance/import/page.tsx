import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { can, getCurrentUser } from "@/lib/auth";
import { getCampaignBySlug } from "@/lib/queries";
import { parseKpiTargets } from "@/lib/validation";
import { ImportWizard } from "@/components/kpi-import/import-wizard";

export const metadata = { title: "Report importieren · Kampagnen-Tracker" };

export default async function ImportReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [campaign, user] = await Promise.all([getCampaignBySlug(slug), getCurrentUser()]);
  if (!campaign) notFound();
  if (!user || !can(user.role, "write")) redirect(`/kampagnen/${slug}/performance`);

  const knownKpis = [...new Set(campaign.channels.flatMap((c) => Object.keys(parseKpiTargets(c.kpiTargets))))];

  return (
    <div className="space-y-4">
      <Link
        href={`/kampagnen/${slug}/performance`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> Performance
      </Link>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Externen Report importieren</h2>
        <p className="text-sm text-muted-foreground">
          Werte aus Excel- oder CSV-Reports von Agenturen und Partnern den Kanälen und KPI-Zielen zuordnen.
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
