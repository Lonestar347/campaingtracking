import Link from "next/link";
import { Plus } from "lucide-react";
import { can, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateRange, formatEuroCents } from "@/lib/dates";
import { EXECUTION_TYPE_LABELS, FUNNEL_STAGES, FUNNEL_STAGE_LABELS, type ExecutionType } from "@/lib/domain/enums";
import { rollupCampaign } from "@/lib/status";
import { parseStringList } from "@/lib/validation";
import {
  MarketBadge,
  PhaseBadge,
  ProgressBar,
  StageDot,
  TrafficLightBadge,
} from "@/components/status-badges";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

// Campaign overview with derived status. The full dashboard (filters,
// comparison, critical section) follows in phase 4.
export default async function HomePage() {
  const campaigns = await db.campaign.findMany({
    orderBy: { startDate: "asc" },
    include: {
      owner: { select: { name: true } },
      channels: { include: { assets: { select: { status: true, dueDate: true } } } },
    },
  });
  const now = new Date();
  const user = await getCurrentUser();
  const canCreate = !!user && can(user.role, "write");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kampagnen</h1>
          <p className="text-sm text-muted-foreground">Alle Kampagnen mit abgeleitetem Status.</p>
        </div>
        {canCreate && (
          <Link href="/kampagnen/neu" className={buttonVariants({ variant: "accent" })}>
            <Plus /> Neue Kampagne
          </Link>
        )}
      </div>

      {campaigns.length === 0 ? (
        <p className="rounded-lg border p-6 text-sm text-muted-foreground">
          Noch keine Kampagnen. Neue Kampagne über die Launch Charter anlegen oder Beispieldaten laden mit{" "}
          <code>npm run db:seed</code>.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const rollup = rollupCampaign(campaign, now);
            return (
              <li
                key={campaign.id}
                className="relative flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold leading-tight">
                    <Link href={`/kampagnen/${campaign.slug}`} className="outline-none after:absolute after:inset-0">
                      {campaign.name}
                    </Link>
                  </h2>
                  <PhaseBadge value={rollup.campaign.phase} />
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {parseStringList(campaign.markets).map((m) => (
                    <MarketBadge key={m} market={m} />
                  ))}
                  <span className="ml-auto">
                    <TrafficLightBadge value={rollup.campaign.trafficLight} />
                  </span>
                </div>

                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Zeitraum</dt>
                  <dd>{formatDateRange(campaign.startDate, campaign.endDate)}</dd>
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd>{campaign.owner.name}</dd>
                  <dt className="text-muted-foreground">Umsetzung</dt>
                  <dd>{EXECUTION_TYPE_LABELS[campaign.executionType as ExecutionType]}</dd>
                  <dt className="text-muted-foreground">Budget</dt>
                  <dd>{formatEuroCents(campaign.budgetCents)}</dd>
                </dl>

                <ProgressBar progress={rollup.campaign.progress} />

                <ul className="space-y-1 border-t pt-3 text-sm">
                  {FUNNEL_STAGES.map((stage) => {
                    const s = rollup.stages[stage];
                    return (
                      <li key={stage} className="flex items-center gap-2">
                        <StageDot stage={stage} />
                        <span className="flex-1">{FUNNEL_STAGE_LABELS[stage]}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {s.progress.done}/{s.progress.total}
                        </span>
                        <TrafficLightBadge value={s.trafficLight} className="w-20 text-xs" />
                      </li>
                    );
                  })}
                </ul>

                {rollup.campaign.overdueCount > 0 && (
                  <p className="text-sm font-medium text-status-red">
                    {rollup.campaign.overdueCount} Asset(s) überfällig
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
