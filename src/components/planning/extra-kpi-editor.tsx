"use client";

import { Plus, X } from "lucide-react";
import { parseNumberInput } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ExtraKpiText {
  name: string;
  rate: string;
}

/** Problems of the entered additional KPIs (by row index), e.g. missing name or rate. */
export function extraKpiErrors(items: readonly ExtraKpiText[]): Map<number, string> {
  const errors = new Map<number, string>();
  const seen = new Set<string>();
  items.forEach((item, i) => {
    const key = item.name.trim().toLowerCase();
    const rate = parseNumberInput(item.rate);
    if (!key) errors.set(i, "Name missing");
    else if (seen.has(key)) errors.set(i, "Duplicate");
    else if (rate == null || rate < 0) errors.set(i, "Rate missing");
    seen.add(key);
  });
  return errors;
}

export function toExtraKpis(items: readonly ExtraKpiText[]) {
  return items.map((i) => ({ name: i.name.trim(), rate: parseNumberInput(i.rate) ?? 0 }));
}

/** Small list editor for additional KPIs: name + % of the stage volume. */
export function ExtraKpiEditor({
  idPrefix,
  items,
  onChange,
  base,
  disabled,
}: {
  idPrefix: string;
  items: ExtraKpiText[];
  onChange: (items: ExtraKpiText[]) => void;
  /** Volume the rate refers to, e.g. "impressions". */
  base: string;
  disabled?: boolean;
}) {
  const errors = extraKpiErrors(items);
  const set = (index: number, patch: Partial<ExtraKpiText>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="space-y-1.5">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <label htmlFor={`${idPrefix}-name-${index}`} className="sr-only">
            KPI name
          </label>
          <Input
            id={`${idPrefix}-name-${index}`}
            list="kpi-options"
            className="h-8 min-w-0 flex-1"
            placeholder="KPI, e.g. Clicks"
            value={item.name}
            disabled={disabled}
            aria-invalid={errors.get(index) === "Name missing" || errors.get(index) === "Duplicate"}
            onChange={(e) => set(index, { name: e.target.value })}
          />
          <label htmlFor={`${idPrefix}-rate-${index}`} className="sr-only">
            Rate in % of {base}
          </label>
          <div className="relative w-24 shrink-0">
            <Input
              id={`${idPrefix}-rate-${index}`}
              inputMode="decimal"
              className="h-8 pr-6 text-right"
              placeholder="0"
              value={item.rate}
              disabled={disabled}
              aria-invalid={errors.get(index) === "Rate missing"}
              onChange={(e) => set(index, { rate: e.target.value })}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              %
            </span>
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${item.name || "KPI"}`}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              <X />
            </Button>
          )}
        </div>
      ))}
      {!disabled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-muted-foreground"
          onClick={() => onChange([...items, { name: "", rate: "" }])}
        >
          <Plus /> KPI (% of {base})
        </Button>
      )}
      {disabled && items.length === 0 && <p className="text-xs text-muted-foreground">–</p>}
    </div>
  );
}
