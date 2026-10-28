"use server";

// KPI report import: analyse an uploaded file, dry-run or run the import with
// a column mapping, delete reports. The original file is kept in storage.

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { parseDateInput } from "@/lib/format";
import { formatDate } from "@/lib/dates";
import { parseKpiTargets } from "@/lib/validation";
import {
  applyMapping,
  cellToString,
  extractTable,
  findMatchingMapping,
  importMappingSchema,
  suggestMapping,
  summarizeValues,
  type ImportIssue,
  type ImportMapping,
  type RawTable,
} from "@/lib/kpi-import";
import { UploadError, checkUpload, parseUpload } from "@/lib/kpi-import/parse-file";

const PREVIEW_ROWS = 12;

export interface AnalyzedSheet {
  name: string;
  headers: string[];
  preview: string[][];
  rowCount: number;
  suggestion: ImportMapping;
  /** Source whose saved mapping matches this sheet's columns. */
  recognizedSource: string | null;
  dateRange: { from: string; to: string } | null;
}

export type AnalyzeResult =
  | { ok: true; uploadKey: string; fileName: string; sheets: AnalyzedSheet[]; savedSources: { source: string; mapping: ImportMapping }[] }
  | { ok: false; error: string };

async function loadSavedMappings() {
  const rows = await db.kpiImportMapping.findMany({ orderBy: { source: "asc" } });
  return rows.flatMap((row) => {
    const parsed = importMappingSchema.safeParse(row.mapping);
    return parsed.success ? [{ source: row.source, mapping: parsed.data }] : [];
  });
}

async function campaignContext(campaignId: string) {
  return db.campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      slug: true,
      channels: { select: { id: true, name: true, kpiTargets: true, channelType: { select: { name: true } } } },
    },
  });
}

export async function analyzeUpload(campaignId: string, formData: FormData): Promise<AnalyzeResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, error: auth.error };
  const campaign = await campaignContext(campaignId);
  if (!campaign) return { ok: false, error: "Kampagne nicht gefunden." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Bitte eine Datei auswählen." };

  try {
    checkUpload(file.name, file.size);
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseUpload(buffer, file.name);
    const uploadKey = await storage.put(buffer, file.name, `reports/${campaign.id}`);

    const knownKpis = [...new Set(campaign.channels.flatMap((c) => Object.keys(parseKpiTargets(c.kpiTargets))))];
    const channels = campaign.channels.map((c) => ({ id: c.id, name: c.name, typeName: c.channelType.name }));
    const saved = await loadSavedMappings();

    const sheets = parsed.map((sheet): AnalyzedSheet => {
      const table = extractTable(sheet.rows);
      const match = findMatchingMapping(table.headers, saved);
      const suggestion = { ...(match?.mapping ?? suggestMapping(table, knownKpis)), sheetName: sheet.name };
      const trial = applyMapping(table, suggestion, { channels });
      return {
        name: sheet.name,
        headers: table.headers,
        preview: table.rows.slice(0, PREVIEW_ROWS).map((row) => row.map((c) => (c instanceof Date ? formatDate(c) : cellToString(c)))),
        rowCount: table.rows.length,
        suggestion,
        recognizedSource: match?.source ?? null,
        dateRange: trial.dateRange
          ? { from: trial.dateRange.from.toISOString().slice(0, 10), to: trial.dateRange.to.toISOString().slice(0, 10) }
          : null,
      };
    });

    return { ok: true, uploadKey, fileName: file.name, sheets, savedSources: saved };
  } catch (error) {
    if (error instanceof UploadError) return { ok: false, error: error.message };
    console.error("analyzeUpload failed", error);
    return { ok: false, error: "Die Datei konnte nicht verarbeitet werden." };
  }
}

export interface RunImportInput {
  campaignId: string;
  uploadKey: string;
  fileName: string;
  sheetName: string;
  source: string;
  periodStart: string;
  periodEnd: string;
  defaultChannelId: string;
  mapping: ImportMapping;
  saveMapping: boolean;
  dryRun: boolean;
}

export interface ImportSummaryRow {
  channelName: string | null;
  kpiName: string;
  count: number;
  sum: number;
}

export type RunImportResult =
  | { ok: true; dryRun: boolean; valueCount: number; summary: ImportSummaryRow[]; warnings: ImportIssue[]; reportId?: string }
  | {
      ok: false;
      errors: ImportIssue[];
      warnings?: ImportIssue[];
      unknownChannels?: string[];
      fieldErrors?: Record<string, string>;
    };

