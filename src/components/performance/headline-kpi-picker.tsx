"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { saveHeadlineKpis } from "@/app/campaigns/kpi-actions";

/** Lets editors pick the three key KPIs; "Automatic" uses the lead KPI of each funnel stage. */
export function HeadlineKpiPicker({
  campaignId,
  options,
  selected,
  custom,
}: {
  campaignId: string;
  options: string[];
  selected: string[];
  custom: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<string[]>(() => [0, 1, 2].map((i) => selected[i] ?? ""));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const save = (names: string[]) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveHeadlineKpis(campaignId, names);
        if (result.ok) {
          setOpen(false);
          router.refresh();
        } else setError(result.error);
      } catch {
        setError("Saving failed. Please try again.");
      }
    });
  };

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} disabled={options.length === 0}>
        <Settings2 /> Choose key KPIs
      </Button>
    );
  }

  return (
    <form
      className="flex w-full flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(values.filter(Boolean));
      }}
    >
      {values.map((value, i) => (
        <div key={i} className="flex min-w-44 flex-1 flex-col gap-1.5">
          <Label htmlFor={`headline-${i}`}>KPI {i + 1}</Label>
          <Select
            id={`headline-${i}`}
            value={value}
            onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
          >
            <option value="">– none –</option>
            {options.map((o) => (
              <option key={o} value={o} disabled={values.includes(o) && o !== value}>
                {o}
              </option>
            ))}
          </Select>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save
        </Button>
        {custom && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => save([])}>
            Automatic
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error && (
        <p className="w-full text-sm font-medium text-status-red" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
