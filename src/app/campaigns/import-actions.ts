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
      creatives: { select: { id: true, title: true } },
    },
  });
}

export async function analyzeUpload(campaignId: string, formData: FormData): Promise<AnalyzeResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, error: auth.error };
  const campaign = await campaignContext(campaignId);
  if (!campaign) return { ok: false, error: "Campaign not found." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Please select a file." };

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
      const trial = applyMapping(table, suggestion, { channels, creatives: campaign.creatives });
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
    return { ok: false, error: "The file could not be processed." };
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
  | {
      ok: true;
      dryRun: boolean;
      valueCount: number;
      summary: ImportSummaryRow[];
      warnings: ImportIssue[];
      /** Values assigned to a creative, and creatives created (or to be created) by the import. */
      creativeValueCount: number;
      newCreatives: string[];
      reportId?: string;
    }
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
  if (!campaign) return { ok: false, errors: [{ message: "Campaign not found." }] };

  // Only files uploaded for this campaign may be imported.
  const prefix = `reports/${campaign.id}/`;
  if (!input.uploadKey.startsWith(prefix) || input.uploadKey.includes("..")) {
    return { ok: false, errors: [{ message: "Invalid file reference. Please upload the file again." }] };
  }

  const fieldErrors: Record<string, string> = {};
  const source = input.source.trim();
  if (!source) fieldErrors.source = "Enter the source, e.g. the agency name";
  if (source.length > 120) fieldErrors.source = "Maximum 120 characters";
  const periodStart = parseDateInput(input.periodStart);
  const periodEnd = parseDateInput(input.periodEnd);
  if (!periodStart) fieldErrors.periodStart = "Enter the start of the reporting period";
  if (!periodEnd) fieldErrors.periodEnd = "Enter the end of the reporting period";
  if (periodStart && periodEnd && periodEnd < periodStart) fieldErrors.periodEnd = "End is before start";
  const defaultChannelId = input.defaultChannelId || null;
  if (defaultChannelId && !campaign.channels.some((c) => c.id === defaultChannelId)) {
    fieldErrors.defaultChannelId = "Channel does not belong to this campaign";
  }
  const mapping = importMappingSchema.safeParse(input.mapping);
  if (!mapping.success) return { ok: false, errors: [{ message: "The mapping is incomplete." }] };
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  let table: RawTable;
  try {
    const sheets = await parseUpload(await storage.get(input.uploadKey), input.fileName);
    const sheet = sheets.find((s) => s.name === input.sheetName) ?? sheets[0];
    table = extractTable(sheet.rows);
  } catch (error) {
    const message = error instanceof UploadError ? error.message : "The uploaded file is no longer available. Please upload it again.";
    return { ok: false, errors: [{ message }] };
  }

  const channels = campaign.channels.map((c) => ({ id: c.id, name: c.name, typeName: c.channelType.name }));
  const result = applyMapping(table, mapping.data, { channels, creatives: campaign.creatives, defaultChannelId });
  // Report form and file problems together, so everything can be fixed in one go.
  if (hasFieldErrors || result.errors.length > 0) {
    return {
      ok: false,
      errors: [...(hasFieldErrors ? [{ message: "Please check the highlighted fields." }] : []), ...result.errors],
      warnings: result.warnings,
      unknownChannels: result.unknownChannels,
      fieldErrors,
    };
  }
  if (result.values.length === 0) {
    return { ok: false, errors: [{ message: "No values found – are the right columns mapped?" }] };
  }

  const warnings = [...result.warnings];
  const outside = result.values.filter((v) => v.date && (v.date < periodStart! || v.date > periodEnd!)).length;
  if (outside > 0) warnings.push({ message: `${outside} value(s) fall outside the reporting period.` });
  const duplicate = await db.kpiReport.findFirst({
    where: { campaignId: campaign.id, source, periodStart: periodStart!, periodEnd: periodEnd! },
    select: { originalFileName: true },
  });
  if (duplicate) {
    warnings.push({
      message: `A report for “${source}” and this period already exists (${duplicate.originalFileName}). Values would be counted twice.`,
    });
  }

  const channelName = new Map(campaign.channels.map((c) => [c.id, c.name]));
  const summary = summarizeValues(result.values).map((s) => ({
    channelName: s.channelId ? (channelName.get(s.channelId) ?? null) : null,
    kpiName: s.kpiName,
    count: s.count,
    sum: s.sum,
  }));

  const creativeInfo = {
    creativeValueCount: result.values.filter((v) => v.creativeId || v.creativeName).length,
    newCreatives: result.newCreatives,
  };
  if (input.dryRun) return { ok: true, dryRun: true, valueCount: result.values.length, summary, warnings, ...creativeInfo };

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
    // New creatives named in the report; the channel of their first row becomes their channel.
    const createdIds = new Map<string, string>();
    const lastCreative = await tx.creative.findFirst({ where: { campaignId: campaign.id }, orderBy: { sortOrder: "desc" } });
    for (const [index, title] of result.newCreatives.entries()) {
      const firstRow = result.values.find((v) => v.creativeName === title);
      const creative = await tx.creative.create({
        data: {
          campaignId: campaign.id,
          channelId: firstRow?.channelId ?? null,
          title,
          kpiValues: {},
          sortOrder: (lastCreative?.sortOrder ?? -1) + 1 + index,
        },
      });
      createdIds.set(title, creative.id);
      await tx.activityLog.create({
        data: {
          campaignId: campaign.id,
          entityType: "creative",
          entityId: creative.id,
          action: "created",
          details: { title, via: "import", fileName: input.fileName },
          userId: auth.user.id,
        },
      });
    }
    await tx.kpiValue.createMany({
      data: result.values.map((v) => ({
        reportId: report.id,
        channelId: v.channelId,
        creativeId: v.creativeId ?? (v.creativeName ? (createdIds.get(v.creativeName) ?? null) : null),
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
        campaignId: campaign.id,
        entityType: "kpi_report",
        entityId: report.id,
        action: "imported",
        details: { campaignId: campaign.id, source, fileName: input.fileName, values: result.values.length },
        userId: auth.user.id,
      },
    });
    return report.id;
  });

  revalidatePath(`/campaigns/${campaign.slug}`, "layout");
  return { ok: true, dryRun: false, valueCount: result.values.length, summary, warnings, ...creativeInfo, reportId };
}

export async function deleteReport(reportId: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, error: auth.error };
  const report = await db.kpiReport.findUnique({ where: { id: reportId }, include: { campaign: { select: { slug: true } } } });
  if (!report) return { ok: false, error: "Report not found." };

  await db.$transaction(async (tx) => {
    await tx.kpiReport.delete({ where: { id: reportId } });
    await tx.activityLog.create({
      data: {
        campaignId: report.campaignId,
        entityType: "kpi_report",
        entityId: reportId,
        action: "deleted",
        details: { campaignId: report.campaignId, source: report.source, fileName: report.originalFileName },
        userId: auth.user.id,
      },
    });
  });
  await storage.delete(report.storageKey).catch(() => undefined);

  revalidatePath(`/campaigns/${report.campaign.slug}`, "layout");
  return { ok: true };
}