export async function runImport(input: RunImportInput): Promise<RunImportResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, errors: [{ message: auth.error }] };
  const campaign = await campaignContext(input.campaignId);
  if (!campaign) return { ok: false, errors: [{ message: "Kampagne nicht gefunden." }] };

  // Only files uploaded for this campaign may be imported.
  const prefix = `reports/${campaign.id}/`;
  if (!input.uploadKey.startsWith(prefix) || input.uploadKey.includes("..")) {
    return { ok: false, errors: [{ message: "Ungültige Datei-Referenz. Bitte die Datei erneut hochladen." }] };
  }

  const fieldErrors: Record<string, string> = {};
  const source = input.source.trim();
  if (!source) fieldErrors.source = "Quelle angeben, z. B. den Namen der Agentur";
  if (source.length > 120) fieldErrors.source = "Maximal 120 Zeichen";
  const periodStart = parseDateInput(input.periodStart);
  const periodEnd = parseDateInput(input.periodEnd);
  if (!periodStart) fieldErrors.periodStart = "Beginn des Berichtszeitraums angeben";
  if (!periodEnd) fieldErrors.periodEnd = "Ende des Berichtszeitraums angeben";
  if (periodStart && periodEnd && periodEnd < periodStart) fieldErrors.periodEnd = "Ende liegt vor dem Beginn";
  const defaultChannelId = input.defaultChannelId || null;
  if (defaultChannelId && !campaign.channels.some((c) => c.id === defaultChannelId)) {
    fieldErrors.defaultChannelId = "Kanal gehört nicht zur Kampagne";
  }
  const mapping = importMappingSchema.safeParse(input.mapping);
  if (!mapping.success) return { ok: false, errors: [{ message: "Die Zuordnung ist unvollständig." }] };
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  let table: RawTable;
  try {
    const sheets = await parseUpload(await storage.get(input.uploadKey), input.fileName);
    const sheet = sheets.find((s) => s.name === input.sheetName) ?? sheets[0];
    table = extractTable(sheet.rows);
  } catch (error) {
    const message = error instanceof UploadError ? error.message : "Die hochgeladene Datei ist nicht mehr verfügbar. Bitte erneut hochladen.";
    return { ok: false, errors: [{ message }] };
  }

  const channels = campaign.channels.map((c) => ({ id: c.id, name: c.name, typeName: c.channelType.name }));
  const result = applyMapping(table, mapping.data, { channels, defaultChannelId });
  // Report form and file problems together, so everything can be fixed in one go.
  if (hasFieldErrors || result.errors.length > 0) {
    return {
      ok: false,
      errors: [...(hasFieldErrors ? [{ message: "Bitte die markierten Angaben prüfen." }] : []), ...result.errors],
      warnings: result.warnings,
      unknownChannels: result.unknownChannels,
      fieldErrors,
    };
  }
  if (result.values.length === 0) {
    return { ok: false, errors: [{ message: "Keine Werte gefunden – sind die richtigen Spalten zugeordnet?" }] };
  }

  const warnings = [...result.warnings];
  const outside = result.values.filter((v) => v.date && (v.date < periodStart! || v.date > periodEnd!)).length;
  if (outside > 0) warnings.push({ message: `${outside} Wert(e) liegen außerhalb des angegebenen Berichtszeitraums.` });
  const duplicate = await db.kpiReport.findFirst({
    where: { campaignId: campaign.id, source, periodStart: periodStart!, periodEnd: periodEnd! },
    select: { originalFileName: true },
  });
  if (duplicate) {
    warnings.push({
      message: `Für „${source}“ und diesen Zeitraum gibt es schon einen Report (${duplicate.originalFileName}). Werte würden doppelt gezählt.`,
    });
  }

  const channelName = new Map(campaign.channels.map((c) => [c.id, c.name]));
  const summary = summarizeValues(result.values).map((s) => ({
    channelName: s.channelId ? (channelName.get(s.channelId) ?? null) : null,
    kpiName: s.kpiName,
    count: s.count,
    sum: s.sum,
  }));

  if (input.dryRun) return { ok: true, dryRun: true, valueCount: result.values.length, summary, warnings };

  const reportId = await db.$transaction(async (tx) => {
    const report = await tx.kpiReport.create({
      data: {
        campaignId: campaign.id,
        channelId: defaultChannelId,
        source,
        periodStart: periodStart!,
        periodEnd: periodEnd!,
        originalFileName: input.fileName,
        storageKey: input.uploadKey,
        uploadedById: auth.user.id,
      },
    });
    await tx.kpiValue.createMany({
      data: result.values.map((v) => ({
        reportId: report.id,
        channelId: v.channelId,
        kpiName: v.kpiName,
        value: v.value,
        unit: v.unit,
        date: v.date,
      })),
    });
    if (input.saveMapping) {
      const stored = { ...mapping.data, sheetName: input.sheetName } as Prisma.InputJsonValue;
      await tx.kpiImportMapping.upsert({ where: { source }, create: { source, mapping: stored }, update: { mapping: stored } });
    }
    await tx.activityLog.create({
      data: {
        entityType: "kpi_report",
        entityId: report.id,
        action: "imported",
        details: { campaignId: campaign.id, source, fileName: input.fileName, values: result.values.length },
        userId: auth.user.id,
      },
    });
    return report.id;
  });

  revalidatePath(`/kampagnen/${campaign.slug}`, "layout");
  return { ok: true, dryRun: false, valueCount: result.values.length, summary, warnings, reportId };
}

export async function deleteReport(reportId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, error: auth.error };
  const report = await db.kpiReport.findUnique({ where: { id: reportId }, include: { campaign: { select: { slug: true } } } });
  if (!report) return { ok: false, error: "Report nicht gefunden." };

  await db.$transaction(async (tx) => {
    await tx.kpiReport.delete({ where: { id: reportId } });
    await tx.activityLog.create({
      data: {
        entityType: "kpi_report",
        entityId: reportId,
        action: "deleted",
        details: { campaignId: report.campaignId, source: report.source, fileName: report.originalFileName },
        userId: auth.user.id,
      },
    });
  });
  await storage.delete(report.storageKey).catch(() => undefined);

  revalidatePath(`/kampagnen/${report.campaign.slug}`, "layout");
  return { ok: true };
}
