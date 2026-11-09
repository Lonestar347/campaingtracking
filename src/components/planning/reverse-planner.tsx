"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEuroCents } from "@/lib/dates";
import { formatNumber, parseNumberInput } from "@/lib/format";
import { FUNNEL_STAGES, FUNNEL_STAGE_LABELS, type FunnelStage } from "@/lib/domain/enums";
import type { BenchmarkValues } from "@/lib/planning/defaults";
import {
  budgetCheck,
  computeReversePlan,
  type PlanChannel,
  type ReversePlanInput,
  type ReversePlanResult,
} from "@/lib/planning/reverse";
import { applyReversePlan, saveReversePlan } from "@/app/campaigns/planning-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STAGE_STYLES } from "@/components/stage-styles";
import { BENCHMARK_FIELDS } from "@/components/settings/benchmark-admin";
import { KpiDatalist } from "@/components/kpi-datalist";
import { ExtraKpiEditor, extraKpiErrors, toExtraKpis, type ExtraKpiText } from "@/components/planning/extra-kpi-editor";
import { AddPlanChannel, type ChannelTypeOption } from "@/components/planning/add-plan-channel";
import { EXTRA_KPI_BASE } from "@/lib/planning/defaults";

type Field = keyof BenchmarkValues;
/** `extraKpis` null = the channel type's additional KPIs (master data). */
type ChannelTexts = { share: string; extraKpis: ExtraKpiText[] | null } & Record<Field, string>;
const EMPTY_TEXTS: ChannelTexts = {
  share: "",
  cpm: "",
  frequency: "",
  rateToNext: "",
  costPerAction: "",
  avgOrderValue: "",
  extraKpis: null,
};

interface Props {
  campaignId: string;
  channels: (PlanChannel & { currentTargets: Record<string, number> })[];
  initialPlan: ReversePlanInput;
  /** Saved plan exists (else defaults are shown). */
  saved: boolean;
  budgetEuro: number | null;
  canEdit: boolean;
  /** Channel types for "Add channel". */
  channelTypes: ChannelTypeOption[];
}

const text = (v: number | null | undefined) => (v == null ? "" : formatNumber(v, 4));
const euro = (v: number | null | undefined) => (v == null ? "–" : formatEuroCents(Math.round(v * 100)));
const count = (v: number | null | undefined) => (v == null ? "–" : formatNumber(Math.round(v), 0));

/** Parses the form texts into plan input; invalid fields are reported by id. */
function toPlan(
  goalType: "units" | "revenue",
  texts: { goal: string; aov: string; a2c: string; c2s: string },
  channelTexts: Record<string, ChannelTexts>,
): { plan: ReversePlanInput | null; invalid: Set<string> } {
  const invalid = new Set<string>();
  const num = (id: string, value: string) => {
    if (value.trim() === "") return null;
    const n = parseNumberInput(value);
    if (n == null || n < 0) invalid.add(id);
    return n;
  };
  const goal = num("goal", texts.goal);
  if (goal == null || goal <= 0) invalid.add("goal");
  const channels: ReversePlanInput["channels"] = {};
  for (const [id, t] of Object.entries(channelTexts)) {
    const share = num(`${id}.share`, t.share);
    if (share != null && share > 100) invalid.add(`${id}.share`);
    channels[id] = {
      ...(share != null ? { share } : {}),
      cpm: num(`${id}.cpm`, t.cpm),
      frequency: num(`${id}.frequency`, t.frequency),
      rateToNext: num(`${id}.rateToNext`, t.rateToNext),
      costPerAction: num(`${id}.costPerAction`, t.costPerAction),
      avgOrderValue: num(`${id}.avgOrderValue`, t.avgOrderValue),
    };
    if (t.extraKpis) {
      if (extraKpiErrors(t.extraKpis).size > 0) invalid.add(`${id}.extraKpis`);
      else channels[id].extraKpis = toExtraKpis(t.extraKpis);
    }
  }
  const plan: ReversePlanInput = {
    goalType,
    goalValue: goal ?? 0,
    avgOrderValue: num("aov", texts.aov),
    awarenessToConsideration: num("a2c", texts.a2c),
    considerationToSales: num("c2s", texts.c2s),
    channels,
  };
  return { plan: invalid.size === 0 ? plan : null, invalid };
}

