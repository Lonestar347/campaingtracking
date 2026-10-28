"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatDate, formatDateRange } from "@/lib/dates";
import { ASSET_STATUS_LABELS, FUNNEL_STAGE_LABELS, type AssetStatus } from "@/lib/domain/enums";
import { buildGantt, type GanttRow } from "@/lib/gantt";
import type { CampaignDetail } from "@/lib/queries";
import { STAGE_STYLES } from "@/components/stage-styles";
import type { Selection } from "@/components/mindmap/detail-panel";

const showAssetsKey = "campaign-tracker:gantt-show-assets";

function selectionFor(row: GanttRow): Selection {
  switch (row.kind) {
    case "campaign":
      return { kind: "campaign" };
    case "stage":
      return { kind: "stage", stage: row.stage };
    case "channel":
      return { kind: "channel", id: row.id };
    case "asset":
      return { kind: "asset", id: row.id };
  }
}

function isSelected(row: GanttRow, selection: Selection | null): boolean {
  if (!selection) return false;
  if (row.kind === "campaign") return selection.kind === "campaign";
  if (row.kind === "stage") return selection.kind === "stage" && selection.stage === row.stage;
  return selection.kind === row.kind && "id" in selection && selection.id === row.id;
}

function milestoneColor(row: Extract<GanttRow, { kind: "asset" }>): string {
  if (row.overdue) return "bg-status-red";
  if (row.dueSoon) return "bg-status-yellow";
  if (row.status === "DONE" || row.status === "LIVE") return "bg-status-green";
  if (row.status === "CANCELLED" || row.status === "PAUSED") return "bg-muted-foreground/40";
  return "bg-foreground/70";
}

const pct = (fraction: number) => `${fraction * 100}%`;

/** Timeline of the campaign below the mind map; clicking a row selects it in the mind map. */
export function CampaignGantt({
  campaign,
  now,
  selection,
  onSelect,
}: {
  campaign: CampaignDetail;
  now: Date;
  selection: Selection | null;
  onSelect: (selection: Selection) => void;
}) {
  const [showAssets, setShowAssets] = React.useState(true);
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(showAssetsKey) === "false") setShowAssets(false);
    } catch {
      // Remembering the toggle is a convenience only.
    }
  }, []);
  const toggleAssets = (value: boolean) => {
    setShowAssets(value);
    try {
      window.localStorage.setItem(showAssetsKey, String(value));
    } catch {
      // see above
    }
  };

  const gantt = React.useMemo(() => buildGantt(campaign, now, FUNNEL_STAGE_LABELS), [campaign, now]);
  const rows = showAssets ? gantt.rows : gantt.rows.filter((r) => r.kind !== "asset");
  const assetCount = gantt.rows.filter((r) => r.kind === "asset").length;

  return (
    <section className="rounded-xl border bg-card" aria-labelledby="gantt-title">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
        <h2 id="gantt-title" className="font-semibold">
          Timeline
        </h2>
        <span className="text-sm text-muted-foreground">{formatDateRange(campaign.startDate, campaign.endDate)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-sm bg-stage-awareness" /> Channel period
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-sm border border-dashed border-stage-awareness bg-stage-awareness/25" /> No
            own dates
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rotate-45 bg-foreground/70" /> Due date
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rotate-45 bg-status-red" /> Overdue
          </span>
          {assetCount > 0 && (
            <label className="flex items-center gap-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={showAssets}
                onChange={(e) => toggleAssets(e.target.checked)}
                className="accent-foreground"
              />
              Show assets
            </label>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="relative min-w-[760px] py-2">
          {/* Grid lines and today, behind the rows. */}
          <div className="pointer-events-none absolute inset-y-0 left-56 right-4" aria-hidden>
            {gantt.ticks.map((tick) => (
              <div
                key={tick.at}
                className="absolute inset-y-0 border-l border-border/70"
                style={{ left: pct(tick.at) }}
              />
            ))}
            {gantt.today != null && (
              <div className="absolute inset-y-0 border-l-2 border-josera-ruby/80" style={{ left: pct(gantt.today) }}>
                <span className="absolute bottom-1 left-1 rounded bg-josera-ruby px-1 text-[10px] font-semibold text-white">
                  Today
                </span>
              </div>
            )}
          </div>

          <div className="relative ml-56 mr-4 h-6 text-[11px] text-muted-foreground" aria-hidden>
            {gantt.ticks.map((tick) => (
              <span key={tick.at} className="absolute top-1 whitespace-nowrap pl-1" style={{ left: pct(tick.at) }}>
                {tick.label}
              </span>
            ))}
          </div>

          <ol className="relative">
            {rows.map((row) => (
              <li key={`${row.kind}:${row.id}`}>
                <GanttRowButton
                  row={row}
                  selected={isSelected(row, selection)}
                  onSelect={() => onSelect(selectionFor(row))}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function GanttRowButton({ row, selected, onSelect }: { row: GanttRow; selected: boolean; onSelect: () => void }) {
  const label =
    row.kind === "asset"
      ? `${row.label} · ${row.dueDate ? `due ${formatDate(row.dueDate)}` : "no due date"} · ${ASSET_STATUS_LABELS[row.status as AssetStatus] ?? row.status}`
      : row.label;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={label}
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        "grid w-full grid-cols-[14rem_1fr] items-center pr-4 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none",
        row.kind === "asset" ? "h-7" : "h-9",
        row.kind === "stage" && "mt-1",
        selected && "bg-muted",
      )}
    >
      <span
        className={cn(
          "truncate pr-3",
          row.kind === "campaign" && "pl-4 font-semibold",
          row.kind === "stage" &&
            cn("pl-4 text-xs font-semibold uppercase tracking-wide", STAGE_STYLES[row.stage].text),
          row.kind === "channel" && "pl-7 text-sm font-medium",
          row.kind === "asset" && "pl-10 text-xs text-muted-foreground",
        )}
      >
        {row.label}
      </span>
      <span className="relative block h-full">
        {row.kind === "campaign" && (
          <span
            className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full bg-josera-gold"
            style={{ left: pct(row.bar.left), width: pct(row.bar.width) }}
          />
        )}
        {row.kind === "stage" && row.bar && (
          <span
            className={cn("absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-50", STAGE_STYLES[row.stage].bg)}
            style={{ left: pct(row.bar.left), width: pct(row.bar.width) }}
          />
        )}
        {row.kind === "channel" && (
          <span
            className={cn(
              "absolute top-1/2 h-4 -translate-y-1/2 rounded",
              row.inherited
                ? cn("border border-dashed", STAGE_STYLES[row.stage].border, STAGE_STYLES[row.stage].soft)
                : STAGE_STYLES[row.stage].bg,
            )}
            style={{ left: pct(row.bar.left), width: pct(row.bar.width) }}
          />
        )}
        {row.kind === "asset" &&
          (row.at != null ? (
            <span
              className={cn(
                "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 ring-2 ring-card",
                milestoneColor(row),
                row.status === "CANCELLED" && "opacity-60",
              )}
              style={{ left: pct(row.at) }}
            />
          ) : (
            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[11px] italic text-muted-foreground">
              no due date
            </span>
          ))}
      </span>
    </button>
  );
}
