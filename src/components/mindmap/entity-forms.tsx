"use client";

import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import {
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
} from "@/lib/domain/enums";
import {
  assetEditSchema,
  channelEditSchema,
  validate,
  type AssetEditValues,
  type ChannelEditValues,
} from "@/lib/entities/forms";
import type { FieldErrors } from "@/lib/validation/fields";
import type { EntityActionResult } from "@/app/kampagnen/entity-actions";
import type { CharterFormOptions } from "@/lib/queries";
import { newClientId } from "@/components/charter/form-context";

type Options = CharterFormOptions;

/** Form state, client validation, server submit and error display for one entity form. */
function useEntityForm<V extends object>(
  initial: V,
  schema: typeof channelEditSchema | typeof assetEditSchema,
  submit: (values: V) => Promise<EntityActionResult>,
  onSaved: (id: string) => void,
) {
  const [values, setValues] = React.useState(initial);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const set = <K extends keyof V>(key: K, value: V[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validate(schema, values);
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
        } else {
          setErrors(response.fieldErrors ?? {});
          setFormError(response.formError ?? null);
        }
      } catch {
        setFormError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  };

  return { values, setValues, set, errors, formError, pending, onSubmit };
}

function FormFooter({
  pending,
  submitLabel,
  formError,
  onCancel,
  onDelete,
  deleteLabel,
}: {
  pending: boolean;
  submitLabel: string;
  formError: string | null;
  onCancel?: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  return (
    <div className="space-y-3 border-t pt-4">
      {formError && (
        <p className="text-sm font-medium text-status-red" role="alert">
          {formError}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Abbrechen
          </Button>
        )}
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-status-red hover:text-status-red"
            onClick={onDelete}
            disabled={pending}
          >
            <Trash2 /> {deleteLabel ?? "Löschen"}
          </Button>
        )}
      </div>
    </div>
  );
}

function UserSelect({
  id,
  value,
  onChange,
  options,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: Options;
  invalid?: boolean;
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={invalid}>
      <option value="">Offen</option>
      {options.users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.team ? `${u.name} (${u.team})` : u.name}
        </option>
      ))}
    </Select>
  );
}

// ---------------------------------------------------------------------------