export function ReversePlanner({ campaignId, channels, initialPlan, saved, budgetEuro, canEdit, channelTypes }: Props) {
  const router = useRouter();
  const [goalType, setGoalType] = React.useState(initialPlan.goalType);
  const [texts, setTexts] = React.useState({
    goal: text(initialPlan.goalValue),
    aov: text(initialPlan.avgOrderValue),
    a2c: text(initialPlan.awarenessToConsideration),
    c2s: text(initialPlan.considerationToSales),
  });
  const [channelTexts, setChannelTexts] = React.useState<Record<string, ChannelTexts>>(() =>
    Object.fromEntries(
      channels.map((c) => {
        const o = initialPlan.channels[c.id] ?? {};
        return [
          c.id,
          {
            share: text(o.share),
            cpm: text(o.cpm),
            frequency: text(o.frequency),
            rateToNext: text(o.rateToNext),
            costPerAction: text(o.costPerAction),
            avgOrderValue: text(o.avgOrderValue),
            extraKpis: o.extraKpis ? o.extraKpis.map((k) => ({ name: k.name, rate: text(k.rate) })) : null,
          },
        ];
      }),
    ),
  );
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const { plan, invalid } = toPlan(goalType, texts, channelTexts);
  const result = plan ? computeReversePlan(channels, plan) : null;
  const budget = result ? budgetCheck(result, budgetEuro) : null;

  const setText = (key: keyof typeof texts, value: string) => {
    setMessage(null);
    setTexts((t) => ({ ...t, [key]: value }));
  };
  const setChannel = (id: string, field: Exclude<keyof ChannelTexts, "extraKpis">, value: string) => {
    setMessage(null);
    setChannelTexts((t) => ({ ...t, [id]: { ...(t[id] ?? EMPTY_TEXTS), [field]: value } }));
  };
  const setExtras = (id: string, items: ExtraKpiText[] | null) => {
    setMessage(null);
    setChannelTexts((t) => ({ ...t, [id]: { ...(t[id] ?? EMPTY_TEXTS), extraKpis: items } }));
  };

  const run = (apply: boolean) => {
    if (!plan) return;
    if (apply) {
      const changed = result?.channels.filter((c) => Object.keys(c.kpis).length > 0).length ?? 0;
      if (
        !window.confirm(
          `Write the planned KPI targets into ${changed} channel(s)? Targets with the same KPI name are replaced.`,
        )
      )
        return;
    }
    startTransition(async () => {
      try {
        const response = apply ? await applyReversePlan(campaignId, plan) : await saveReversePlan(campaignId, plan);
        if (response.ok) {
          setMessage({
            ok: true,
            text: apply ? `Plan saved, KPI targets updated in ${response.count} channel(s).` : "Plan saved.",
          });
          router.refresh();
        } else setMessage({ ok: false, text: response.error });
      } catch {
        setMessage({ ok: false, text: "Saving failed. Please try again." });
      }
    });
  };

  const placeholder = (v: number | null | undefined, digits = 2) => (v == null ? "–" : formatNumber(v, digits));

  return (
    <div className="space-y-6">
      <KpiDatalist />
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        {/* Goal and funnel rates */}
        <section aria-labelledby="goal-title" className="space-y-4 rounded-2xl border bg-card p-5">
          <h3 id="goal-title" className="flex items-center gap-2 font-semibold">
            <Target className="size-4 text-josera-gold" aria-hidden /> Goal
          </h3>
          <div role="radiogroup" aria-label="Goal type" className="grid grid-cols-2 rounded-lg border p-1 text-sm">
            {(
              [
                ["units", "Units sold"],
                ["revenue", "Revenue (€)"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={goalType === value}
                onClick={() => {
                  setMessage(null);
                  setGoalType(value);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  goalType === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-goal">{goalType === "units" ? "Units to sell" : "Revenue goal (€)"}</Label>
            <Input
              id="plan-goal"
              inputMode="decimal"
              className="h-11 text-lg font-semibold"
              value={texts.goal}
              onChange={(e) => setText("goal", e.target.value)}
              aria-invalid={invalid.has("goal")}
            />
            {invalid.has("goal") && <p className="text-xs font-medium text-status-red">Enter a positive number.</p>}
          </div>
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Funnel rates</p>
            <RateInput
              id="plan-c2s"
              label="Consideration → sales"
              hint="Sessions that lead to a sale"
              unit="%"
              value={texts.c2s}
              placeholder={placeholder(result?.benchmarkRates.considerationToSales)}
              invalid={invalid.has("c2s")}
              onChange={(v) => setText("c2s", v)}
            />
            <RateInput
              id="plan-a2c"
              label="Awareness → consideration"
              hint="Impressions that lead to a session"
              unit="%"
              value={texts.a2c}
              placeholder={placeholder(result?.benchmarkRates.awarenessToConsideration, 3)}
              invalid={invalid.has("a2c")}
              onChange={(v) => setText("a2c", v)}
            />
            <RateInput
              id="plan-aov"
              label="Average order value"
              hint="To convert units and revenue"
              unit="€"
              value={texts.aov}
              placeholder={placeholder(result?.benchmarkRates.avgOrderValue)}
              invalid={invalid.has("aov")}
              onChange={(v) => setText("aov", v)}
            />
            <p className="text-xs text-muted-foreground">
              Empty fields use the channel benchmarks (grey values), weighted by the channel shares.
            </p>
          </div>
        </section>

        {/* Result */}
        <div className="space-y-4">
          <ResultChain result={result} />
          <BudgetPanel result={result} budget={budget} budgetEuro={budgetEuro} />
          {result && result.warnings.length > 0 && (
            <ul className="space-y-1 rounded-xl border border-status-yellow bg-status-yellow/10 p-3 text-sm">
              {result.warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-yellow" /> {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Channels */}
      <section aria-labelledby="plan-channels" className="space-y-3">
        <div>
          <h3 id="plan-channels" className="text-lg font-semibold">
            Split across channels
          </h3>
          <p className="text-sm text-muted-foreground">
            Share of each stage&apos;s volume per channel (empty = equal split) and benchmark overrides for this plan.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {FUNNEL_STAGES.map((stage) => (
            <StageChannels
              key={stage}
              stage={stage}
              channels={channels.filter((c) => c.stage === stage)}
              planned={result?.channels ?? []}
              texts={channelTexts}
              invalid={invalid}
              onChange={setChannel}
              onExtras={setExtras}
              campaignId={campaignId}
              canEdit={canEdit}
              channelTypes={channelTypes}
            />
          ))}
        </div>
      </section>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
          <Button variant="accent" disabled={!plan || pending} onClick={() => run(true)}>
            {pending && <Loader2 className="animate-spin" />}
            Apply as KPI targets
          </Button>
          <Button variant="outline" disabled={!plan || pending} onClick={() => run(false)}>
            Save plan
          </Button>
          <p className="text-sm text-muted-foreground">
            {saved ? "A saved plan is loaded." : "Not saved yet – showing a suggestion."} Applying writes Impressions,
            Reach, Sessions, Units sold and Revenue as targets of the channels.
          </p>
          {message && (
            <p
              role="status"
              className={cn(
                "flex w-full items-center gap-1.5 text-sm font-medium",
                message.ok ? "text-status-green" : "text-status-red",
              )}
            >
              {message.ok && <CheckCircle2 className="size-4" />}
              {message.text}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You can try values here; saving needs editor rights.</p>
      )}
    </div>
  );
}

function RateInput({
  id,
  label,
  hint,
  unit,
  value,
  placeholder,
  invalid,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  unit: string;
  value: string;
  placeholder: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_7rem] items-center gap-2">
      <Label htmlFor={id} className="flex flex-col items-start gap-0">
        <span>{label}</span>
        <span className="text-xs font-normal text-muted-foreground">{hint}</span>
      </Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          className="pr-7 text-right"
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          {unit}
        </span>
      </div>
    </div>
  );
}

function Tile({ stage, label, value, sub }: { stage: FunnelStage; label: string; value: string; sub?: string }) {
  return (
    <div
      className={cn("min-w-0 flex-1 rounded-xl border-t-4 p-4", STAGE_STYLES[stage].fill)}
      style={{ borderTopColor: `var(--stage-${stage.toLowerCase()})` }}
    >
      <p className={cn("text-xs font-semibold uppercase tracking-wide", STAGE_STYLES[stage].text)}>
        {FUNNEL_STAGE_LABELS[stage]}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      <p className="truncate text-2xl font-semibold tabular-nums" title={value}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Step({ rate, label }: { rate: number | null; label: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center px-1 text-center text-xs text-muted-foreground">
      <ArrowLeft className="size-5 text-foreground max-md:rotate-90" aria-hidden />
      <span className="font-semibold tabular-nums text-foreground">
        {rate != null ? `${formatNumber(rate, 3)} %` : "–"}
      </span>
      <span>{label}</span>
    </div>
  );
}

/** Funnel order left to right, calculated right to left from the goal. */
function ResultChain({ result }: { result: ReversePlanResult | null }) {
  return (
    <section aria-labelledby="chain-title" className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="chain-title" className="font-semibold">
          What it takes
        </h3>
        <p className="text-sm text-muted-foreground">Calculated backwards from the goal ←</p>
      </div>
      <div className="flex flex-col items-stretch gap-2 md:flex-row">
        <Tile
          stage="AWARENESS"
          label="Impressions"
          value={count(result?.impressions)}
          sub={result?.reach != null ? `≈ ${count(result.reach)} people reached` : undefined}
        />
        <Step rate={result?.rates.awarenessToConsideration ?? null} label="to session" />
        <Tile stage="CONSIDERATION" label="Sessions" value={count(result?.sessions)} />
        <Step rate={result?.rates.considerationToSales ?? null} label="to sale" />
        <Tile
          stage="SALES"
          label="Units sold"
          value={count(result?.units)}
          sub={result?.revenue != null ? `${euro(result.revenue)} revenue` : undefined}
        />
      </div>
      {result?.reach != null && (
        <p className="text-xs text-muted-foreground">
          Reach is summed per channel; people reached by several channels count more than once.
        </p>
      )}
    </section>
  );
}

function BudgetPanel({
  result,
  budget,
  budgetEuro,
}: {
  result: ReversePlanResult | null;
  budget: ReturnType<typeof budgetCheck>;
  budgetEuro: number | null;
}) {
  if (!result) return null;
  const coverage = budget ? Math.min(budget.coverage, 1) : null;
  const enough = budget ? budget.coverage >= 1 : null;
  return (
    <section aria-labelledby="budget-title" className="space-y-3 rounded-2xl border bg-card p-5">
      <h3 id="budget-title" className="font-semibold">
        Media budget needed
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">Awareness (CPM)</p>
          <p className="text-lg font-semibold tabular-nums">{euro(result.cost.awareness)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Consideration (cost per session)</p>
          <p className="text-lg font-semibold tabular-nums">{euro(result.cost.consideration)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-semibold tabular-nums">{euro(result.cost.total)}</p>
        </div>
      </div>
      {budget && coverage != null ? (
        <div className="space-y-1.5">
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", enough ? "bg-status-green" : "bg-status-yellow")}
              style={{ width: `${coverage * 100}%` }}
            />
          </div>
          <p className={cn("text-sm font-medium", enough ? "text-status-green" : "text-status-yellow")}>
            {enough
              ? `The campaign budget of ${euro(budget.budget)} covers the plan (${euro(-budget.gap)} left).`
              : `The campaign budget of ${euro(budget.budget)} covers ${formatNumber(budget.coverage * 100, 0)} % – about ${count(budget.achievableUnits)} units, ${euro(budget.gap)} missing.`}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {budgetEuro == null ? "No campaign budget set in the launch charter." : "No media costs in the plan yet."}
        </p>
      )}
    </section>
  );
}

function StageChannels({
  stage,
  channels,
  planned,
  texts,
  invalid,
  onChange,
  onExtras,
  campaignId,
  canEdit,
  channelTypes,
}: {
  stage: FunnelStage;
  channels: Props["channels"];
  planned: ReversePlanResult["channels"];
  texts: Record<string, ChannelTexts>;
  invalid: Set<string>;
  onChange: (id: string, field: Exclude<keyof ChannelTexts, "extraKpis">, value: string) => void;
  onExtras: (id: string, items: ExtraKpiText[] | null) => void;
  campaignId: string;
  canEdit: boolean;
  channelTypes: ChannelTypeOption[];
}) {
  const fields = BENCHMARK_FIELDS[stage];
  return (
    <section
      aria-label={FUNNEL_STAGE_LABELS[stage]}
      className="space-y-3 rounded-2xl border border-t-4 bg-card p-4"
      style={{ borderTopColor: `var(--stage-${stage.toLowerCase()})` }}
    >
      <h4 className={cn("font-semibold", STAGE_STYLES[stage].text)}>{FUNNEL_STAGE_LABELS[stage]}</h4>
      {channels.length === 0 && <p className="text-sm text-muted-foreground">No channels in this stage.</p>}
      {channels.map((channel) => {
        const p = planned.find((x) => x.id === channel.id);
        const t = texts[channel.id] ?? EMPTY_TEXTS;
        const masterExtras = channel.extraKpis ?? [];
        return (
          <article key={channel.id} className="space-y-3 rounded-xl border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium leading-tight">{channel.name}</p>
              {p?.cost != null && (
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{euro(p.cost)}</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ChannelInput
                id={`${channel.id}-share`}
                label="Share"
                unit="%"
                value={t.share}
                placeholder={p ? formatNumber(p.share * 100, 1) : ""}
                invalid={invalid.has(`${channel.id}.share`)}
                onChange={(v) => onChange(channel.id, "share", v)}
              />
              {fields.map((f) => (
                <ChannelInput
                  key={f.field}
                  id={`${channel.id}-${f.field}`}
                  label={f.label}
                  unit={f.unit === "%" ? "%" : f.unit.startsWith("€") ? "€" : ""}
                  value={t[f.field]}
                  placeholder={channel.benchmark[f.field] != null ? formatNumber(channel.benchmark[f.field], 4) : "–"}
                  invalid={invalid.has(`${channel.id}.${f.field}`)}
                  onChange={(v) => onChange(channel.id, f.field, v)}
                />
              ))}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Additional KPIs <span className="font-normal">(% of {EXTRA_KPI_BASE[stage]})</span>
                </p>
                {t.extraKpis ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => onExtras(channel.id, null)}
                  >
                    Use benchmark
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() =>
                      onExtras(
                        channel.id,
                        masterExtras.map((k) => ({ name: k.name, rate: text(k.rate) })),
                      )
                    }
                  >
                    {masterExtras.length > 0 ? "Adjust" : "Add KPI"}
                  </Button>
                )}
              </div>
              {t.extraKpis ? (
                <ExtraKpiEditor
                  idPrefix={`plan-extra-${channel.id}`}
                  items={t.extraKpis}
                  base={EXTRA_KPI_BASE[stage]}
                  onChange={(items) => onExtras(channel.id, items)}
                />
              ) : masterExtras.length > 0 ? (
                <p className="flex flex-wrap gap-1.5">
                  {masterExtras.map((k) => (
                    <span key={k.name} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                      {k.name} · {formatNumber(k.rate, 4)} %
                    </span>
                  ))}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">None</p>
              )}
              {invalid.has(`${channel.id}.extraKpis`) && (
                <p className="text-xs font-medium text-status-red">Each KPI needs a unique name and a rate.</p>
              )}
            </div>
            {p && Object.keys(p.kpis).length > 0 && (
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-lg bg-muted/60 px-3 py-2 text-sm">
                {Object.entries(p.kpis).map(([name, value]) => {
                  const current = Object.entries(channel.currentTargets).find(
                    ([k]) => k.toLowerCase() === name.toLowerCase(),
                  )?.[1];
                  return (
                    <React.Fragment key={name}>
                      <dt className="text-muted-foreground">{name}</dt>
                      <dd className="text-right tabular-nums">
                        <span className="font-semibold">{formatNumber(value, 0)}</span>
                        {current != null && current !== value && (
                          <span className="ml-1.5 text-xs text-muted-foreground">now {formatNumber(current, 0)}</span>
                        )}
                      </dd>
                    </React.Fragment>
                  );
                })}
              </dl>
            )}
          </article>
        );
      })}
      {canEdit && <AddPlanChannel campaignId={campaignId} stage={stage} channelTypes={channelTypes} />}
    </section>
  );
}

function ChannelInput({
  id,
  label,
  unit,
  value,
  placeholder,
  invalid,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  value: string;
  placeholder: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          className={cn("h-8 text-right", unit && "pr-6")}
          value={value}
          placeholder={placeholder}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
        />
        {unit && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
