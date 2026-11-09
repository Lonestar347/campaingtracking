"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, toDayNumber } from "@/lib/dates";
import { ASSET_STATUS_LABELS, ASSET_TYPE_LABELS, type AssetStatus, type AssetType } from "@/lib/domain/enums";
import type { LeadTime } from "@/lib/planning/defaults";
import { parseDateInput, toDateInput } from "@/lib/format";
import { DELAY_LABELS, backwardSchedule, type ScheduleAsset, type ScheduleRow } from "@/lib/planning/schedule";
import { applyScheduleDueDates } from "@/app/campaigns/planning-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PHASES = [
  { key: "briefing", label: "Briefing", className: "bg-muted-foreground/40" },
  { key: "production", label: "Production", className: "bg-foreground/60" },
  { key: "approval", label: "Approval", className: "bg-josera-gold" },
] as const;

/** Backward schedule per asset with a small timeline; editors can take over the "ready by" dates as due dates. */
export function BackwardSchedule({
  campaignId,
  assets,
  leadTimes,
  defaultBufferDays,
  canEdit,
}: {
  campaignId: string;
  /** `fallbackGoLive`: channel start, else campaign start (used when the asset has no own go-live). */
  assets: (ScheduleAsset & { fallbackGoLive: Date })[];
  leadTimes: Record<string, LeadTime>;
  defaultBufferDays: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [buffer, setBuffer] = React.useState(defaultBufferDays);
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => setNow(new Date()), []);
  // Own go-live dates as typed (YYYY-MM-DD, "" = channel start).
  const saved = React.useMemo(
    () => Object.fromEntries(assets.map((a) => [a.id, a.goLiveSource === "asset" ? toDateInput(a.goLive) : ""])),
    [assets],
  );
  const [goLives, setGoLives] = React.useState<Record<string, string>>(saved);
  React.useEffect(() => setGoLives(saved), [saved]);
  const effective = React.useMemo(
    () =>
      assets.map((a) => {
        const own = goLives[a.id] ? parseDateInput(goLives[a.id]) : null;
        return own
          ? { ...a, goLive: own, goLiveSource: "asset" as const }
          : {
              ...a,
              goLive: a.fallbackGoLive,
              goLiveSource: a.goLiveSource === "asset" ? ("channel" as const) : a.goLiveSource,
            };
      }),
    [assets, goLives],
  );
  const rows = React.useMemo(
    () => (now ? backwardSchedule(effective, leadTimes, buffer, now) : []),
    [effective, leadTimes, buffer, now],
  );
  const [selected, setSelected] = React.useState<Set<string> | null>(null);
  const goLiveChanged = (id: string) => (goLives[id] ?? "") !== (saved[id] ?? "");
  const changeable = rows.filter((r) => (r.changed && !r.settled) || goLiveChanged(r.id));
  const chosen = selected ?? new Set(changeable.map((r) => r.id));
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  if (!now) return <p className="text-sm text-muted-foreground">Calculating…</p>;
  if (rows.length === 0) {
    return <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">No assets to schedule yet.</p>;
  }

  const day = (d: Date) => toDayNumber(d);
  const first = Math.min(...rows.map((r) => day(r.briefingStart)), day(now)) - 2;
  const last = Math.max(...rows.map((r) => day(r.goLive)), day(now)) + 3;
  const pos = (d: Date | number) => (((typeof d === "number" ? d : day(d)) - first) / (last - first)) * 100;
  const late = rows.filter((r) => r.delay).length;

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setMessage(null);
  };

  const apply = () => {
    const ids = [...chosen].filter((id) => changeable.some((r) => r.id === id));
    if (ids.length === 0) return;
    startTransition(async () => {
      try {
        const result = await applyScheduleDueDates(
          campaignId,
          ids.map((id) => ({ id, goLiveDate: goLives[id] ?? "" })),
          buffer,
        );
        if (result.ok) {
          setMessage({ ok: true, text: `Due dates updated for ${result.count} asset(s).` });
          setSelected(null);
          router.refresh();
        } else setMessage({ ok: false, text: result.error });
      } catch {
        setMessage({ ok: false, text: "Saving failed. Please try again." });
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="buffer">Buffer before go-live</Label>
          <div className="flex items-center gap-2">
            <Input
              id="buffer"
              type="number"
              min={0}
              max={60}
              className="w-20 text-right"
              value={buffer}
              onChange={(e) => {
                setMessage(null);
                setBuffer(Math.max(0, Math.min(60, Math.round(Number(e.target.value) || 0))));
              }}
            />
            <span className="text-sm text-muted-foreground">days</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {PHASES.map((p) => (
            <span key={p.key} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-5 rounded-sm", p.className)} /> {p.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-stage-awareness" /> Go-live
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-josera-ruby" /> Today
          </span>
        </div>
        {late > 0 && (
          <p className="ml-auto rounded-full bg-status-red/10 px-3 py-1 text-sm font-semibold text-status-red">
            {late} asset{late === 1 ? "" : "s"} behind schedule
          </p>
        )}
      </div>

      <div className="relative overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              {canEdit && <th className="w-10 px-3 py-2" aria-label="Select" />}
              <th className="min-w-64 px-3 py-2 font-medium">Asset</th>
              <th className="w-[24%] px-3 py-2 font-medium">Timeline</th>
              <th className="px-3 py-2 font-medium">Briefing by</th>
              <th className="px-3 py-2 font-medium">Production by</th>
              <th className="px-3 py-2 font-medium">Approval by</th>
              <th className="px-3 py-2 font-medium">Ready by</th>
              <th className="px-3 py-2 font-medium">Go-live</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Row
                key={row.id}
                row={row}
                pos={pos}
                today={day(now)}
                canEdit={canEdit}
                checked={chosen.has(row.id)}
                onToggle={() => toggle(row.id)}
                selectable={(row.changed && !row.settled) || goLiveChanged(row.id)}
                goLiveText={goLives[row.id] ?? ""}
                onGoLive={(value) => {
                  setMessage(null);
                  setGoLives((g) => ({ ...g, [row.id]: value }));
                  if (selected) setSelected(new Set(selected).add(row.id));
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="accent"
            onClick={apply}
            disabled={pending || ![...chosen].some((id) => changeable.some((r) => r.id === id))}
          >
            {pending && <Loader2 className="animate-spin" />}
            Set due dates ({[...chosen].filter((id) => changeable.some((r) => r.id === id)).length})
          </Button>
          <p className="text-sm text-muted-foreground">
            Sets the due date of the selected assets to their “ready by” date.
          </p>
          {message && (
            <p
              role="status"
              className={cn(
                "flex items-center gap-1.5 text-sm font-medium",
                message.ok ? "text-status-green" : "text-status-red",
              )}
            >
              {message.ok && <CheckCircle2 className="size-4" />}
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  row,
  pos,
  today,
  canEdit,
  checked,
  onToggle,
  selectable,
  goLiveText,
  onGoLive,
}: {
  row: ScheduleRow;
  selectable: boolean;
  goLiveText: string;
  onGoLive: (value: string) => void;
  pos: (d: Date | number) => number;
  today: number;
  canEdit: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const goLiveHint =
    row.goLiveSource === "asset" ? "own date" : row.goLiveSource === "channel" ? "channel start" : "campaign start";
  const segments = [
    { ...PHASES[0], from: row.briefingStart, to: row.productionStart },
    { ...PHASES[1], from: row.productionStart, to: row.approvalStart },
    { ...PHASES[2], from: row.approvalStart, to: row.readyBy },
  ];
  const cell = (date: Date, phase?: "briefing" | "production" | "approval" | "ready") => (
    <td className={cn("px-3 py-2 tabular-nums", row.delay === phase && "font-semibold text-status-red")}>
      {formatDate(date)}
    </td>
  );
  return (
    <tr className={cn("border-t", row.settled && "text-muted-foreground")}>
      {canEdit && (
        <td className="px-3 py-2">
          {selectable && (
            <input
              type="checkbox"
              className="size-4 accent-foreground"
              checked={checked}
              onChange={onToggle}
              aria-label={`Set due date of ${row.title}`}
            />
          )}
        </td>
      )}
      <td className="px-3 py-2">
        <p className="font-medium text-foreground">{row.title}</p>
        <p className="text-xs text-muted-foreground">
          {row.channelName} · {ASSET_TYPE_LABELS[row.assetType as AssetType] ?? row.assetType} ·{" "}
          {ASSET_STATUS_LABELS[row.status as AssetStatus] ?? row.status}
        </p>
        {row.delay && <p className="text-xs font-semibold text-status-red">{DELAY_LABELS[row.delay]}</p>}
        {!row.settled && row.changed && (
          <p className="text-xs text-muted-foreground">
            due now: {row.dueDate ? formatDate(row.dueDate) : "none"} → {formatDate(row.readyBy)}
          </p>
        )}
      </td>
      <td className="px-3 py-2">
        <div
          className="relative h-5 rounded bg-muted/50"
          role="img"
          aria-label={`Briefing from ${formatDate(row.briefingStart)}, ready by ${formatDate(row.readyBy)}, go-live ${formatDate(row.goLive)}`}
        >
          {segments.map((s) => (
            <span
              key={s.key}
              className={cn("absolute inset-y-1 rounded-sm", s.className, row.settled && "opacity-40")}
              style={{ left: `${pos(s.from)}%`, width: `${Math.max(pos(s.to) - pos(s.from), 0.5)}%` }}
              title={`${s.label}: ${formatDate(s.from)} – ${formatDate(s.to)}`}
            />
          ))}
          <span className="absolute inset-y-0 w-0.5 bg-stage-awareness" style={{ left: `${pos(row.goLive)}%` }} />
          <span className="absolute inset-y-0 w-0.5 bg-josera-ruby" style={{ left: `${pos(today + 0.5)}%` }} />
        </div>
      </td>
      {cell(row.briefingStart, "briefing")}
      {cell(row.productionStart, "production")}
      {cell(row.approvalStart, "approval")}
      {cell(row.readyBy, "ready")}
      <td className="px-3 py-2 tabular-nums">
        {canEdit && !row.settled ? (
          <label className="block">
            <span className="sr-only">Go-live of {row.title}</span>
            <Input
              type="date"
              className="h-8 w-36"
              value={goLiveText || toDateInput(row.goLive)}
              onChange={(e) => onGoLive(e.target.value)}
            />
          </label>
        ) : (
          formatDate(row.goLive)
        )}
        <span className="mt-0.5 block text-xs text-muted-foreground">{goLiveHint}</span>
      </td>
    </tr>
  );
}
