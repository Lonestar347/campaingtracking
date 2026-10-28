import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Info } from "lucide-react";
import { getCampaignBySlug } from "@/lib/queries";
import { formatGermanNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FUNNEL_STAGES, FUNNEL_STAGE_LABELS } from "@/lib/domain/enums";
import { shortUrl, toLookerEmbedUrl } from "@/lib/links";
import { parseKpiTargets } from "@/lib/validation";
import { buttonVariants } from "@/components/ui/button";
import { STAGE_STYLES } from "@/components/stage-styles";
import { LinkIcon } from "@/components/links/link-icon";

// Performance view: Looker Studio reports (embedded where allowed) and KPI
// targets per channel. Actuals from uploaded reports are added with the Excel import.
export default async function PerformancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();

  const reports = [
    ...campaign.links.map((link) => ({ link, scope: "Kampagne" })),
    ...campaign.channels.flatMap((channel) => channel.links.map((link) => ({ link, scope: channel.name }))),
  ].filter(({ link }) => link.type === "looker_studio");

  const channelsWithKpis = campaign.channels
    .map((channel) => ({ channel, kpis: Object.entries(parseKpiTargets(channel.kpiTargets)) }))
    .filter(({ kpis }) => kpis.length > 0);

  return (
    <div className="space-y-8">
      <section aria-labelledby="reports-title" className="space-y-4">
        <h2 id="reports-title" className="text-lg font-semibold">
          Looker-Studio-Reports
        </h2>
        {reports.length === 0 ? (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            Noch kein Looker-Studio-Report verknüpft. Reports lassen sich in der{" "}
            <Link href={`/kampagnen/${slug}`} className="underline underline-offset-2">
              Mindmap
            </Link>{" "}
            an der Kampagne oder an einem Kanal als Link hinzufügen.
          </p>
        ) : (
          reports.map(({ link, scope }) => {
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
                    <ExternalLink /> In Looker Studio öffnen
                  </a>
                </header>
                {embedUrl ? (
                  <>
                    <div className="relative aspect-[16/10] w-full bg-muted">
                      <iframe
                        src={embedUrl}
                        title={link.label ?? "Looker-Studio-Report"}
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                        sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                        className="absolute inset-0 size-full border-0"
                      />
                    </div>
                    <p className="flex items-start gap-2 px-4 py-2.5 text-xs text-muted-foreground">
                      <Info className="mt-px size-3.5 shrink-0" />
                      Bleibt die Fläche leer oder erscheint eine Anmeldung, ist der Report nicht für die Einbettung
                      freigegeben (in Looker Studio: Datei → Bericht einbetten) oder es fehlt der Zugriff. Dann den
                      Report über „In Looker Studio öffnen“ ansehen.
                    </p>
                  </>
                ) : (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    Nicht eingebettet.{" "}
                    {link.embed
                      ? "Der Link ist kein Report-Link (…/reporting/…) und kann nicht eingebettet werden."
                      : "Die Einbettung lässt sich am Link in der Mindmap aktivieren."}
                  </p>
                )}
              </article>
            );
          })
        )}
      </section>

      <section aria-labelledby="kpi-title" className="space-y-3">
        <div>
          <h2 id="kpi-title" className="text-lg font-semibold">
            KPI-Ziele je Kanal
          </h2>
          <p className="text-sm text-muted-foreground">
            Ist-Werte werden über den Upload externer Reports (Excel/CSV) ergänzt.
          </p>
        </div>
        {channelsWithKpis.length === 0 ? (
          <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Noch keine KPI-Ziele hinterlegt.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Kanal</th>
                  <th className="px-4 py-2 font-medium">KPI</th>
                  <th className="px-4 py-2 text-right font-medium">Ziel</th>
                  <th className="px-4 py-2 text-right font-medium">Ist</th>
                </tr>
              </thead>
              <tbody>
                {FUNNEL_STAGES.flatMap((stage) =>
                  channelsWithKpis
                    .filter(({ channel }) => channel.funnelStage === stage)
                    .flatMap(({ channel, kpis }) =>
                      kpis.map(([name, target], index) => (
                        <tr key={`${channel.id}-${name}`} className={cn(index === 0 && "border-t")}>
                          <td className={cn("border-l-4 px-4 py-2", STAGE_STYLES[stage].border)}>
                            {index === 0 && (
                              <>
                                <span className="font-medium">{channel.name}</span>
                                <span className={cn("block text-xs", STAGE_STYLES[stage].text)}>
                                  {FUNNEL_STAGE_LABELS[stage]}
                                </span>
                              </>
                            )}
                          </td>
                          <td className="px-4 py-2">{name}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatGermanNumber(target)}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">–</td>
                        </tr>
                      )),
                    ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
