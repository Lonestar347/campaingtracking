"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, parseNumberInput } from "@/lib/format";
import { ASSET_TYPES, ASSET_TYPE_LABELS, FUNNEL_STAGES, FUNNEL_STAGE_LABELS, type AssetType } from "@/lib/domain/enums";
import type { BenchmarkValues, LeadTime } from "@/lib/planning/defaults";
import type { PlanningMasterData } from "@/lib/queries";
import { saveBenchmarks, saveLeadTimes } from "@/app/settings/benchmark-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STAGE_STYLES } from "@/components/stage-styles";

type Field = keyof BenchmarkValues;

/** Columns that matter per funnel stage. */
export const BENCHMARK_FIELDS: Record<(typeof FUNNEL_STAGES)[number], { field: Field; label: string; unit: string }[]> =
  {
    AWARENESS: [
      { field: "cpm", label: "CPM", unit: "€ / 1,000 impressions" },
      { field: "frequency", label: "Frequency", unit: "impressions per person" },
      { field: "rateToNext", label: "Impression → session", unit: "%" },
    ],
    CONSIDERATION: [
      { field: "costPerAction", label: "Cost per session", unit: "€" },
      { field: "rateToNext", label: "Session → sale", unit: "%" },
    ],
    SALES: [{ field: "avgOrderValue", label: "Average order value", unit: "€" }],
  };

const toText = (v: number | null) => (v == null ? "" : formatNumber(v, 4));

function useSave(action: (rows: unknown) => Promise<{ ok: true } | { ok: false; error: string }>) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const save = (rows: unknown) =>
    startTransition(async () => {
      try {
        const result = await action(rows);
        setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error });
        if (result.ok) router.refresh();
      } catch {
        setMessage({ ok: false, text: "Saving failed. Please try again." });
      }
    });
  return { pending, message, save, clear: () => setMessage(null) };
}

function SaveBar({
  pending,
  message,
  disabled,
}: {
  pending: boolean;
  message: { ok: boolean; text: string } | null;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={pending || disabled}>
        {pending && <Loader2 className="animate-spin" />}
        Save
      </Button>
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
  );
}

