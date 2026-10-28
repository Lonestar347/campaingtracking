"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { FUNNEL_STAGES, FUNNEL_STAGE_LABELS, type FunnelStage } from "@/lib/domain/enums";
import { formatNumber } from "@/lib/format";

export interface AchievementRow {
  id: string;
  channelName: string;
  kpiName: string;
  stage: FunnelStage;
  target: number;
  actual: number;
  aggregation: "sum" | "avg";
  lowerIsBetter: boolean;
  /** Achievement in percent (100 = target met). */
  percent: number;
}

const stageColor = (stage: FunnelStage) => `var(--stage-${stage.toLowerCase()})`;
const ROW_HEIGHT = 40;
const LABEL_WIDTH = 210;

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Two-line category label: KPI name, channel below (full text in the tooltip). */
function CategoryTick({ x, y, payload, rows }: { x?: number; y?: number; payload?: { index: number }; rows: AchievementRow[] }) {
  const row = payload ? rows[payload.index] : undefined;
  if (!row || x == null || y == null) return null;
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="end" fill="var(--foreground)" fontSize={12} fontWeight={500} dy={-2}>
        {clip(row.kpiName, 30)}
      </text>
      <text textAnchor="end" fill="var(--muted-foreground)" fontSize={11} dy={12}>
        {clip(row.channelName, 32)}
      </text>
    </g>
  );
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  const row = active ? (payload?.[0]?.payload as AchievementRow | undefined) : undefined;
  if (!row) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-foreground">{row.kpiName}</p>
      <p className="mb-1.5 text-muted-foreground">
        {row.channelName} · {FUNNEL_STAGE_LABELS[row.stage]}
      </p>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
        <dt className="text-muted-foreground">Target</dt>
        <dd className="text-right text-foreground">{formatNumber(row.target)}</dd>
        <dt className="text-muted-foreground">Actual{row.aggregation === "avg" ? " (avg.)" : ""}</dt>
        <dd className="text-right text-foreground">{formatNumber(row.actual)}</dd>
        <dt className="text-muted-foreground">Achievement</dt>
        <dd className="text-right font-semibold text-foreground">{formatNumber(row.percent, 0)} %</dd>
      </dl>
      {row.lowerIsBetter && <p className="mt-1.5 text-muted-foreground">Cost KPI: lower is better</p>}
    </div>
  );
}

/**
 * Target achievement per channel KPI on one common axis (100 % = target met),
 * because the KPIs themselves have unrelated scales. Bars carry the funnel
 * stage colour; exact values are in the tooltip and in the table below.
 */
export function AchievementChart({ rows }: { rows: AchievementRow[] }) {
  const max = Math.max(150, Math.ceil(Math.max(...rows.map((r) => r.percent)) / 50) * 50);
  const stages = FUNNEL_STAGES.filter((s) => rows.some((r) => r.stage === s));
  const data = rows.map((r) => ({ ...r, label: `${r.channelName} · ${r.kpiName}`, bar: Math.min(r.percent, max) }));

  return (
    <figure className="space-y-3">
      <div style={{ height: rows.length * ROW_HEIGHT + 48 }} className="text-xs">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              type="number"
              domain={[0, max]}
              ticks={Array.from({ length: max / 50 + 1 }, (_, i) => i * 50)}
              tickFormatter={(v: number) => `${v} %`}
              tick={{ fill: "var(--muted-foreground)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={LABEL_WIDTH}
              tick={<CategoryTick rows={rows} />}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
            <ReferenceLine
              x={100}
              stroke="var(--foreground)"
              strokeDasharray="4 3"
              label={{ value: "Target", position: "top", fill: "var(--muted-foreground)", fontSize: 11 }}
            />
            <Bar dataKey="bar" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
              {data.map((row) => (
                <Cell key={row.id} fill={stageColor(row.stage)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {stages.length > 1 && (
        <figcaption className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {stages.map((stage) => (
            <span key={stage} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: stageColor(stage) }} aria-hidden />
              {FUNNEL_STAGE_LABELS[stage]}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}
