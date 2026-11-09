import { notFound } from "next/navigation";
import Link from "next/link";
import { can, getCurrentUser } from "@/lib/auth";
import { getCampaignBySlug, getPlanningMasterData } from "@/lib/queries";
import { parseKpiTargets } from "@/lib/validation";
import type { FunnelStage } from "@/lib/domain/enums";
import { DEFAULT_BUFFER_DAYS, EMPTY_BENCHMARK } from "@/lib/planning/defaults";
import { PLAN_KPIS, parseReversePlan, type ReversePlanInput } from "@/lib/planning/reverse";
import { ReversePlanner } from "@/components/planning/reverse-planner";
import { BackwardSchedule } from "@/components/planning/backward-schedule";

export const metadata = { title: "Planning · Campaign Tracker" };

// Reverse planning: KPI targets calculated back from the sales goal via
// benchmarks, and a backward schedule from each channel's go-live.
export default async function CampaignPlanningPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [campaign, user, master] = await Promise.all([
    getCampaignBySlug(slug),
    getCurrentUser(),
    getPlanningMasterData(),
  ]);
  if (!campaign) notFound();
  const canEdit = !!user && can(user.role, "write");

  const benchmarkByType = new Map(master.benchmarks.map((b) => [b.channelTypeId, b]));
  const channels = campaign.channels.map((c) => ({
    id: c.id,
    name: c.name,
    stage: c.funnelStage as FunnelStage,
    benchmark: benchmarkByType.get(c.channelTypeId)?.values ?? EMPTY_BENCHMARK,
    extraKpis: benchmarkByType.get(c.channelTypeId)?.extraKpis ?? [],
    currentTargets: parseKpiTargets(c.kpiTargets),
  }));

  const stored = parseReversePlan(campaign.reversePlan);
  // Suggestion: the current "Units sold" targets, else a round number.
  const currentUnits = channels.reduce((sum, c) => sum + (c.currentTargets[PLAN_KPIS.units] ?? 0), 0);
  const initialPlan: ReversePlanInput = stored ?? {
    goalType: "units",
    goalValue: currentUnits || 10_000,
    channels: {},
  };

  const assets = campaign.channels.flatMap((c) =>
    c.assets.map((a) => ({
      id: a.id,
      title: a.title,
      assetType: a.assetType,
      status: a.status,
      dueDate: a.dueDate,
      channelId: c.id,
      channelName: c.name,
      goLive: a.goLiveDate ?? c.startDate ?? campaign.startDate,
      goLiveSource: a.goLiveDate ? ("asset" as const) : c.startDate ? ("channel" as const) : ("campaign" as const),
      fallbackGoLive: c.startDate ?? campaign.startDate,
    })),
  );

  return (
    <div className="space-y-12">
      <section aria-labelledby="reverse-title" className="space-y-4">
        <div>
          <h2 id="reverse-title" className="text-xl font-semibold">
            Reverse planning: KPIs
          </h2>
          <p className="text-base text-muted-foreground">
            Start from the sales goal and work back through the funnel: how many sessions, impressions and people
            reached it takes, and what that costs. Benchmarks come from{" "}
            <Link href="/settings/benchmarks" className="underline underline-offset-2">
              Settings → Benchmarks
            </Link>{" "}
            and can be overridden here.
          </p>
        </div>
        <ReversePlanner
          campaignId={campaign.id}
          channels={channels}
          initialPlan={initialPlan}
          saved={!!stored}
          budgetEuro={campaign.budgetCents != null ? campaign.budgetCents / 100 : null}
          canEdit={canEdit}
          channelTypes={master.benchmarks
            .filter((b) => b.active)
            .map((b) => ({ id: b.channelTypeId, name: b.name, stage: b.stage }))}
        />
      </section>

      <section aria-labelledby="schedule-title" className="space-y-4">
        <div>
          <h2 id="schedule-title" className="text-xl font-semibold">
            Reverse planning: schedule
          </h2>
          <p className="text-base text-muted-foreground">
            Counted back from each asset&apos;s go-live (its own go-live date, else the channel start, else the campaign
            start) with the lead times per asset type: the latest dates to start briefing, production and approval.
          </p>
        </div>
        <BackwardSchedule
          campaignId={campaign.id}
          assets={assets}
          leadTimes={master.leadTimes}
          defaultBufferDays={DEFAULT_BUFFER_DAYS}
          canEdit={canEdit}
        />
      </section>
    </div>
  );
}