export function BenchmarkAdmin({
  canEdit,
  benchmarks,
  leadTimes,
}: {
  canEdit: boolean;
  benchmarks: PlanningMasterData["benchmarks"];
  leadTimes: Record<AssetType, LeadTime>;
}) {
  const [values, setValues] = React.useState(
    () =>
      Object.fromEntries(
        benchmarks.map((b) => [
          b.channelTypeId,
          Object.fromEntries(Object.entries(b.values).map(([k, v]) => [k, toText(v)])),
        ]),
      ) as Record<string, Record<Field, string>>,
  );
  const [times, setTimes] = React.useState(
    () => Object.fromEntries(ASSET_TYPES.map((t) => [t, { ...leadTimes[t] }])) as Record<AssetType, LeadTime>,
  );
  const benchmarkSave = useSave(saveBenchmarks);
  const leadTimeSave = useSave(saveLeadTimes);

  const invalid = new Set(
    Object.entries(values).flatMap(([id, row]) =>
      Object.entries(row)
        .filter(([, text]) => text.trim() !== "" && parseNumberInput(text) == null)
        .map(([field]) => `${id}.${field}`),
    ),
  );

  const submitBenchmarks = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid.size > 0) return;
    benchmarkSave.save(
      benchmarks.map((b) => {
        const row = values[b.channelTypeId];
        const num = (f: Field) => parseNumberInput(row[f] ?? "");
        return {
          channelTypeId: b.channelTypeId,
          cpm: num("cpm"),
          frequency: num("frequency"),
          rateToNext: num("rateToNext"),
          costPerAction: num("costPerAction"),
          avgOrderValue: num("avgOrderValue"),
        };
      }),
    );
  };

  return (
    <div className="space-y-8">
      <form onSubmit={submitBenchmarks} className="space-y-4">
        <h2 className="text-lg font-semibold">Benchmarks per channel type</h2>
        <div className="grid gap-4">
          {FUNNEL_STAGES.map((stage) => (
            <section
              key={stage}
              aria-label={FUNNEL_STAGE_LABELS[stage]}
              className="min-w-0 rounded-2xl border border-t-4 bg-card p-4"
              style={{ borderTopColor: `var(--stage-${stage.toLowerCase()})` }}
            >
              <h3 className={cn("mb-3 font-semibold", STAGE_STYLES[stage].text)}>{FUNNEL_STAGE_LABELS[stage]}</h3>
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-2 font-medium">Channel type</th>
                      {BENCHMARK_FIELDS[stage].map((f) => (
                        <th key={f.field} className="pb-2 pl-2 font-medium" title={f.unit}>
                          {f.label}
                          <span className="block font-normal">{f.unit}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarks
                      .filter((b) => b.stage === stage)
                      .map((b) => (
                        <tr key={b.channelTypeId} className="border-t">
                          <td className="py-1.5 pr-2">{b.name}</td>
                          {BENCHMARK_FIELDS[stage].map((f) => {
                            const id = `bm-${b.channelTypeId}-${f.field}`;
                            return (
                              <td key={f.field} className="py-1.5 pl-2">
                                <label htmlFor={id} className="sr-only">
                                  {b.name}: {f.label}
                                </label>
                                <Input
                                  id={id}
                                  inputMode="decimal"
                                  className="h-8 w-24 text-right"
                                  value={values[b.channelTypeId][f.field]}
                                  disabled={!canEdit}
                                  aria-invalid={invalid.has(`${b.channelTypeId}.${f.field}`)}
                                  onChange={(e) => {
                                    benchmarkSave.clear();
                                    setValues((v) => ({
                                      ...v,
                                      [b.channelTypeId]: { ...v[b.channelTypeId], [f.field]: e.target.value },
                                    }));
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
        {invalid.size > 0 && (
          <p className="text-sm font-medium text-status-red">Please enter numbers only (e.g. 6 or 0.8).</p>
        )}
        {canEdit ? (
          <SaveBar pending={benchmarkSave.pending} message={benchmarkSave.message} disabled={invalid.size > 0} />
        ) : (
          <p className="text-sm text-muted-foreground">Only admins can change benchmarks.</p>
        )}
      </form>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          leadTimeSave.save(ASSET_TYPES.map((assetType) => ({ assetType, ...times[assetType] })));
        }}
        className="space-y-4"
      >
        <div>
          <h2 className="text-lg font-semibold">Lead times per asset type</h2>
          <p className="text-sm text-muted-foreground">
            Calendar days for the backward schedule: briefing, then production, then approval – counted back from the
            go-live of each asset (default: the channel start).
          </p>
        </div>
        <div className="relative overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Asset type</th>
                <th className="px-4 py-2 font-medium">Briefing</th>
                <th className="px-4 py-2 font-medium">Production</th>
                <th className="px-4 py-2 font-medium">Approval</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {ASSET_TYPES.map((type) => {
                const t = times[type];
                return (
                  <tr key={type} className="border-t">
                    <td className="px-4 py-1.5 font-medium">{ASSET_TYPE_LABELS[type]}</td>
                    {(["briefingDays", "productionDays", "approvalDays"] as const).map((field) => (
                      <td key={field} className="px-4 py-1.5">
                        <label className="flex items-center gap-1.5">
                          <span className="sr-only">
                            {ASSET_TYPE_LABELS[type]} {field.replace("Days", "")}
                          </span>
                          <Input
                            type="number"
                            min={0}
                            max={365}
                            className="h-8 w-20 text-right"
                            value={t[field]}
                            disabled={!canEdit}
                            onChange={(e) => {
                              leadTimeSave.clear();
                              const n = Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0)));
                              setTimes((v) => ({ ...v, [type]: { ...v[type], [field]: n } }));
                            }}
                          />
                          <span className="text-xs text-muted-foreground">days</span>
                        </label>
                      </td>
                    ))}
                    <td className="px-4 py-1.5 text-right tabular-nums">
                      {t.briefingDays + t.productionDays + t.approvalDays} days
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canEdit && <SaveBar pending={leadTimeSave.pending} message={leadTimeSave.message} />}
      </form>
    </div>
  );
}
