"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { formatDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";

export interface TrendPoint {
  /** Day as epoch milliseconds. */
  t: number;
  actual: number | null;
  plan: number | null;
}

function TrendTooltip({ active, payload, planLabel }: TooltipProps<number, string> & { planLabel: string }) {
  const point = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined;
  if (!point) return null;
  return (
    <div className="rounded-lg border bg-card px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium text-foreground">{formatDate(new Date(point.t))}</p>
      <dl className="mt-0.5 grid grid-cols-[auto_auto] gap-x-3 tabular-nums">
        {point.actual != null && (
          <>
            <dt className="text-muted-foreground">Actual</dt>
            <dd className="text-right text-foreground">{formatNumber(point.actual)}</dd>
          </>
        )}
        {point.plan != null && (
          <>
            <dt className="text-muted-foreground">{planLabel}</dt>
            <dd className="text-right text-foreground">{formatNumber(point.plan)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

/** Axis label anchored inside the chart: the first at its start, the last at its end. */
function EdgeTick({ x, y, payload, first }: { x?: number; y?: number; payload?: { value: number }; first?: number }) {
  if (x == null || y == null || !payload) return null;
  return (
    <text
      x={x}
      y={y + 12}
      fontSize={10}
      fill="var(--muted-foreground)"
      textAnchor={payload.value === first ? "start" : "end"}
    >
      {formatDate(new Date(payload.value)).slice(0, 5)}
    </text>
  );
}

/**
 * Small trend of a headline KPI: cumulative actual against the linear plan for
 * counts, daily values against the target line for rates.
 */
export function KpiTrendChart({
  points,
  color,
  planLabel,
}: {
  points: TrendPoint[];
  color: string;
  planLabel: string;
}) {
  const first = points[0]?.t;
  const last = points.at(-1)?.t;
  return (
    <div className="h-24" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={first != null && last != null ? [first, last] : []}
            tick={<EdgeTick first={first} />}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            interval={0}
          />
          <YAxis hide domain={[0, "auto"]} />
          <Tooltip content={<TrendTooltip planLabel={planLabel} />} cursor={{ stroke: "var(--border)" }} />
          <Line
            dataKey="plan"
            stroke="var(--muted-foreground)"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line dataKey="actual" stroke={color} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
