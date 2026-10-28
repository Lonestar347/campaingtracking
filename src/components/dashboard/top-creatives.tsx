import Link from "next/link";
import { ImageIcon, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { lowerIsBetter } from "@/lib/kpi-import/actuals";
import type { CreativeKpi, RankedCreative } from "@/lib/creatives";

export interface TopCreative {
  id: string;
  title: string;
  kpis: CreativeKpi[];
  imageUrl: string | null;
  campaignName: string;
  campaignSlug: string;
  channelName: string | null;
}

/** Best creatives across the (filtered) campaigns for one KPI; KPI chips switch via ?kpi=. */
export function TopCreatives({
  ranked,
  kpi,
  kpiOptions,
  hrefForKpi,
}: {
  ranked: RankedCreative<TopCreative>[];
  kpi: string | null;
  kpiOptions: string[];
  hrefForKpi: (kpi: string) => string;
}) {
  return (
    <section aria-labelledby="top-creatives" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="top-creatives" className="flex items-center gap-2 text-xl font-semibold">
            <Trophy className="size-5 text-josera-gold" aria-hidden /> Top creatives
          </h2>
          <p className="text-base text-muted-foreground">
            {kpi
              ? `Best performing creatives by ${kpi}${lowerIsBetter(kpi) ? " (lowest is best)" : ""}.`
              : "Best performing creatives by KPI."}
          </p>
        </div>
        {kpiOptions.length > 0 && (
          <nav aria-label="Rank by KPI" className="flex flex-wrap gap-1.5">
            {kpiOptions.map((option) => (
              <Link
                key={option}
                href={hrefForKpi(option)}
                scroll={false}
                aria-current={option === kpi ? "true" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-3.5 text-sm transition-colors",
                  option === kpi ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
                )}
              >
                {option}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {ranked.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-base text-muted-foreground">
          No creatives with KPI values yet. Add them in a campaign&apos;s Creatives tab or import a report with a
          creative column.
        </p>
      ) : (
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ranked.map(({ creative, kpi: value, rank }) => (
            <li
              key={creative.id}
              className="relative overflow-hidden rounded-2xl border bg-card shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md"
            >
              <div className="relative aspect-[4/3] bg-muted">
                {creative.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- served by our own API route
                  <img src={creative.imageUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-7" aria-hidden />
                  </div>
                )}
                <span
                  className={cn(
                    "absolute left-3 top-3 flex size-9 items-center justify-center rounded-full text-base font-bold shadow-sm",
                    rank === 1 ? "bg-josera-gold text-black" : "bg-background/90 text-foreground",
                  )}
                >
                  {rank}
                </span>
              </div>
              <div className="space-y-1 p-4">
                <p className="text-2xl font-semibold tabular-nums">
                  {formatNumber(value.value)}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">{value.kpiName}</span>
                </p>
                <p className="font-medium leading-snug">
                  <Link
                    href={`/campaigns/${creative.campaignSlug}/creatives?creative=${creative.id}`}
                    className="outline-none after:absolute after:inset-0"
                  >
                    {creative.title}
                  </Link>
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {[creative.campaignName, creative.channelName].filter(Boolean).join(" · ")}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
