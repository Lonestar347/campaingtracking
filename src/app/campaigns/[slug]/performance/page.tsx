import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Download, ExternalLink, Info, Upload } from "lucide-react";
import { can, getCurrentUser } from "@/lib/auth";
import { getCampaignBySlug, getCampaignReports } from "@/lib/queries";
import { formatDate, formatDateRange } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FUNNEL_STAGES, FUNNEL_STAGE_LABELS, type FunnelStage } from "@/lib/domain/enums";
import { shortUrl, toLookerEmbedUrl } from "@/lib/links";
import { parseKpiTargets } from "@/lib/validation";
import { computeActuals, lowerIsBetter, type KpiActual } from "@/lib/kpi-import/actuals";
import { buttonVariants } from "@/components/ui/button";
import { STAGE_STYLES } from "@/components/stage-styles";
import { LinkIcon } from "@/components/links/link-icon";
import { AchievementChart, type AchievementRow } from "@/components/kpi-import/achievement-chart";
import { DeleteReportButton } from "@/components/kpi-import/delete-report-button";

function achievementText(kpi: KpiActual): React.ReactNode {
  if (kpi.achievement == null) return <span className="text-muted-foreground">–</span>;
  const percent = kpi.achievement * 100;
  return (
    <span className={cn("font-medium tabular-nums", percent >= 100 && "text-status-green")}>
      {formatNumber(percent, 0)} %
    </span>
  );
}

