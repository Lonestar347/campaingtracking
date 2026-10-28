"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileSpreadsheet, Info, Loader2, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatGermanNumber } from "@/lib/format";
import { aggregationFor } from "@/lib/kpi-import/actuals";
import { mappingColumns, type ImportIssue, type ImportMapping } from "@/lib/kpi-import";
import {
  analyzeUpload,
  runImport,
  type AnalyzeResult,
  type RunImportResult,
} from "@/app/kampagnen/import-actions";

type Analysis = Extract<AnalyzeResult, { ok: true }>;

interface Props {
  campaignId: string;
  slug: string;
  channels: { id: string; name: string }[];
  knownKpis: string[];
}

const NONE = "";

export function ImportWizard({ campaignId, slug, channels, knownKpis }: Props) {
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  return analysis ? (
    <MappingStep
      key={analysis.uploadKey}
      analysis={analysis}
      campaignId={campaignId}
      slug={slug}
      channels={channels}
      knownKpis={knownKpis}
      onRestart={() => setAnalysis(null)}
    />
  ) : (
    <UploadStep campaignId={campaignId} onAnalyzed={setAnalysis} />
  );
}

function UploadStep({ campaignId, onAnalyzed }: { campaignId: string; onAnalyzed: (a: Analysis) => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Bitte eine Datei auswählen.");
      return;
    }
    setError(null);
    const data = new FormData();
    data.set("file", file);
    startTransition(async () => {
      try {
        const result = await analyzeUpload(campaignId, data);
        if (result.ok) onAnalyzed(result);
        else setError(result.error);
      } catch {
        setError("Hochladen fehlgeschlagen. Ist die Datei größer als 10 MB?");
      }
    });
  };

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4 rounded-xl border bg-card p-6">
      <div>
        <h2 className="font-semibold">1. Datei hochladen</h2>
        <p className="text-sm text-muted-foreground">Excel (.xlsx) oder CSV, bis 10 MB. Die Originaldatei wird mit gespeichert.</p>
      </div>
      <label
        htmlFor="report-file"
        className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center hover:bg-muted"
      >
        <FileSpreadsheet className="size-8 text-muted-foreground" />
        <span className="text-sm font-medium">{file ? file.name : "Datei auswählen"}</span>
        {file && <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>}
        <input
          id="report-file"
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {error && (
        <p className="flex items-start gap-2 text-sm font-medium text-status-red" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Upload />} Hochladen &amp; analysieren
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function MappingStep({
  analysis,
  campaignId,
  slug,
  channels,
  knownKpis,
  onRestart,
}: Props & { analysis: Analysis; onRestart: () => void }) {
  const router = useRouter();
  const first = analysis.sheets[0];
  const [sheetName, setSheetName] = React.useState(first.name);
  const sheet = analysis.sheets.find((s) => s.name === sheetName) ?? first;
  const [mapping, setMapping] = React.useState<ImportMapping>(first.suggestion);
  const [source, setSource] = React.useState(first.recognizedSource ?? "");
  const [periodStart, setPeriodStart] = React.useState(first.dateRange?.from ?? "");
  const [periodEnd, setPeriodEnd] = React.useState(first.dateRange?.to ?? "");
  const [defaultChannelId, setDefaultChannelId] = React.useState(NONE);
  const [saveMapping, setSaveMapping] = React.useState(true);
  const [result, setResult] = React.useState<RunImportResult | null>(null);
  const [notice, setNotice] = React.useState<string | null>(
    first.recognizedSource ? `Format erkannt: gespeicherte Zuordnung von „${first.recognizedSource}“ übernommen.` : null,
  );
  const [pending, startTransition] = React.useTransition();

  /** Any change invalidates the last check. */
  const change = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setResult(null);
  };
  const updateMapping = (patch: Partial<ImportMapping>) => {
    setMapping((m) => ({ ...m, ...patch }));
    setResult(null);
  };

  const selectSheet = (name: string) => {
    const next = analysis.sheets.find((s) => s.name === name)!;
    setSheetName(name);
    setMapping(next.suggestion);
    if (next.dateRange) {
      setPeriodStart(next.dateRange.from);
      setPeriodEnd(next.dateRange.to);
    }
    setResult(null);
  };

  const chooseSource = (value: string) => {
    setSource(value);
    setResult(null);
    const saved = analysis.savedSources.find((s) => s.source === value);
    if (saved && mappingColumns(saved.mapping).every((c) => sheet.headers.includes(c))) {
      setMapping({ ...saved.mapping, sheetName });
      setNotice(`Gespeicherte Zuordnung von „${value}“ übernommen.`);
    }
  };

  const run = (dryRun: boolean) =>
    startTransition(async () => {
      try {
        const response = await runImport({
          campaignId,
          uploadKey: analysis.uploadKey,
          fileName: analysis.fileName,
          sheetName,
          source,
          periodStart,
          periodEnd,
          defaultChannelId,
          mapping,
          saveMapping,
          dryRun,
        });
        setResult(response);
        if (response.ok && !response.dryRun) {
          router.push(`/kampagnen/${slug}/performance?importiert=${response.valueCount}`);
          router.refresh();
        }
      } catch {
        setResult({ ok: false, errors: [{ message: "Verarbeitung fehlgeschlagen. Bitte erneut versuchen." }] });
      }
    });

  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const otherHeaders = sheet.headers.filter((h) => h !== mapping.dateColumn && h !== mapping.channelColumn);
  const roles = columnRoles(mapping);
  const canImport = result?.ok === true && result.dryRun;

  const columnSelect = (id: string, label: string, value: string | undefined, onChange: (v?: string) => void, optional = true) => (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value ?? NONE} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value={NONE}>{optional ? "– keine –" : "Bitte wählen"}</option>
        {sheet.headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
        <FileSpreadsheet className="size-5 text-muted-foreground" />
        <span className="font-medium">{analysis.fileName}</span>
        <span className="text-muted-foreground">
          {sheet.rowCount} Datenzeilen · {sheet.headers.length} Spalten
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onRestart}>
          Andere Datei
        </Button>
      </div>

      {notice && (
        <p className="flex items-center gap-2 rounded-lg border border-josera-gold bg-josera-gold/10 px-4 py-2.5 text-sm">
          <Info className="size-4 shrink-0" /> {notice}
        </p>
      )}

      <section className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-5 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">2. Angaben &amp; Zuordnung</h2>

          {analysis.sheets.length > 1 && (
            <Field label="Tabellenblatt" htmlFor="imp-sheet">
              <Select id="imp-sheet" value={sheetName} onChange={(e) => selectSheet(e.target.value)}>
                {analysis.sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.rowCount} Zeilen)
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Quelle (Agentur / Partner)" htmlFor="imp-source" required error={fieldErrors.source}>
            <Input
              id="imp-source"
              list="imp-sources"
              value={source}
              onChange={(e) => chooseSource(e.target.value)}
              aria-invalid={!!fieldErrors.source}
              placeholder="z. B. Beispiel-Agentur"
            />
            <datalist id="imp-sources">
              {analysis.savedSources.map((s) => (
                <option key={s.source} value={s.source} />
              ))}
            </datalist>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Zeitraum von" htmlFor="imp-from" required error={fieldErrors.periodStart}>
              <Input id="imp-from" type="date" value={periodStart} onChange={(e) => change(setPeriodStart)(e.target.value)} />
            </Field>
            <Field label="bis" htmlFor="imp-to" required error={fieldErrors.periodEnd}>
              <Input id="imp-to" type="date" value={periodEnd} onChange={(e) => change(setPeriodEnd)(e.target.value)} />
            </Field>
          </div>

          <div className="space-y-3 border-t pt-4">
            {columnSelect("imp-date", "Datum-Spalte", mapping.dateColumn, (v) => updateMapping({ dateColumn: v }))}
            {columnSelect("imp-channel", "Kanal-Spalte", mapping.channelColumn, (v) => updateMapping({ channelColumn: v }))}
            <Field
              label={mapping.channelColumn ? "Kanal für Zeilen ohne Kanal" : "Kanal für alle Werte"}
              htmlFor="imp-default-channel"
              error={fieldErrors.defaultChannelId}
            >
              <Select
                id="imp-default-channel"
                value={defaultChannelId}
                onChange={(e) => change(setDefaultChannelId)(e.target.value)}
              >
                <option value={NONE}>– Kampagne gesamt –</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset className="space-y-3 border-t pt-4">
            <legend className="mb-2 text-sm font-medium">Aufbau der Tabelle</legend>
            {(
              [
                ["wide", "Eine Spalte pro KPI"],
                ["long", "Eine Zeile pro KPI (Spalten KPI + Wert)"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="layout"
                  className="accent-foreground"
                  checked={mapping.layout === value}
                  onChange={() => updateMapping({ layout: value })}
                />
                {label}
              </label>
            ))}

            {mapping.layout === "long" ? (
              <div className="space-y-3">
                {columnSelect("imp-kpi", "KPI-Spalte", mapping.kpiColumn, (v) => updateMapping({ kpiColumn: v }), false)}
                {columnSelect("imp-value", "Wert-Spalte", mapping.valueColumn, (v) => updateMapping({ valueColumn: v }), false)}
                {columnSelect("imp-unit", "Einheit-Spalte", mapping.unitColumn, (v) => updateMapping({ unitColumn: v }))}
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Spalten mit Werten auswählen und den KPI-Namen festlegen:</p>
                <datalist id="imp-kpis">
                  {knownKpis.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
                {otherHeaders.map((header) => {
                  const entry = mapping.kpiColumns.find((k) => k.column === header);
                  return (
                    <div key={header} className="grid grid-cols-[auto_1fr] items-center gap-2">
                      <input
                        type="checkbox"
                        aria-label={`${header} importieren`}
                        className="size-4 accent-foreground"
                        checked={!!entry}
                        onChange={(e) =>
                          updateMapping({
                            kpiColumns: e.target.checked
                              ? [...mapping.kpiColumns, { column: header, kpiName: header }]
                              : mapping.kpiColumns.filter((k) => k.column !== header),
                          })
                        }
                      />
                      {entry ? (
                        <Input
                          list="imp-kpis"
                          aria-label={`KPI-Name für ${header}`}
                          value={entry.kpiName}
                          className="h-8"
                          onChange={(e) =>
                            updateMapping({
                              kpiColumns: mapping.kpiColumns.map((k) =>
                                k.column === header ? { ...k, kpiName: e.target.value } : k,
                              ),
                            })
                          }
                        />
                      ) : (
                        <span className="truncate text-sm text-muted-foreground">{header}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Field label="Zahlenformat" htmlFor="imp-format">
              <Select
                id="imp-format"
                value={mapping.numberFormat}
                onChange={(e) => updateMapping({ numberFormat: e.target.value as "de" | "en" })}
              >
                <option value="de">Deutsch (1.234,5)</option>
                <option value="en">Englisch (1,234.5)</option>
              </Select>
            </Field>
          </fieldset>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border bg-card">
            <h2 className="border-b px-4 py-3 font-semibold">Vorschau</h2>
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left">
                  <tr>
                    {sheet.headers.map((h) => (
                      <th key={h} className="whitespace-nowrap border-b px-3 py-2 font-medium">
                        <span className="block">{h}</span>
                        {roles[h] && (
                          <span className="mt-0.5 inline-block rounded bg-josera-gold/30 px-1.5 text-[11px] font-medium">
                            {roles[h]}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.preview.map((row, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      {row.map((cell, j) => (
                        <td
                          key={j}
                          className={cn(
                            "whitespace-nowrap px-3 py-1.5 tabular-nums",
                            !roles[sheet.headers[j]] && "text-muted-foreground",
                          )}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sheet.rowCount > sheet.preview.length && (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                Erste {sheet.preview.length} von {sheet.rowCount} Zeilen.
              </p>
            )}
          </div>

          <ResultPanel
            result={result}
            channels={channels}
            aliases={mapping.channelAliases}
            // Keep the error list visible while assigning several channels; importing still needs a new check.
            onAlias={(value, channelName) =>
              setMapping((m) => ({ ...m, channelAliases: { ...m.channelAliases, [value]: channelName } }))
            }
          />

          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-foreground"
                checked={saveMapping}
                onChange={(e) => setSaveMapping(e.target.checked)}
              />
              Zuordnung für {source.trim() ? `„${source.trim()}“` : "diese Quelle"} speichern
            </label>
            <div className="ml-auto flex gap-2">
              <Link href={`/kampagnen/${slug}/performance`} className={buttonVariants({ variant: "ghost" })}>
                Abbrechen
              </Link>
              <Button variant="outline" onClick={() => run(true)} disabled={pending}>
                {pending && !canImport ? <Loader2 className="animate-spin" /> : null}
                3. Prüfen
              </Button>
              <Button variant="accent" onClick={() => run(false)} disabled={pending || !canImport}>
                {pending && canImport ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Importieren{canImport ? ` (${result.valueCount} Werte)` : ""}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function columnRoles(mapping: ImportMapping): Record<string, string> {
  const roles: Record<string, string> = {};
  if (mapping.dateColumn) roles[mapping.dateColumn] = "Datum";
  if (mapping.channelColumn) roles[mapping.channelColumn] = "Kanal";
  if (mapping.layout === "long") {
    if (mapping.kpiColumn) roles[mapping.kpiColumn] = "KPI";
    if (mapping.valueColumn) roles[mapping.valueColumn] = "Wert";
    if (mapping.unitColumn) roles[mapping.unitColumn] = "Einheit";
  } else {
    for (const k of mapping.kpiColumns) roles[k.column] = `KPI: ${k.kpiName}`;
  }
  return roles;
}

function IssueList({ issues, tone }: { issues: ImportIssue[]; tone: "error" | "warning" }) {
  return (
    <ul className={cn("space-y-1 text-sm", tone === "error" ? "text-status-red" : "text-foreground")}>
      {issues.map((issue, i) => (
        <li key={i} className="flex gap-2">
          {tone === "error" ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
          ) : (
            <Info className="mt-0.5 size-4 shrink-0 text-status-yellow" />
          )}
          <span>
            {issue.rowNumber != null && <span className="font-medium">Zeile {issue.rowNumber}: </span>}
            {issue.message}
            {issue.column && issue.rowNumber != null && <span className="text-muted-foreground"> (Spalte {issue.column})</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ResultPanel({
  result,
  channels,
  aliases,
  onAlias,
}: {
  result: RunImportResult | null;
  channels: { id: string; name: string }[];
  aliases: Record<string, string>;
  onAlias: (value: string, channelName: string) => void;
}) {
  if (!result) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Zuordnung prüfen lassen: Fehler werden mit Zeilennummer angezeigt, nichts wird gespeichert.
      </p>
    );
  }

  if (!result.ok) {
    return (
      <section className="space-y-3 rounded-xl border border-status-red bg-card p-4" aria-live="polite">
        <h3 className="font-semibold">Bitte korrigieren</h3>
        <IssueList issues={result.errors} tone="error" />
        {result.unknownChannels && result.unknownChannels.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Kanäle zuordnen (wird mit der Quelle gespeichert):</p>
            {result.unknownChannels.map((value, index) => (
              <div key={value} className="grid grid-cols-[1fr_1fr] items-center gap-3">
                <Label htmlFor={`alias-${index}`} className="truncate font-normal">
                  „{value}“
                </Label>
                <Select id={`alias-${index}`} value={aliases[value] ?? ""} onChange={(e) => onAlias(value, e.target.value)}>
                  <option value="">Kanal wählen</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
        )}
        {result.warnings && result.warnings.length > 0 && <IssueList issues={result.warnings} tone="warning" />}
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-status-green bg-card p-4" aria-live="polite">
      <h3 className="flex items-center gap-2 font-semibold">
        <CheckCircle2 className="size-4 text-status-green" /> {result.valueCount} Werte bereit zum Import
      </h3>
      {result.warnings.length > 0 && <IssueList issues={result.warnings} tone="warning" />}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Kanal</th>
              <th className="py-1.5 pr-3 font-medium">KPI</th>
              <th className="py-1.5 pr-3 text-right font-medium">Werte</th>
              <th className="py-1.5 text-right font-medium">Summe / Ø</th>
            </tr>
          </thead>
          <tbody>
            {result.summary.map((row) => {
              const avg = aggregationFor(row.kpiName) === "avg";
              return (
                <tr key={`${row.channelName}-${row.kpiName}`} className="border-t">
                  <td className="py-1.5 pr-3">{row.channelName ?? <span className="text-muted-foreground">Kampagne gesamt</span>}</td>
                  <td className="py-1.5 pr-3">{row.kpiName}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{row.count}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {avg ? "Ø " : ""}
                    {formatGermanNumber(avg ? row.sum / row.count : row.sum)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
