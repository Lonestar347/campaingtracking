"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CAMPAIGN_PHASES,
  CAMPAIGN_PHASE_LABELS,
  EXECUTION_TYPES,
  EXECUTION_TYPE_LABELS,
  MARKETS,
  TRAFFIC_LIGHTS,
  type ExecutionType,
} from "@/lib/domain/enums";
import { parseDateInput, toDateInput } from "@/lib/format";
import {
  countActiveFilters,
  filtersToSearchParams,
  type DashboardFilters,
  type DashboardSort,
} from "@/lib/dashboard";

/** Filters arrive serialised from the server; dates come back as ISO strings. */
interface Props {
  filters: DashboardFilters;
  sort: DashboardSort;
  options: { brands: string[]; productLines: string[]; owners: { id: string; name: string }[] };
}

const LIGHT_LABELS = { RED: "Critical", YELLOW: "At risk", GREEN: "On track" } as const;
const LIGHT_DOT = { RED: "bg-status-red", YELLOW: "bg-status-yellow", GREEN: "bg-status-green" } as const;
const SORT_LABELS: Record<DashboardSort, string> = {
  start: "Start date",
  end: "End date",
  urgency: "Urgency",
  name: "Name",
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
        active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function FilterBar({ filters, sort, options }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();
  const [query, setQuery] = React.useState(filters.q ?? "");

  const apply = React.useCallback(
    (next: Partial<DashboardFilters>, nextSort: DashboardSort = sort) => {
      const params = filtersToSearchParams({ ...filters, ...next }, nextSort).toString();
      startTransition(() => router.replace(params ? `${pathname}?${params}` : pathname, { scroll: false }));
    },
    [filters, sort, pathname, router],
  );

  // Debounced free-text search.
  React.useEffect(() => {
    if ((filters.q ?? "") === query.trim()) return;
    const timer = window.setTimeout(() => apply({ q: query.trim() || undefined }), 300);
    return () => window.clearTimeout(timer);
  }, [query, filters.q, apply]);

  const active = countActiveFilters(filters);
  const dateValue = (d?: Date | string) => (d ? toDateInput(new Date(d)) : "");

  return (
    <section aria-label="Filter" className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaign, brand or product line"
            aria-label="Search"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="sort" className="text-muted-foreground">
            Sort by
          </Label>
          <Select
            id="sort"
            value={sort}
            onChange={(e) => apply({}, e.target.value as DashboardSort)}
            className="w-40"
          >
            {(Object.keys(SORT_LABELS) as DashboardSort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
        {active > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              startTransition(() =>
                router.replace(sort === "start" ? pathname : `${pathname}?sort=${sort}`, { scroll: false }),
              );
            }}
          >
            <X /> Reset filters ({active})
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <ChipGroup label="Market">
          {MARKETS.map((m) => (
            <Chip key={m} active={filters.markets.includes(m)} onClick={() => apply({ markets: toggle(filters.markets, m) })}>
              {m}
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup label="Phase">
          {CAMPAIGN_PHASES.map((p) => (
            <Chip key={p} active={filters.phases.includes(p)} onClick={() => apply({ phases: toggle(filters.phases, p) })}>
              {CAMPAIGN_PHASE_LABELS[p]}
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup label="Status">
          {TRAFFIC_LIGHTS.map((l) => (
            <Chip key={l} active={filters.lights.includes(l)} onClick={() => apply({ lights: toggle(filters.lights, l) })}>
              <span className={cn("size-2 rounded-full", LIGHT_DOT[l])} aria-hidden />
              {LIGHT_LABELS[l]}
            </Chip>
          ))}
        </ChipGroup>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <FilterSelect
          id="f-brand"
          label="Brand"
          value={filters.brand ?? ""}
          onChange={(v) => apply({ brand: v || undefined })}
          options={options.brands.map((b) => ({ value: b, label: b }))}
        />
        <FilterSelect
          id="f-product"
          label="Product line"
          value={filters.productLine ?? ""}
          onChange={(v) => apply({ productLine: v || undefined })}
          options={options.productLines.map((p) => ({ value: p, label: p }))}
        />
        <FilterSelect
          id="f-owner"
          label="Owner"
          value={filters.ownerId ?? ""}
          onChange={(v) => apply({ ownerId: v || undefined })}
          options={options.owners.map((o) => ({ value: o.id, label: o.name }))}
        />
        <FilterSelect
          id="f-exec"
          label="Execution"
          value={filters.executionTypes[0] ?? ""}
          onChange={(v) => apply({ executionTypes: v ? [v as ExecutionType] : [] })}
          options={EXECUTION_TYPES.map((t) => ({ value: t, label: EXECUTION_TYPE_LABELS[t] }))}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-from">Period from</Label>
          <Input
            id="f-from"
            type="date"
            value={dateValue(filters.from)}
            onChange={(e) => apply({ from: parseDateInput(e.target.value) ?? undefined })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-to">to</Label>
          <Input
            id="f-to"
            type="date"
            value={dateValue(filters.to)}
            onChange={(e) => apply({ to: parseDateInput(e.target.value) ?? undefined })}
          />
        </div>
      </div>
    </section>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
