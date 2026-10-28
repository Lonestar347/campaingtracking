import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { getCampaignBySlug } from "@/lib/queries";
import { formatDate, formatDateRange } from "@/lib/dates";
import { formatGermanNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  type AssetStatus,
  type AssetType,
} from "@/lib/domain/enums";
import { isDueSoonAndBehind, isOverdue, rollupCampaign, summarizeAssets } from "@/lib/status";
import { parseKpiTargets } from "@/lib/validation";
import { ProgressBar, TrafficLightBadge } from "@/components/status-badges";
import { STAGE_STYLES } from "@/components/stage-styles";
import { LinkIcon } from "@/components/links/link-icon";
import { LINK_TYPE_LABELS } from "@/lib/links";

// Funnel view: channels per funnel stage in three columns. KPI actuals follow in phase 6.
export default async function CampaignFunnelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();
  const now = new Date();
  const rollup = rollupCampaign(campaign, now);

  return (
    <div className="space-y-6">
      {campaign.links.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {campaign.links.map((link) => (
            <li key={link.id}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm hover:bg-muted"
              >
                <LinkIcon type={link.type} className="text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">
                  {LINK_TYPE_LABELS[link.type as keyof typeof LINK_TYPE_LABELS] ?? link.type}
                </span>
                {link.label ?? link.url}
                <ExternalLink className="size-3.5 text-muted-foreground" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {FUNNEL_STAGES.map((stage) => {
          const channels = campaign.channels.filter((c) => c.funnelStage === stage);
          const summary = rollup.stages[stage];
          return (
            <section key={stage} className={cn("rounded-xl border border-t-4 bg-card", STAGE_STYLES[stage].border)}>
              <header className="space-y-2 border-b px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className={cn("font-semibold", STAGE_STYLES[stage].text)}>{FUNNEL_STAGE_LABELS[stage]}</h2>
                  <TrafficLightBadge value={summary.trafficLight} className="text-xs" />
                </div>
                <ProgressBar progress={summary.progress} />
              </header>

              <div className="space-y-3 p-3">
                {channels.length === 0 && (
                  <p className="px-1 py-2 text-sm text-muted-foreground">Keine Kanäle in dieser Stufe.</p>
                )}
                {channels.map((channel) => {
                  const channelSummary = summarizeAssets(channel.assets, now);
                  const kpis = Object.entries(parseKpiTargets(channel.kpiTargets));
                  return (
                    <article key={channel.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-medium leading-tight">{channel.name}</h3>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {channel.channelType.name !== channel.name && `${channel.channelType.name} · `}
                            {channel.owner?.name ?? "Owner offen"}
                            {(channel.startDate || channel.endDate) &&
                              ` · ${formatDateRange(channel.startDate, channel.endDate)}`}
                          </p>
                        </div>
                        <TrafficLightBadge value={channelSummary.trafficLight} className="shrink-0 text-xs" />
                      </div>

                      {kpis.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {kpis.map(([name, target]) => (
                            <li key={name} className="rounded bg-muted px-1.5 py-0.5 text-xs">
                              {name}: <span className="font-semibold tabular-nums">{formatGermanNumber(target)}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {channel.assets.length > 0 && (
                        <>
                          <div className="mt-3">
                            <ProgressBar progress={channelSummary.progress} />
                          </div>
                          <ul className="mt-2 divide-y text-sm">
                            {channel.assets.map((asset) => {
                              const overdue = isOverdue(asset, now);
                              const dueSoon = !overdue && isDueSoonAndBehind(asset, now);
                              return (
                                <li key={asset.id} className="flex items-center gap-2 py-1.5">
                                  <span className="min-w-0 flex-1 truncate" title={asset.title}>
                                    {asset.title}
                                    <span className="ml-1.5 text-xs text-muted-foreground">
                                      {ASSET_TYPE_LABELS[asset.assetType as AssetType] ?? asset.assetType}
                                    </span>
                                  </span>
                                  {asset.dueDate && (
                                    <span
                                      className={cn(
                                        "shrink-0 text-xs tabular-nums",
                                        overdue
                                          ? "font-semibold text-status-red"
                                          : dueSoon
                                            ? "font-medium text-status-yellow"
                                            : "text-muted-foreground",
                                      )}
                                      title={overdue ? "Überfällig" : dueSoon ? "Bald fällig" : "Fällig"}
                                    >
                                      {formatDate(asset.dueDate)}
                                    </span>
                                  )}
                                  <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-xs">
                                    {ASSET_STATUS_LABELS[asset.status as AssetStatus] ?? asset.status}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