export function ChannelForm({
  mode,
  initial,
  options,
  submit,
  onSaved,
  onCancel,
  onDelete,
}: {
  mode: "create" | "edit";
  initial: ChannelEditValues;
  options: Options;
  submit: (values: ChannelEditValues) => Promise<EntityActionResult>;
  onSaved: (id: string) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const { values, set, setValues, errors, formError, pending, onSubmit } = useEntityForm(
    initial,
    channelEditSchema,
    submit,
    onSaved,
  );

  const selectType = (typeId: string) => {
    const type = options.channelTypes.find((t) => t.id === typeId);
    setValues((v) => ({
      ...v,
      channelTypeId: typeId,
      // Pre-fill name with the type name unless the user typed their own.
      name: !v.name || options.channelTypes.some((t) => t.name === v.name) ? (type?.name ?? "") : v.name,
    }));
  };

  const setKpi = (index: number, key: "name" | "target", value: string) =>
    set(
      "kpis",
      values.kpis.map((k, i) => (i === index ? { ...k, [key]: value } : k)),
    );

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mode === "create" && (
        <Field label="Kanaltyp" htmlFor="ch-type" required error={errors.channelTypeId}>
          <Select
            id="ch-type"
            value={values.channelTypeId}
            onChange={(e) => selectType(e.target.value)}
            aria-invalid={!!errors.channelTypeId}
          >
            <option value="">Bitte wählen</option>
            {FUNNEL_STAGES.map((stage) => (
              <optgroup key={stage} label={FUNNEL_STAGE_LABELS[stage]}>
                {options.channelTypes
                  .filter((t) => t.defaultFunnelStage === stage)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Name" htmlFor="ch-name" required error={errors.name}>
        <Input id="ch-name" value={values.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Funnel-Stufe" htmlFor="ch-stage" required error={errors.funnelStage}>
          <Select
            id="ch-stage"
            value={values.funnelStage}
            onChange={(e) => set("funnelStage", e.target.value)}
            aria-invalid={!!errors.funnelStage}
          >
            <option value="">Bitte wählen</option>
            {FUNNEL_STAGES.map((s) => (
              <option key={s} value={s}>
                {FUNNEL_STAGE_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner" htmlFor="ch-owner" error={errors.ownerId}>
          <UserSelect id="ch-owner" value={values.ownerId} onChange={(v) => set("ownerId", v)} options={options} />
        </Field>
        <Field label="Start" htmlFor="ch-start" error={errors.startDate}>
          <Input id="ch-start" type="date" value={values.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="Ende" htmlFor="ch-end" error={errors.endDate}>
          <Input
            id="ch-end"
            type="date"
            value={values.endDate}
            onChange={(e) => set("endDate", e.target.value)}
            aria-invalid={!!errors.endDate}
          />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">KPI-Ziele</p>
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
              <Field label={<span className="sr-only">Zielwert</span>} error={errors[`kpis.${index}.target`]}>
                <Input
                  inputMode="decimal"
                  placeholder="Ziel"
                  value={kpi.target}
                  onChange={(e) => setKpi(index, "target", e.target.value)}
                  aria-invalid={!!errors[`kpis.${index}.target`]}
                />
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="KPI entfernen"
                onClick={() => set("kpis", values.kpis.filter((_, i) => i !== index))}
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
            <Plus /> KPI-Ziel
          </Button>
        </div>
      </div>

      <Field label="Notizen" htmlFor="ch-notes">
        <Textarea id="ch-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
      </Field>

      <FormFooter
        pending={pending}
        formError={formError}
        submitLabel={mode === "create" ? "Kanal anlegen" : "Speichern"}
        onCancel={onCancel}
        onDelete={onDelete}
        deleteLabel="Kanal löschen"
      />
    </form>
  );
}

// ---------------------------------------------------------------------------

export function AssetForm({
  mode,
  initial,
  options,
  submit,
  onSaved,
  onCancel,
  onDelete,
}: {
  mode: "create" | "edit";
  initial: AssetEditValues;
  options: Options;
  submit: (values: AssetEditValues) => Promise<EntityActionResult>;
  onSaved: (id: string) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const { values, set, errors, formError, pending, onSubmit } = useEntityForm(initial, assetEditSchema, submit, onSaved);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Field label="Titel" htmlFor="as-title" required error={errors.title}>
        <Input
          id="as-title"
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          aria-invalid={!!errors.title}
          autoFocus={mode === "create"}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Typ" htmlFor="as-type" required error={errors.assetType}>
          <Select
            id="as-type"
            value={values.assetType}
            onChange={(e) => set("assetType", e.target.value)}
            aria-invalid={!!errors.assetType}
          >
            <option value="">Bitte wählen</option>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="as-status" required error={errors.status}>
          <Select id="as-status" value={values.status} onChange={(e) => set("status", e.target.value)}>
            {ASSET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ASSET_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Format / Specs" htmlFor="as-format" className="col-span-2">
          <Input
            id="as-format"
            value={values.format}
            placeholder="z. B. 9:16, 15s"
            onChange={(e) => set("format", e.target.value)}
          />
        </Field>
        <Field label="Fällig am" htmlFor="as-due" error={errors.dueDate}>
          <Input id="as-due" type="date" value={values.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </Field>
        <Field label="Owner" htmlFor="as-owner" error={errors.ownerId}>
          <UserSelect id="as-owner" value={values.ownerId} onChange={(v) => set("ownerId", v)} options={options} />
        </Field>
        <Field label="Freigabe durch" htmlFor="as-approver" error={errors.approverId} className="col-span-2">
          <UserSelect id="as-approver" value={values.approverId} onChange={(v) => set("approverId", v)} options={options} />
        </Field>
      </div>
      <Field label="Notizen" htmlFor="as-notes">
        <Textarea id="as-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
      </Field>

      <FormFooter
        pending={pending}
        formError={formError}
        submitLabel={mode === "create" ? "Asset anlegen" : "Speichern"}
        onCancel={onCancel}
        onDelete={onDelete}
        deleteLabel="Asset löschen"
      />
    </form>
  );
}
