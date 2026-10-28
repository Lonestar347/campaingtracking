"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, MonitorPlay, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { LINK_TYPES } from "@/lib/domain/enums";
import {
  LINK_TYPE_LABELS,
  detectLinkType,
  emptyLinkForm,
  linkFormFromRecord,
  shortUrl,
  validateLinkForm,
  type LinkFormValues,
} from "@/lib/links";
import type { FieldErrors } from "@/lib/validation/fields";
import { createLink, deleteLink, updateLink, type LinkTarget } from "@/app/kampagnen/link-actions";
import { LinkIcon } from "@/components/links/link-icon";

export interface LinkRecord {
  id: string;
  type: string;
  url: string;
  label: string | null;
  thumbnailUrl: string | null;
  embed: boolean;
}

function Thumbnail({ src, type }: { src: string | null; type: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <LinkIcon type={type} />
      </span>
    );
  }
  return (
    // Arbitrary external preview URLs, so next/image (which needs configured hosts) is not used.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="size-10 shrink-0 rounded-md border object-cover"
    />
  );
}

export function LinkManager({
  links,
  target,
  canEdit,
  title = "Links",
}: {
  links: LinkRecord[];
  target: LinkTarget;
  canEdit: boolean;
  title?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | "new" | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (!canEdit && links.length === 0) return null;

  const remove = (link: LinkRecord) => {
    if (!window.confirm(`Link „${link.label ?? shortUrl(link.url)}“ entfernen?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteLink(link.id);
      if (result.ok) router.refresh();
      else setError(result.formError ?? "Entfernen fehlgeschlagen.");
    });
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {title} {links.length > 0 && <span className="font-normal text-muted-foreground">({links.length})</span>}
        </h3>
        {canEdit && editing !== "new" && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus /> Link
          </Button>
        )}
      </div>

      {links.length === 0 && editing !== "new" && (
        <p className="text-sm text-muted-foreground">Noch keine Links, z. B. Frontify-Ordner, SharePoint oder Looker Studio.</p>
      )}

      <ul className={cn("space-y-1", pending && "opacity-60")}>
        {links.map((link) =>
          editing === link.id ? (
            <li key={link.id} className="rounded-lg border p-3">
              <LinkForm
                initial={linkFormFromRecord(link)}
                submit={(values) => updateLink(link.id, values)}
                onDone={() => setEditing(null)}
                submitLabel="Speichern"
              />
            </li>
          ) : (
            <li key={link.id} className="group flex items-center gap-2.5 rounded-md p-1.5 hover:bg-muted">
              <Thumbnail src={link.thumbnailUrl} type={link.type} />
              <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{link.label ?? shortUrl(link.url)}</span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <LinkIcon type={link.type} className="size-3.5" />
                  {LINK_TYPE_LABELS[link.type as keyof typeof LINK_TYPE_LABELS] ?? link.type}
                  {link.embed && (
                    <span className="inline-flex items-center gap-0.5" title="Im Performance-Tab eingebettet">
                      · <MonitorPlay className="size-3" /> eingebettet
                    </span>
                  )}
                  <span className="truncate">· {shortUrl(link.url)}</span>
                </span>
              </a>
              {canEdit && (
                <span className="flex shrink-0 gap-0.5 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                  <Button size="icon-sm" variant="ghost" aria-label="Link bearbeiten" onClick={() => setEditing(link.id)}>
                    <Pencil />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Link entfernen" onClick={() => remove(link)}>
                    <Trash2 />
                  </Button>
                </span>
              )}
            </li>
          ),
        )}
      </ul>

      {editing === "new" && (
        <div className="mt-2 rounded-lg border p-3">
          <LinkForm
            initial={emptyLinkForm()}
            submit={(values) => createLink(target, values)}
            onDone={() => setEditing(null)}
            submitLabel="Link hinzufügen"
          />
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm font-medium text-status-red" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

let formCounter = 0;

function LinkForm({
  initial,
  submit,
  onDone,
  submitLabel,
}: {
  initial: LinkFormValues;
  submit: (values: LinkFormValues) => Promise<{ ok: boolean; fieldErrors?: FieldErrors; formError?: string }>;
  onDone: () => void;
  submitLabel: string;
}) {
  const router = useRouter();
  const [prefix] = React.useState(() => `lf${++formCounter}`);
  const [values, setValues] = React.useState(initial);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const detected = detectLinkType(values.url);
  const effectiveType = values.type || detected;
  const set = <K extends keyof LinkFormValues>(key: K, value: LinkFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateLinkForm(values);
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    startTransition(async () => {
      try {
        const response = await submit(values);
        if (response.ok) {
          router.refresh();
          onDone();
        } else {
          setErrors(response.fieldErrors ?? {});
          setFormError(response.formError ?? null);
        }
      } catch {
        setFormError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <Field label="URL" htmlFor={`${prefix}-url`} required error={errors.url}>
        <Input
          id={`${prefix}-url`}
          type="url"
          value={values.url}
          placeholder="https://…"
          onChange={(e) => set("url", e.target.value)}
          aria-invalid={!!errors.url}
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Typ"
          htmlFor={`${prefix}-type`}
          error={errors.type}
          hint={!values.type && values.url ? `Erkannt: ${LINK_TYPE_LABELS[detected]}` : undefined}
        >
          <Select id={`${prefix}-type`} value={values.type} onChange={(e) => set("type", e.target.value)}>
            <option value="">Automatisch</option>
            {LINK_TYPES.map((t) => (
              <option key={t} value={t}>
                {LINK_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Bezeichnung" htmlFor={`${prefix}-label`} error={errors.label}>
          <Input
            id={`${prefix}-label`}
            value={values.label}
            placeholder="z. B. Key Visuals"
            onChange={(e) => set("label", e.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Vorschaubild (optional)"
        htmlFor={`${prefix}-thumb`}
        error={errors.thumbnailUrl}
        hint="Bild-URL, z. B. aus Frontify „Link kopieren“"
      >
        <Input
          id={`${prefix}-thumb`}
          type="url"
          value={values.thumbnailUrl}
          placeholder="https://…"
          onChange={(e) => set("thumbnailUrl", e.target.value)}
          aria-invalid={!!errors.thumbnailUrl}
        />
      </Field>
      {effectiveType === "looker_studio" && (
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-foreground"
              checked={values.embed}
              onChange={(e) => set("embed", e.target.checked)}
            />
            Im Performance-Tab einbetten
          </label>
          {errors.embed && <p className="mt-1 text-xs font-medium text-status-red">{errors.embed}</p>}
        </div>
      )}
      {formError && (
        <p className="text-sm font-medium text-status-red" role="alert">
          {formError}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          {submitLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
