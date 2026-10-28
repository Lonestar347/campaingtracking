import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { can, getCurrentUser } from "@/lib/auth";
import { getCampaignBySlug } from "@/lib/queries";
import { formatDate, formatDateRange, formatEuroCents } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  EXECUTION_TYPE_LABELS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  type ExecutionType,
} from "@/lib/domain/enums";
import { changedCharterSections } from "@/lib/charter/plan";
import {
  launchCharterDataSchema,
  parseKpiTargets,
  parseStringList,
  type LaunchCharterData,
} from "@/lib/validation";
import { buttonVariants } from "@/components/ui/button";
import { PrintButton } from "@/components/print-button";
import { STAGE_STYLES } from "@/components/stage-styles";

function parseCharter(data: unknown): LaunchCharterData | null {
  const result = launchCharterDataSchema.safeParse(data);
  return result.success ? result.data : null;
}

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border-t py-5 first:border-t-0 first:pt-0">
      <h2 className="mb-3 flex items-baseline gap-2 font-semibold">
        <span className="text-sm tabular-nums text-muted-foreground">{number}.</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="whitespace-pre-line">{value || "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

const ExternalUrl = ({ url }: { url?: string }) =>
  url ? (
    <a href={url} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">
      {url}
    </a>
  ) : (
    "–"
  );

export default async function CharterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [campaign, user] = await Promise.all([getCampaignBySlug(slug), getCurrentUser()]);
  if (!campaign) notFound();

  const charter = campaign.charter;
  const data = parseCharter(charter?.data);
  const versions = charter?.versions ?? [];
  const canEdit = !!user && can(user.role, "write");
  const partners = parseStringList(campaign.partners);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <article className="rounded-xl border bg-card p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
        <header className="mb-6 flex flex-wrap items-start gap-3">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Launch charter</p>
            <h2 className="text-xl font-semibold">{campaign.name}</h2>
            {charter && (
              <p className="text-sm text-muted-foreground">
                Version {charter.currentVersion} · as of {formatDate(charter.updatedAt)}
              </p>
            )}
          </div>
          <div className="flex gap-2 print:hidden">
            <PrintButton />
            {canEdit && (
              <Link href={`/campaigns/${slug}/charter/edit`} className={buttonVariants({ size: "sm" })}>
                <Pencil /> Edit
              </Link>
            )}
          </div>
        </header>

        {!data && (
          <p className="mb-6 rounded-lg border border-status-yellow p-3 text-sm">
            This campaign has no complete charter.
            {canEdit && " It can be completed via “Edit”."}
          </p>
        )}

        <Section number={1} title="Basics">
          <Rows
            rows={[
              ["Campaign", campaign.name],
              ["Description", campaign.description],
              ["Brand / product line", [campaign.brand, campaign.productLine].filter(Boolean).join(" / ")],
              ["Markets", parseStringList(campaign.markets).join(", ")],
              ["Period", formatDateRange(campaign.startDate, campaign.endDate)],
              ["Owner", campaign.owner.name],
              ["Execution", EXECUTION_TYPE_LABELS[campaign.executionType as ExecutionType] ?? campaign.executionType],
              ["Partners", partners.join("\n")],
            ]}
          />
        </Section>

        <Section number={2} title="Strategy">
          <Rows
            rows={[
              ["Objective", data?.strategy.objective],
              ["Target audience", data?.strategy.targetAudience],
              ["Key message", data?.strategy.keyMessage],
              ["Insight", data?.strategy.insight],
              ["Reason to Believe", data?.strategy.reasonToBelieve],
            ]}
          />
        </Section>

        <Section number={3} title="Budget">
          <Rows
            rows={[
              ["Total budget", formatEuroCents(campaign.budgetCents)],
              ...FUNNEL_STAGES.filter((s) => data?.budget.byFunnelStageCents?.[s] != null).map(
                (s) => [FUNNEL_STAGE_LABELS[s], formatEuroCents(data!.budget.byFunnelStageCents![s])] as [string, string],
              ),
            ]}
          />
        </Section>

        <Section number={4} title="Channels & KPI targets">
          <p className="mb-3 text-xs text-muted-foreground">Current state of the campaign.</p>
          {campaign.channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No channels.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-3 print:grid-cols-3">
              {FUNNEL_STAGES.map((stage) => (
                <div key={stage}>
                  <h3 className={cn("mb-2 text-sm font-semibold", STAGE_STYLES[stage].text)}>
                    {FUNNEL_STAGE_LABELS[stage]}
                  </h3>
                  <ul className="space-y-2 text-sm">
                    {campaign.channels
                      .filter((c) => c.funnelStage === stage)
                      .map((c) => {
                        const kpis = Object.entries(parseKpiTargets(c.kpiTargets));
                        return (
                          <li key={c.id} className={cn("border-l-2 pl-2", STAGE_STYLES[stage].border)}>
                            <span className="font-medium">{c.name}</span>
                            {kpis.length > 0 && (
                              <span className="block text-xs text-muted-foreground">
                                {kpis.map(([k, v]) => `${k}: ${formatNumber(v)}`).join(" · ")}
                              </span>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section number={5} title="Assets">
          {campaign.channels.every((c) => c.assets.length === 0) ? (
            <p className="text-sm text-muted-foreground">No assets.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {campaign.channels
                .filter((c) => c.assets.length > 0)
                .map((c) => (
                  <li key={c.id}>
                    <span className="font-medium">{c.name}:</span>{" "}
                    {c.assets.map((a) => a.title).join(", ")}
                  </li>
                ))}
            </ul>
          )}
        </Section>

        <Section number={6} title="Links">
          <Rows
            rows={[
              ["Frontify folder", <ExternalUrl key="f" url={data?.links.frontify} />],
              ["SharePoint folder", <ExternalUrl key="s" url={data?.links.sharepoint} />],
              ["Looker Studio report", <ExternalUrl key="l" url={data?.links.lookerStudio} />],
            ]}
          />
        </Section>

        <Section number={7} title="Stakeholders & approval">
          {data && data.stakeholders.length > 0 ? (
            <ul className="mb-4 space-y-1 text-sm">
              {data.stakeholders.map((s, i) => (
                <li key={i}>
                  <span className="font-medium">{s.team}</span>
                  {s.role && <span className="text-muted-foreground"> ({s.role})</span>}
                  {s.people.length > 0 && `: ${s.people.join(", ")}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-4 text-sm text-muted-foreground">No stakeholders added.</p>
          )}
          <Rows rows={[["Approval process", data?.approvalProcess]]} />
        </Section>
      </article>

      <aside className="print:hidden">
        <h2 className="mb-3 text-sm font-semibold">Versions</h2>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No versions yet.</p>
        ) : (
          <ol className="space-y-3">
            {versions.map((v, index) => {
              const previous = versions[index + 1];
              const current = parseCharter(v.data);
              const before = previous ? parseCharter(previous.data) : null;
              const changed = current && before ? changedCharterSections(before, current) : [];
              return (
                <li key={v.id} className="rounded-lg border bg-card p-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">Version {v.version}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(v.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{v.createdBy?.name ?? "Unknown"}</p>
                  {v.changeNote && <p className="mt-1.5">{v.changeNote}</p>}
                  {changed.length > 0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">Changed: {changed.join(", ")}</p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </aside>
    </div>
  );
}
