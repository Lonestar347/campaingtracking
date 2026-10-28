"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, ImagePlus, Loader2, Plus, Star, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import {
  ACCEPTED_IMAGE_TYPES,
  creativeFormFromRecord,
  creativeFormSchema,
  creativeKpiOptions,
  emptyCreativeForm,
  rankCreatives,
  type CreativeFormValues,
  type CreativeKpi,
} from "@/lib/creatives";
import { lowerIsBetter } from "@/lib/kpi-import/actuals";
import { validate } from "@/lib/entities/forms";
import type { FieldErrors } from "@/lib/validation/fields";
import {
  createCreative,
  deleteCreative,
  removeCreativeImage,
  setCoverCreative,
  updateCreative,
  uploadCreativeImage,
} from "@/app/campaigns/creative-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { KpiDatalist } from "@/components/kpi-datalist";
import { newClientId } from "@/components/charter/form-context";

export interface CreativeView {
  id: string;
  title: string;
  channelId: string | null;
  channelName: string | null;
  format: string | null;
  notes: string | null;
  kpiValues: unknown;
  kpis: CreativeKpi[];
  imageUrl: string | null;
  /** Shown as the campaign image on the dashboard. */
  isCover: boolean;
}

interface Props {
  campaignId: string;
  creatives: CreativeView[];
  channels: { id: string; name: string }[];
  canEdit: boolean;
  initialSelectedId: string | null;
  initialKpi: string | null;
}

type Selection = { kind: "creative"; id: string } | { kind: "new" } | null;

const MANUAL_ORDER = "";

function replaceQuery(updates: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", url);
}