// Performance view: target vs. actual from imported reports, the report list
// and Looker Studio reports (embedded where allowed).
export default async function PerformancePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ imported?: string; creatives?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [campaign, user] = await Promise.all([getCampaignBySlug(slug), getCurrentUser()]);
  if (!campaign) notFound();
  const canEdit = !!user && can(user.role, "write");
  const { reports, values } = await getCampaignReports(campaign.id);

  const channelById = new Map(campaign.channels.map((c) => [c.id, c]));
  const actuals = computeActuals(
    campaign.channels.map((c) => ({ id: c.id, kpiTargets: parseKpiTargets(c.kpiTargets) })),
    values,
  ).filter((a) => a.kpis.length > 0);
  const ordered = FUNNEL_STAGES.flatMap((stage) =>
    actuals.filter((a) => channelById.get(a.channelId)?.funnelStage === stage),
  );
  const campaignLevel = computeActuals([{ id: "__campaign", kpiTargets: {} }], values.map((v) => ({ ...v, channelId: v.channelId ?? "__campaign" })))[0].kpis;

  const chartRows: AchievementRow[] = ordered.flatMap((a) => {
    const channel = channelById.get(a.channelId)!;
    return a.kpis
      .filter((k) => k.achievement != null && k.target != null && k.actual != null)
      .map((k) => ({
        id: `${a.channelId}-${k.kpiName}`,
        channelName: channel.name,
        kpiName: k.kpiName,
        stage: channel.funnelStage as FunnelStage,
        target: k.target!,
        actual: k.actual!,
        aggregation: k.aggregation,
        lowerIsBetter: lowerIsBetter(k.kpiName),
        percent: k.achievement! * 100,
      }));
  });

  const lookerReports = [
    ...campaign.links.map((link) => ({ link, scope: "Campaign" })),
    ...campaign.channels.flatMap((channel) => channel.links.map((link) => ({ link, scope: channel.name }))),
  ].filter(({ link }) => link.type === "looker_studio");

  const imported = Number(query.imported);
  const creativeValues = Number(query.creatives);

  return (
    <div className="space-y-10">
      {imported > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-status-green bg-status-green/10 px-4 py-2.5 text-sm" role="status">
          <CheckCircle2 className="size-4 text-status-green" /> {formatNumber(imported)} values imported.
          {creativeValues > 0 && (
            <>
              {" "}
              {formatNumber(creativeValues)} of them belong to creatives –{" "}
              <Link href={`/campaigns/${slug}/creatives`} className="font-medium underline underline-offset-2">
                view creatives
              </Link>
              .
            </>
          )}
        </p>
      )}

      <section aria-labelledby="kpi-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="kpi-title" className="text-lg font-semibold">
              Target vs. actual
            </h2>
            <p className="text-sm text-muted-foreground">
              Actuals from all imported reports: counts are summed, rates and cost KPIs (e.g. CTR, CPM) are
              averaged. For cost KPIs, lower is better.
            </p>
          </div>
          {canEdit && (
            <Link href={`/campaigns/${slug}/performance/import`} className={buttonVariants({ variant: "accent" })}>
              <Upload /> Import report
            </Link>
          )}
        </div>

        {chartRows.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Target achievement per KPI</h3>
            <AchievementChart rows={chartRows} />
          </div>
        )}

        {ordered.length === 0 ? (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            No KPI targets or actuals yet. Targets are set on the channels, actuals come from report imports.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Targets and actuals per channel and KPI</caption>
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Channel</th>
                  <th className="px-4 py-2 font-medium">KPI</th>
                  <th className="px-4 py-2 text-right font-medium">Target</th>
                  <th className="px-4 py-2 text-right font-medium">Actual</th>
                  <th className="px-4 py-2 text-right font-medium">Achievement</th>
                  <th className="px-4 py-2 text-right font-medium">Values</th>
                </tr>
              </thead>
              <tbody>
                {ordered.flatMap(({ channelId, kpis }) => {
                  const channel = channelById.get(channelId)!;
                  const stage = channel.funnelStage as FunnelStage;
                  return kpis.map((kpi, index) => (
                    <tr key={`${channelId}-${kpi.kpiName}`} className={cn(index === 0 && "border-t")}>
                      <td className={cn("border-l-4 px-4 py-2", STAGE_STYLES[stage].border)}>
                        {index === 0 && (
                          <>
                            <span className="font-medium">{channel.name}</span>
                            <span className={cn("block text-xs", STAGE_STYLES[stage].text)}>{FUNNEL_STAGE_LABELS[stage]}</span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {kpi.kpiName}
                        {kpi.target == null && <span className="ml-1.5 text-xs text-muted-foreground">(no target)</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {kpi.target != null ? formatNumber(kpi.target) : <span className="text-muted-foreground">–</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {kpi.actual != null ? (
                          <>
                            {kpi.aggregation === "avg" && <span className="text-muted-foreground">avg. </span>}
                            {formatNumber(kpi.actual)}
                          </>
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">{achievementText(kpi)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{kpi.valueCount || "–"}</td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}

        {campaignLevel.length > 0 && (
          <div className="rounded-xl border bg-card p-4">
            <h3 className="text-sm font-semibold">Values without a channel (whole campaign)</h3>
            <ul className="mt-2 flex flex-wrap gap-2 text-sm">
              {campaignLevel.map((k) => (
                <li key={k.kpiName} className="rounded bg-muted px-2 py-0.5">
                  {k.kpiName}: <span className="font-semibold tabular-nums">{k.aggregation === "avg" ? "avg. " : ""}{formatNumber(k.actual)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="imports-title" className="space-y-3">
        <h2 id="imports-title" className="text-lg font-semibold">
          Imported reports ({reports.length})
        </h2>
        {reports.length === 0 ? (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">No reports imported yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">File</th>
                  <th className="px-4 py-2 text-right font-medium">Values</th>
                  <th className="px-4 py-2 font-medium">Uploaded</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2 font-medium">
                      {r.source}
                      {r.channel && <span className="block text-xs font-normal text-muted-foreground">{r.channel.name}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">{formatDateRange(r.periodStart, r.periodEnd)}</td>
                    <td className="px-4 py-2">
                      <a
                        href={`/api/reports/${r.id}/file`}
                        className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
                        download
                      >
                        <Download className="size-3.5 text-muted-foreground" /> {r.originalFileName}
                      </a>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{r._count.values}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                      {formatDate(r.uploadedAt)}
                      {r.uploadedBy && ` · ${r.uploadedBy.name}`}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {canEdit && <DeleteReportButton reportId={r.id} label={`${r.source}, ${r.originalFileName}`} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="looker-title" className="space-y-4">
        <h2 id="looker-title" className="text-lg font-semibold">
          Looker Studio reports
        </h2>
        {lookerReports.length === 0 ? (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            No Looker Studio report linked yet. Reports can be added as a link in the{" "}
            <Link href={`/campaigns/${slug}`} className="underline underline-offset-2">
              mind map
            </Link>{" "}
            on the campaign or on a channel.
          </p>
        ) : (
          lookerReports.map(({ link, scope }) => {
            const embedUrl = link.embed ? toLookerEmbedUrl(link.url) : null;
            return (
              <article key={link.id} className="overflow-hidden rounded-xl border bg-card">
                <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                  <LinkIcon type={link.type} className="text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium">{link.label ?? shortUrl(link.url)}</h3>
                    <p className="text-xs text-muted-foreground">{scope}</p>
                  </div>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <ExternalLink /> Open in Looker Studio
                  </a>
                </header>
                {embedUrl ? (
                  <>
                    <div className="relative aspect-[16/10] w-full bg-muted">
                      <iframe
                        src={embedUrl}
                        title={link.label ?? "Looker Studio report"}
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                        sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                        className="absolute inset-0 size-full border-0"
                      />
                    </div>
                    <p className="flex items-start gap-2 px-4 py-2.5 text-xs text-muted-foreground">
                      <Info className="mt-px size-3.5 shrink-0" />
                      If the area stays empty or asks you to sign in, the report is not enabled for embedding
                      (in Looker Studio: File → Embed report) or you lack access. In that case, view the
                      report via “Open in Looker Studio”.
                    </p>
                  </>
                ) : (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    Not embedded.{" "}
                    {link.embed
                      ? "The link is not a report link (…/reporting/…) and cannot be embedded."
                      : "Embedding can be enabled on the link in the mind map."}
                  </p>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
