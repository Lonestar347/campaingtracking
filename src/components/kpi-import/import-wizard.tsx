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
import { formatNumber } from "@/lib/format";
import { aggregationFor } from "@/lib/kpi-import/actuals";
import { mappingColumns, type ImportIssue, type ImportMapping } from "@/lib/kpi-import";
import {
  analyzeUpload,
  runImport,
  type AnalyzeResult,
  type RunImportResult,
} from "@/app/campaigns/import-actions";

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
      setError("Please select a file.");
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
        setError("Upload failed. Is the file larger than 10 MB?");
      }
    });
  };

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4 rounded-xl border bg-card p-6">
      <div>
        <h2 className="font-semibold">1. Upload file</h2>
        <p className="text-sm text-muted-foreground">Excel (.xlsx) or CSV, up to 10 MB. The original file is stored as well.</p>
      </div>
      <label
        htmlFor="report-file"
        className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center hover:bg-muted"
      >
        <FileSpreadsheet className="size-8 text-muted-foreground" />
        <span className="text-sm font-medium">{file ? file.name : "Choose file"}</span>
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
        {pending ? <Loader2 className="animate-spin" /> : <Upload />} Upload &amp; analyse
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
    first.recognizedSource ? `Format recognised: applied the saved mapping of “${first.recognizedSource}”.` : null,
  );
  const [pending, startTransition] = React.useTransition();

  /** Any change invalidates the last check. */
  const change = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setResult(null);
  };
  const updateMapping = (patch: Partial<ImportMapping>) => {
    setMapping((m) => {
      const next = { ...m, ...patch };
      // A column used as date, channel or creative cannot also be a KPI column.
      const taken = new Set([next.dateColumn, next.channelColumn, next.creativeColumn]);
      return { ...next, kpiColumns: next.kpiColumns.filter((k) => !taken.has(k.column)) };
    });
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
      setNotice(`Applied the saved mapping of “${value}”.`);
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
          router.push(`/campaigns/${slug}/performance?imported=${response.valueCount}&creatives=${response.creativeValueCount}`);
          router.refresh();
        }
      } catch {
        setResult({ ok: false, errors: [{ message: "Processing failed. Please try again." }] });
      }
    });

  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
  const otherHeaders = sheet.headers.filter(
    (h) => h !== mapping.dateColumn && h !== mapping.channelColumn && h !== mapping.creativeColumn,
  );
  const roles = columnRoles(mapping);
  const canImport = result?.ok === true && result.dryRun;

  const columnSelect = (id: string, label: string, value: string | undefined, onChange: (v?: string) => void, optional = true) => (
    <Field label={label} htmlFor={id}>
      <Select id={id} value={value ?? NONE} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value={NONE}>{optional ? "– none –" : "Please select"}</option>
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
          {sheet.rowCount} data rows · {sheet.headers.length} columns
        </span>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onRestart}>
          Different file
        </Button>
      </div>

      {notice && (
        <p className="flex items-center gap-2 rounded-lg border border-josera-gold bg-josera-gold/10 px-4 py-2.5 text-sm">
          <Info className="size-4 shrink-0" /> {notice}
        </p>
      )}

      <section className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-5 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">2. Details &amp; mapping</h2>

          {analysis.sheets.length > 1 && (
            <Field label="Sheet" htmlFor="imp-sheet">
              <Select id="imp-sheet" value={sheetName} onChange={(e) => selectSheet(e.target.value)}>
                {analysis.sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({s.rowCount} rows)
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Source (agency / partner)" htmlFor="imp-source" required error={fieldErrors.source}>
            <Input
              id="imp-source"
              list="imp-sources"
              value={source}
              onChange={(e) => chooseSource(e.target.value)}
              aria-invalid={!!fieldErrors.source}
              placeholder="e.g. Sample Agency"
            />
            <datalist id="imp-sources">
              {analysis.savedSources.map((s) => (
                <option key={s.source} value={s.source} />
              ))}
            </datalist>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Period from" htmlFor="imp-from" required error={fieldErrors.periodStart}>
              <Input id="imp-from" type="date" value={periodStart} onChange={(e) => change(setPeriodStart)(e.target.value)} />
            </Field>
            <Field label="to" htmlFor="imp-to" required error={fieldErrors.periodEnd}>
              <Input id="imp-to" type="date" value={periodEnd} onChange={(e) => change(setPeriodEnd)(e.target.value)} />
            </Field>
          </div>

          <div className="space-y-3 border-t pt-4">
            {columnSelect("imp-date", "Date column", mapping.dateColumn, (v) => updateMapping({ dateColumn: v }))}
            {columnSelect("imp-channel", "Channel column", mapping.channelColumn, (v) => updateMapping({ channelColumn: v }))}
            {columnSelect("imp-creative", "Creative column", mapping.creativeColumn, (v) => updateMapping({ creativeColumn: v }))}
            <Field
              label={mapping.channelColumn ? "Channel for rows without a channel" : "Channel for all values"}
              htmlFor="imp-default-channel"
              error={fieldErrors.defaultChannelId}
            >
              <Select
                id="imp-default-channel"
                value={defaultChannelId}
                onChange={(e) => change(setDefaultChannelId)(e.target.value)}
              >
                <option value={NONE}>– Whole campaign –</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <fieldset className="space-y-3 border-t pt-4">
            <legend className="mb-2 text-sm font-medium">Table layout</legend>
            {(
              [
                ["wide", "One column per KPI"],
                ["long", "One row per KPI (KPI + value columns)"],
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
                {columnSelect("imp-kpi", "KPI column", mapping.kpiColumn, (v) => updateMapping({ kpiColumn: v }), false)}
                {columnSelect("imp-value", "Value column", mapping.valueColumn, (v) => updateMapping({ valueColumn: v }), false)}
                {columnSelect("imp-unit", "Unit column", mapping.unitColumn, (v) => updateMapping({ unitColumn: v }))}
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Select the value columns and set the KPI name:</p>
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
                        aria-label={`Import ${header}`}
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
                          aria-label={`KPI name for ${header}`}
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

            <Field label="Number format" htmlFor="imp-format">
              <Select
                id="imp-format"
                value={mapping.numberFormat}
                onChange={(e) => updateMapping({ numberFormat: e.target.value as "de" | "en" })}
              >
                <option value="de">German (1.234,5)</option>
                <option value="en">English (1,234.5)</option>
              </Select>
            </Field>
          </fieldset>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-xl border bg-card">
            <h2 className="border-b px-4 py-3 font-semibold">Preview</h2>
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
                First {sheet.preview.length} of {sheet.rowCount} rows.
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
              Save mapping for {source.trim() ? `“${source.trim()}”` : "this source"}
            </label>
            <div className="ml-auto flex gap-2">
              <Link href={`/campaigns/${slug}/performance`} className={buttonVariants({ variant: "ghost" })}>
                Cancel
              </Link>
              <Button variant="outline" onClick={() => run(true)} disabled={pending}>
                {pending && !canImport ? <Loader2 className="animate-spin" /> : null}
                3. Check
              </Button>
              <Button variant="accent" onClick={() => run(false)} disabled={pending || !canImport}>
                {pending && canImport ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                Import{canImport ? ` (${result.valueCount} values)` : ""}
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
  if (mapping.dateColumn) roles[mapping.dateColumn] = "Date";
  if (mapping.channelColumn) roles[mapping.channelColumn] = "Channel";
  if (mapping.creativeColumn) roles[mapping.creativeColumn] = "Creative";
  if (mapping.layout === "long") {
    if (mapping.kpiColumn) roles[mapping.kpiColumn] = "KPI";
    if (mapping.valueColumn) roles[mapping.valueColumn] = "Value";
    if (mapping.unitColumn) roles[mapping.unitColumn] = "Unit";
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
            {issue.rowNumber != null && <span className="font-medium">Row {issue.rowNumber}: </span>}
            {issue.message}
            {issue.column && issue.rowNumber != null && <span className="text-muted-foreground"> (column {issue.column})</span>}
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
        Check the mapping: errors are shown with row numbers, nothing is saved.
      </p>
    );
  }

  if (!result.ok) {
    return (
      <section className="space-y-3 rounded-xl border border-status-red bg-card p-4" aria-live="polite">
        <h3 className="font-semibold">Please fix</h3>
        <IssueList issues={result.errors} tone="error" />
        {result.unknownChannels && result.unknownChannels.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Map channels (saved with the source):</p>
            {result.unknownChannels.map((value, index) => (
              <div key={value} className="grid grid-cols-[1fr_1fr] items-center gap-3">
                <Label htmlFor={`alias-${index}`} className="truncate font-normal">
                  “{value}”
                </Label>
                <Select id={`alias-${index}`} value={aliases[value] ?? ""} onChange={(e) => onAlias(value, e.target.value)}>
                  <option value="">Select channel</option>
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
        <CheckCircle2 className="size-4 text-status-green" /> {result.valueCount} values ready to import
      </h3>
      {result.creativeValueCount > 0 && (
        <p className="text-sm text-muted-foreground">
          {result.creativeValueCount} of them belong to a creative and appear in the Creatives tab.
        </p>
      )}
      {result.warnings.length > 0 && <IssueList issues={result.warnings} tone="warning" />}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 pr-3 font-medium">Channel</th>
              <th className="py-1.5 pr-3 font-medium">KPI</th>
              <th className="py-1.5 pr-3 text-right font-medium">Values</th>
              <th className="py-1.5 text-right font-medium">Sum / avg.</th>
            </tr>
          </thead>
          <tbody>
            {result.summary.map((row) => {
              const avg = aggregationFor(row.kpiName) === "avg";
              return (
                <tr key={`${row.channelName}-${row.kpiName}`} className="border-t">
                  <td className="py-1.5 pr-3">{row.channelName ?? <span className="text-muted-foreground">Whole campaign</span>}</td>
                  <td className="py-1.5 pr-3">{row.kpiName}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{row.count}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {avg ? "avg. " : ""}
                    {formatNumber(avg ? row.sum / row.count : row.sum)}
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