export function CreativesBoard({ campaignId, creatives, channels, canEdit, initialSelectedId, initialKpi }: Props) {
  const kpiOptions = React.useMemo(() => creativeKpiOptions(creatives), [creatives]);
  const [kpi, setKpi] = React.useState<string>(() =>
    initialKpi ? (kpiOptions.find((k) => k.toLowerCase() === initialKpi.toLowerCase()) ?? MANUAL_ORDER) : MANUAL_ORDER,
  );
  const [selection, setSelection] = React.useState<Selection>(() =>
    initialSelectedId && creatives.some((c) => c.id === initialSelectedId)
      ? { kind: "creative", id: initialSelectedId }
      : null,
  );

  const select = (next: Selection) => {
    setSelection(next);
    replaceQuery({ creative: next?.kind === "creative" ? next.id : null });
  };
  const changeKpi = (value: string) => {
    setKpi(value);
    replaceQuery({ kpi: value || null });
  };

  // Sorted by the chosen KPI (best first); creatives without that KPI follow in manual order.
  const ordered = React.useMemo(() => {
    if (!kpi) return creatives.map((creative) => ({ creative, rank: null as number | null }));
    const ranked = rankCreatives(creatives, kpi, creatives.length);
    const rankedIds = new Set(ranked.map((r) => r.creative.id));
    return [
      ...ranked.map((r) => ({ creative: r.creative, rank: r.rank as number | null })),
      ...creatives.filter((c) => !rankedIds.has(c.id)).map((creative) => ({ creative, rank: null })),
    ];
  }, [creatives, kpi]);

  const selected = selection?.kind === "creative" ? creatives.find((c) => c.id === selection.id) : undefined;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-5">
      <KpiDatalist />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Creatives</h2>
          <p className="text-sm text-muted-foreground">
            Finished ads and visuals with their performance. The campaign image on the dashboard is marked with a star.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {kpiOptions.length > 0 && (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Sort by
              <Select
                value={kpi}
                onChange={(e) => changeKpi(e.target.value)}
                className="h-9 w-48 text-sm text-foreground"
              >
                <option value={MANUAL_ORDER}>Manual order</option>
                {kpiOptions.map((k) => (
                  <option key={k} value={k}>
                    Best {k}
                    {lowerIsBetter(k) ? " (lowest)" : ""}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {canEdit && (
            <Button variant="accent" onClick={() => select({ kind: "new" })}>
              <Plus /> New creative
            </Button>
          )}
        </div>
      </div>

      <div className={cn("grid items-start gap-6", selection && "lg:grid-cols-[1fr_24rem]")}>
        {creatives.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-10 text-center">
            <ImageIcon className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No creatives yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add the campaign&apos;s ads and visuals with an image and KPI values to compare their performance.
            </p>
          </div>
        ) : (
          <ul className={cn("grid gap-4 sm:grid-cols-2", selection ? "xl:grid-cols-2" : "lg:grid-cols-3")}>
            {ordered.map(({ creative, rank }) => (
              <CreativeCard
                key={creative.id}
                creative={creative}
                rank={rank}
                highlightKpi={kpi || null}
                selected={selection?.kind === "creative" && selection.id === creative.id}
                onSelect={() => select({ kind: "creative", id: creative.id })}
              />
            ))}
          </ul>
        )}

        {selection && (
          <aside
            className="rounded-xl border bg-card p-5 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
            aria-label={selection.kind === "new" ? "New creative" : "Creative details"}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold">
                {selection.kind === "new" ? "New creative" : (selected?.title ?? "Creative")}
              </h3>
              <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={() => select(null)}>
                <X />
              </Button>
            </div>
            {selection.kind === "new" ? (
              <CreativeForm
                key="new"
                mode="create"
                initial={emptyCreativeForm()}
                channels={channels}
                submit={(values) => createCreative(campaignId, values)}
                onSaved={(id) => select({ kind: "creative", id })}
                onCancel={() => select(null)}
              />
            ) : selected ? (
              <CreativeDetail
                key={selected.id}
                creative={selected}
                channels={channels}
                canEdit={canEdit}
                onDeleted={() => select(null)}
              />
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function CreativeImage({ creative, className }: { creative: CreativeView; className?: string }) {
  return (
    <div className={cn("relative aspect-[4/3] overflow-hidden bg-muted", className)}>
      {creative.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by our own API route
        <img src={creative.imageUrl} alt={creative.title} className="absolute inset-0 size-full object-cover" loading="lazy" />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
          <ImageIcon className="size-7" />
          <span className="text-xs">No image</span>
        </div>
      )}
    </div>
  );
}

function KpiValue({ kpi }: { kpi: CreativeKpi }) {
  return <span className="tabular-nums">{formatNumber(kpi.value)}</span>;
}

function CreativeCard({
  creative,
  rank,
  highlightKpi,
  selected,
  onSelect,
}: {
  creative: CreativeView;
  rank: number | null;
  highlightKpi: string | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const highlighted = highlightKpi
    ? creative.kpis.find((k) => k.kpiName.toLowerCase() === highlightKpi.toLowerCase())
    : undefined;
  const others = creative.kpis.filter((k) => k !== highlighted).slice(0, highlighted ? 2 : 3);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "group w-full overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          selected && "ring-2 ring-ring",
        )}
      >
        <div className="relative">
          <CreativeImage creative={creative} />
          {creative.isCover && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-josera-gold px-2 py-0.5 text-xs font-semibold text-black">
              <Star className="size-3 fill-current" /> Campaign image
            </span>
          )}
          {rank != null && (
            <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-semibold tabular-nums shadow-sm">
              #{rank}
            </span>
          )}
        </div>
        <div className="space-y-2 p-4">
          <div>
            <p className="font-semibold leading-snug">{creative.title}</p>
            <p className="text-sm text-muted-foreground">
              {[creative.channelName, creative.format].filter(Boolean).join(" · ") || "No channel"}
            </p>
          </div>
          {highlighted && (
            <p className="flex items-baseline justify-between gap-2 rounded-md bg-muted px-2.5 py-1.5">
              <span className="text-sm text-muted-foreground">{highlighted.kpiName}</span>
              <span className="text-lg font-semibold">
                <KpiValue kpi={highlighted} />
              </span>
            </p>
          )}
          {others.length > 0 ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
              {others.map((k) => (
                <React.Fragment key={k.kpiName}>
                  <dt className="truncate text-muted-foreground">{k.kpiName}</dt>
                  <dd className="text-right">
                    <KpiValue kpi={k} />
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          ) : (
            !highlighted && <p className="text-sm text-muted-foreground">No KPI values yet</p>
          )}
        </div>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------

function CreativeDetail({
  creative,
  channels,
  canEdit,
  onDeleted,
}: {
  creative: CreativeView;
  channels: { id: string; name: string }[];
  canEdit: boolean;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          after?.();
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("That did not work. Please try again.");
      }
    });
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const data = new FormData();
    data.set("image", file);
    run(() => uploadCreativeImage(creative.id, data));
  };

  const onDelete = () => {
    if (!window.confirm(`Delete creative “${creative.title}”? Imported KPI values stay in their report.`)) return;
    run(() => deleteCreative(creative.id), onDeleted);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <CreativeImage creative={creative} className="rounded-lg border" />
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              className="sr-only"
              onChange={onFile}
              aria-label="Image file"
            />
            <Button size="sm" variant="outline" disabled={pending} onClick={() => fileInput.current?.click()}>
              {pending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
              {creative.imageUrl ? "Replace image" : "Upload image"}
            </Button>
            {creative.imageUrl && !creative.isCover && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => setCoverCreative(creative.id))}
              >
                <Star /> Use as campaign image
              </Button>
            )}
            {creative.imageUrl && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => removeCreativeImage(creative.id))}
              >
                Remove image
              </Button>
            )}
          </div>
        )}
        {creative.isCover && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Star className="size-3 fill-josera-gold text-josera-gold" /> Shown as the campaign image on the dashboard
          </p>
        )}
        {canEdit && <p className="text-xs text-muted-foreground">PNG, JPG, WebP or GIF, up to 5 MB.</p>}
        {error && (
          <p className="text-sm font-medium text-status-red" role="alert">
            {error}
          </p>
        )}
      </div>

      {editing ? (
        <CreativeForm
          mode="edit"
          initial={creativeFormFromRecord(creative)}
          channels={channels}
          submit={(values) => updateCreative(creative.id, values)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Channel</dt>
            <dd>{creative.channelName ?? "–"}</dd>
            <dt className="text-muted-foreground">Format</dt>
            <dd>{creative.format ?? "–"}</dd>
            {creative.notes && (
              <>
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="whitespace-pre-line">{creative.notes}</dd>
              </>
            )}
          </dl>

          <section>
            <h4 className="mb-2 text-sm font-semibold">KPIs</h4>
            {creative.kpis.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No values yet. Enter them here or import a report with a creative column.
              </p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {creative.kpis.map((k) => (
                    <tr key={k.kpiName} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">{k.kpiName}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums">{formatNumber(k.value)}</td>
                      <td className="py-1.5 pl-3 text-right text-xs text-muted-foreground">
                        {k.source === "manual" ? "manual" : `import (${k.valueCount})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {canEdit && (
            <div className="flex items-center gap-2 border-t pt-4">
              <Button onClick={() => setEditing(true)} disabled={pending}>
                Edit
              </Button>
              <Button
                variant="ghost"
                className="ml-auto text-status-red hover:text-status-red"
                onClick={onDelete}
                disabled={pending}
              >
                <Trash2 /> Delete
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type SaveResult = { ok: true; id: string } | { ok: false; fieldErrors?: FieldErrors; formError?: string };

function CreativeForm({
  mode,
  initial,
  channels,
  submit,
  onSaved,
  onCancel,
}: {
  mode: "create" | "edit";
  initial: CreativeFormValues;
  channels: { id: string; name: string }[];
  submit: (values: CreativeFormValues) => Promise<SaveResult>;
  onSaved: (id: string) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = React.useState(initial);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const router = useRouter();

  const set = <K extends keyof CreativeFormValues>(key: K, value: CreativeFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  };
  const setKpi = (index: number, key: "name" | "target", value: string) =>
    set(
      "kpis",
      values.kpis.map((k, i) => (i === index ? { ...k, [key]: value } : k)),
    );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate(creativeFormSchema, values);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setFormError(null);
    startTransition(async () => {
      try {
        const response = await submit(values);
        if (response.ok) {
          onSaved(response.id);
          router.refresh();
        } else {
          setErrors(response.fieldErrors ?? {});
          setFormError(response.formError ?? null);
        }
      } catch {
        setFormError("Saving failed. Please try again.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor="cr-title" required error={errors.title}>
        <Input
          id="cr-title"
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          aria-invalid={!!errors.title}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Channel" htmlFor="cr-channel" error={errors.channelId}>
          <Select id="cr-channel" value={values.channelId} onChange={(e) => set("channelId", e.target.value)}>
            <option value="">None</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Format" htmlFor="cr-format" error={errors.format}>
          <Input
            id="cr-format"
            placeholder="e.g. 1080×1080"
            value={values.format}
            onChange={(e) => set("format", e.target.value)}
          />
        </Field>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">KPI values</p>
        <p className="mb-2 text-xs text-muted-foreground">Manual values replace imported values of the same KPI.</p>
        <div className="space-y-2">
          {values.kpis.map((kpi, index) => (
            <div key={kpi.clientId} className="grid grid-cols-[1.4fr_1fr_auto] items-start gap-2">
              <Field label={<span className="sr-only">KPI</span>} error={errors[`kpis.${index}.name`]}>
                <Input
                  list="kpi-options"
                  placeholder="KPI"
                  value={kpi.name}
                  onChange={(e) => setKpi(index, "name", e.target.value)}
                  aria-invalid={!!errors[`kpis.${index}.name`]}
                />
              </Field>
              <Field
                label={<span className="sr-only">Value</span>}
                error={errors[`kpis.${index}.target`]?.replace("target", "value")}
              >
                <Input
                  inputMode="decimal"
                  placeholder="Value"
                  value={kpi.target}
                  onChange={(e) => setKpi(index, "target", e.target.value)}
                  aria-invalid={!!errors[`kpis.${index}.target`]}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove KPI"
                onClick={() =>
                  set(
                    "kpis",
                    values.kpis.filter((_, i) => i !== index),
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => set("kpis", [...values.kpis, { clientId: newClientId(), name: "", target: "" }])}
          >
            <Plus /> KPI value
          </Button>
        </div>
      </div>

      <Field label="Notes" htmlFor="cr-notes">
        <Textarea id="cr-notes" rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>

      <div className="space-y-3 border-t pt-4">
        {formError && (
          <p className="text-sm font-medium text-status-red" role="alert">
            {formError}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {mode === "create" ? "Create creative" : "Save"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        </div>
        {mode === "create" && (
          <p className="text-xs text-muted-foreground">You can upload the image after creating the creative.</p>
        )}
      </div>
    </form>
  );
}
