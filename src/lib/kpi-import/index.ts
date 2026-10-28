// KPI report import: turning a spreadsheet table into KPI values via a column
// mapping. Pure functions (file parsing lives in ./parse-file.ts, server only).
//
// Two table layouts are supported:
// - "long":  one row per value, with a KPI-name column and a value column
//            (Date | Channel | KPI | Value)
// - "wide":  one column per KPI (Date | Channel | Impressions | Clicks | …)
//
// Header detection and column hints understand English and German reports.

import { z } from "zod";

export type CellValue = string | number | boolean | Date | null;

export interface RawTable {
  headers: string[];
  /** Data rows (same length as headers); `rowNumbers` holds their 1-based sheet row numbers. */
  rows: CellValue[][];
  rowNumbers: number[];
  /** Rows dropped as totals ("Total", "Gesamt", "Summe"), as sheet row numbers. */
  skippedTotals: number[];
}

const isEmpty = (v: CellValue) => v == null || (typeof v === "string" && v.trim() === "");

const TOTAL_ROW = /^(gesamt|summe|total|grand total|insgesamt)\b/i;

/**
 * Index of the header row: the first row that is at least half as wide (in
 * filled cells) as the widest of the first rows. Skips title rows such as
 * "Report Agency X" above the actual table.
 */
function findHeaderIndex(sheetRows: CellValue[][]): number {
  const filled = sheetRows.slice(0, 30).map((row) => row.filter((c) => !isEmpty(c)).length);
  const widest = Math.max(0, ...filled);
  if (widest === 0) return -1;
  const needed = Math.max(Math.min(2, widest), Math.ceil(widest / 2));
  return filled.findIndex((count) => count >= needed);
}

/**
 * Extracts a table from raw sheet rows: title rows above the header are
 * skipped, as are fully empty rows and total rows. Header names are trimmed and
 * made unique ("Clicks", "Clicks (2)"); empty headers become "Column N".
 */
export function extractTable(sheetRows: CellValue[][]): RawTable {
  const headerIndex = findHeaderIndex(sheetRows);
  if (headerIndex < 0) return { headers: [], rows: [], rowNumbers: [], skippedTotals: [] };

  const rawHeaders = sheetRows[headerIndex];
  const width = Math.max(...sheetRows.slice(headerIndex).map((r) => r.length));
  const seen = new Map<string, number>();
  const headers = Array.from({ length: width }, (_, i) => {
    const base = cellToString(rawHeaders[i] ?? null).trim() || `Column ${i + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });

  const rows: CellValue[][] = [];
  const rowNumbers: number[] = [];
  const skippedTotals: number[] = [];
  sheetRows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2;
    if (row.every(isEmpty)) return;
    const firstText = row.find((c) => typeof c === "string" && c.trim() !== "");
    if (typeof firstText === "string" && TOTAL_ROW.test(firstText.trim())) {
      skippedTotals.push(rowNumber);
      return;
    }
    rows.push(Array.from({ length: width }, (_, i) => row[i] ?? null));
    rowNumbers.push(rowNumber);
  });

  // Drop trailing columns that are empty everywhere and have no real header.
  let keep = width;
  while (keep > 0 && headers[keep - 1].startsWith("Column ") && rows.every((r) => isEmpty(r[keep - 1]))) keep--;
  return {
    headers: headers.slice(0, keep),
    rows: rows.map((r) => r.slice(0, keep)),
    rowNumbers,
    skippedTotals,
  };
}

export function cellToString(value: CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

// ---------------------------------------------------------------------------
// Numbers and dates

export type NumberFormat = "de" | "en";

/**
 * Parses a report number. Numeric cells pass through; text is read in the given
 * format ("de": 1.234,5 / "en": 1,234.5). Currency/percent signs and spaces are
 * ignored ("12,5 %" -> 12.5). Returns null if not a number.
 */
export function parseReportNumber(value: CellValue, format: NumberFormat): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let text = value.replace(/[\s €$%]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (text === "" || text === "-") return null;
  const [thousands, decimal] = format === "de" ? [".", ","] : [",", "."];
  const groups = new RegExp(`^-?\\d{1,3}(\\${thousands}\\d{3})+(\\${decimal}\\d+)?$`);
  const plain = new RegExp(`^-?\\d+(\\${decimal}\\d+)?$`);
  if (groups.test(text)) text = text.split(thousands).join("");
  else if (!plain.test(text) && !/^-?\d*\.\d+$/.test(text)) return null;
  if (decimal === ",") text = text.replace(",", ".");
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/** Guesses the number format from text cells; numeric cells carry no hint. Defaults to "de". */
export function detectNumberFormat(values: readonly CellValue[]): NumberFormat {
  let de = 0;
  let en = 0;
  for (const v of values) {
    if (typeof v !== "string") continue;
    const t = v.replace(/[\s €$%]/g, "");
    if (/\d,\d{1,2}$/.test(t) || /\.\d{3},/.test(t) || /^\d{1,3}(\.\d{3}){2,}$/.test(t)) de++;
    else if (/\d\.\d{1,2}$/.test(t) || /,\d{3}\./.test(t) || /^\d{1,3}(,\d{3}){2,}$/.test(t)) en++;
  }
  return en > de ? "en" : "de";
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/**
 * Parses a report date to a date-only Date (00:00 UTC). Accepts Date cells,
 * Excel serial numbers and the text formats TT.MM.JJJJ, TT/MM/JJJJ, JJJJ-MM-TT
 * (with or without time). Returns null if not a date.
 */
export function parseReportDate(value: CellValue): Date | null {
  const make = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
  };
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : make(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    // Plausible Excel serials only (1990–2100).
    if (value < 32874 || value > 73051) return null;
    const date = new Date(EXCEL_EPOCH + Math.floor(value) * 86_400_000);
    return make(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  if (typeof value !== "string") return null;
  const t = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  if (m) return make(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})(?:\s.*)?$/.exec(t);
  if (m) return make(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return null;
}

// ---------------------------------------------------------------------------
// Mapping

export const importMappingSchema = z.object({
  layout: z.enum(["long", "wide"]),
  /** Long layout: column with the KPI name and the value column. */
  kpiColumn: z.string().optional(),
  valueColumn: z.string().optional(),
  unitColumn: z.string().optional(),
  /** Wide layout: value columns, each with the KPI name it represents. */
  kpiColumns: z.array(z.object({ column: z.string(), kpiName: z.string().trim().min(1) })).default([]),
  channelColumn: z.string().optional(),
  dateColumn: z.string().optional(),
  numberFormat: z.enum(["de", "en"]).default("de"),
  /** Cell value in the channel column -> channel name (stable across campaigns). */
  channelAliases: z.record(z.string(), z.string()).default({}),
  sheetName: z.string().optional(),
});
export type ImportMapping = z.infer<typeof importMappingSchema>;

/** Header columns a mapping relies on. */
export function mappingColumns(mapping: ImportMapping): string[] {
  const cols =
    mapping.layout === "long"
      ? [mapping.kpiColumn, mapping.valueColumn, mapping.unitColumn]
      : mapping.kpiColumns.map((k) => k.column);
  return [...cols, mapping.channelColumn, mapping.dateColumn].filter((c): c is string => !!c);
}

const HEADER_HINTS = {
  date: /^(datum|date|tag|day)\b/i,
  /** Weaker date candidates, used only if no explicit date column exists. */
  period: /^(woche|week|kw|zeitraum|period|monat|month)\b/i,
  channel: /(kanal|channel|plattform|platform|medium|placement|netzwerk|network|quelle)/i,
  kpi: /^(kpi|metrik|metric|kennzahl|kennzahlen|measure)\b/i,
  value: /^(wert|value|anzahl|ist|actual|result|ergebnis)\b/i,
  unit: /^(einheit|unit)\b/i,
};

const normalizeName = (s: string) => s.toLocaleLowerCase("de-DE").replace(/[^a-z0-9äöüß%]+/g, "");

function isMostlyNumeric(table: RawTable, col: number, format: NumberFormat): boolean {
  const cells = table.rows.map((r) => r[col]).filter((c) => !isEmpty(c));
  if (cells.length === 0) return false;
  // Majority numeric: a column with a few bad cells still counts, so those cells get reported.
  return cells.filter((c) => parseReportNumber(c, format) != null).length / cells.length >= 0.5;
}

/**
 * Suggests a mapping from header names and cell contents. `knownKpis` (e.g. the
 * campaign's KPI target names) are used to name wide-layout columns.
 */
export function suggestMapping(table: RawTable, knownKpis: readonly string[] = []): ImportMapping {
  const find = (re: RegExp) => table.headers.find((h) => re.test(h.trim()));
  const numberFormat = detectNumberFormat(table.rows.flat());
  const dateColumn = find(HEADER_HINTS.date) ?? find(HEADER_HINTS.period);
  const channelColumn = find(HEADER_HINTS.channel);
  const kpiColumn = find(HEADER_HINTS.kpi);
  const valueColumn = find(HEADER_HINTS.value);
  const base = { dateColumn, channelColumn, numberFormat, channelAliases: {}, kpiColumns: [] };

  if (kpiColumn && valueColumn) {
    return { ...base, layout: "long", kpiColumn, valueColumn, unitColumn: find(HEADER_HINTS.unit) };
  }

  const known = new Map(knownKpis.map((k) => [normalizeName(k), k]));
  const kpiColumns = table.headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => header !== dateColumn && header !== channelColumn)
    // Week/month numbers are numeric but not KPIs.
    .filter(({ header }) => !HEADER_HINTS.period.test(header.trim()))
    .filter(({ index }) => isMostlyNumeric(table, index, numberFormat))
    .map(({ header }) => ({ column: header, kpiName: known.get(normalizeName(header)) ?? header }));
  return { ...base, layout: "wide", kpiColumns };
}

/**
 * Picks the saved mapping whose columns all exist in the table (the one using
 * the most columns wins). Lets recurring reports of a source be recognised.
 */
export function findMatchingMapping<T extends { source: string; mapping: ImportMapping }>(
  headers: readonly string[],
  saved: readonly T[],
): T | null {
  const available = new Set(headers);
  return (
    saved
      .map((s) => ({ s, cols: mappingColumns(s.mapping) }))
      .filter(({ cols }) => cols.length > 0 && cols.every((c) => available.has(c)))
      .sort((a, b) => b.cols.length - a.cols.length)[0]?.s ?? null
  );
}

// ---------------------------------------------------------------------------
// Applying a mapping

export interface ImportChannel {
  id: string;
  name: string;
  typeName: string;
}

export interface ImportedValue {
  rowNumber: number;
  channelId: string | null;
  kpiName: string;
  value: number;
  unit: string | null;
  date: Date | null;
}

export interface ImportIssue {
  /** Sheet row number, if the issue concerns a row. */
  rowNumber?: number;
  column?: string;
  message: string;
}

export interface ImportResult {
  values: ImportedValue[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  /** Channel cell values that matched no channel (for the alias dialog). */
  unknownChannels: string[];
  emptyCells: number;
  /** Range of all valid dates in the date column (also of rows with errors). */
  dateRange: { from: Date; to: Date } | null;
}

/** Resolves a channel cell value to a campaign channel: alias, then name or type name. */
export function matchChannel(
  cell: string,
  channels: readonly ImportChannel[],
  aliases: Record<string, string> = {},
): ImportChannel | null {
  const key = normalizeName(cell);
  if (!key) return null;
  const aliasTarget = Object.entries(aliases).find(([from]) => normalizeName(from) === key)?.[1];
  const wanted = aliasTarget ? normalizeName(aliasTarget) : key;
  return (
    channels.find((c) => normalizeName(c.name) === wanted) ??
    channels.find((c) => normalizeName(c.typeName) === wanted) ??
    null
  );
}

const MAX_ISSUES = 50;

export function applyMapping(
  table: RawTable,
  mapping: ImportMapping,
  context: { channels: readonly ImportChannel[]; defaultChannelId?: string | null },
): ImportResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const addError = (issue: ImportIssue) => {
    if (errors.length < MAX_ISSUES) errors.push(issue);
  };
  const col = (name?: string) => (name ? table.headers.indexOf(name) : -1);

  // Structural checks first: every referenced column must exist.
  const missing = mappingColumns(mapping).filter((c) => !table.headers.includes(c));
  for (const c of missing) addError({ column: c, message: `Column “${c}” is missing from the file.` });
  if (mapping.layout === "long" && (!mapping.kpiColumn || !mapping.valueColumn)) {
    addError({ message: "Please map the KPI and value columns." });
  }
  if (mapping.layout === "wide" && mapping.kpiColumns.length === 0) {
    addError({ message: "Please select at least one KPI column." });
  }
  const empty: ImportResult = { values: [], errors, warnings, unknownChannels: [], emptyCells: 0, dateRange: null };
  if (errors.length > 0) return empty;
  if (table.rows.length === 0) {
    errors.push({ message: "The table contains no data rows." });
    return empty;
  }

  const channelIdx = col(mapping.channelColumn);
  const dateIdx = col(mapping.dateColumn);
  const unknown = new Set<string>();
  const values: ImportedValue[] = [];
  /** Valid dates of all rows, also rows with other problems (to suggest the report period). */
  const seenDates: Date[] = [];
  let emptyCells = 0;
  let errorCount = 0;

  table.rows.forEach((row, i) => {
    const rowNumber = table.rowNumbers[i];

    let date: Date | null = null;
    if (dateIdx >= 0 && !isEmpty(row[dateIdx])) {
      date = parseReportDate(row[dateIdx]);
      if (!date) {
        errorCount++;
        addError({ rowNumber, column: mapping.dateColumn, message: `Invalid date “${cellToString(row[dateIdx])}”.` });
        return;
      }
      seenDates.push(date);
    }

    let channelId = context.defaultChannelId ?? null;
    if (channelIdx >= 0) {
      const cell = cellToString(row[channelIdx]).trim();
      if (cell) {
        const channel = matchChannel(cell, context.channels, mapping.channelAliases);
        if (!channel) {
          unknown.add(cell);
          return;
        }
        channelId = channel.id;
      }
    }

    const cells =
      mapping.layout === "long"
        ? [
            {
              kpiName: cellToString(row[col(mapping.kpiColumn)]).trim(),
              raw: row[col(mapping.valueColumn)],
              column: mapping.valueColumn!,
              unit: mapping.unitColumn ? cellToString(row[col(mapping.unitColumn)]).trim() || null : null,
            },
          ]
        : mapping.kpiColumns.map((k) => ({ kpiName: k.kpiName, raw: row[col(k.column)], column: k.column, unit: null }));

    for (const cell of cells) {
      if (isEmpty(cell.raw)) {
        emptyCells++;
        continue;
      }
      if (!cell.kpiName) {
        errorCount++;
        addError({ rowNumber, column: mapping.kpiColumn, message: "KPI name missing." });
        continue;
      }
      const value = parseReportNumber(cell.raw, mapping.numberFormat);
      if (value == null) {
        errorCount++;
        addError({ rowNumber, column: cell.column, message: `“${cellToString(cell.raw)}” is not a valid number.` });
        continue;
      }
      values.push({ rowNumber, channelId, kpiName: cell.kpiName, value, unit: cell.unit, date });
    }
  });

  const unknownChannels = [...unknown].sort((a, b) => a.localeCompare(b, "de"));
  if (unknownChannels.length > 0) {
    errors.unshift({
      column: mapping.channelColumn,
      message: `Unmapped channel: ${unknownChannels.map((c) => `“${c}”`).join(", ")}.`,
    });
  }
  if (errorCount > MAX_ISSUES) {
    errors.push({ message: `… and ${errorCount - MAX_ISSUES} more errors.` });
  }
  if (table.skippedTotals.length > 0) {
    warnings.push({ message: `Skipped ${table.skippedTotals.length} total row(s) (row ${table.skippedTotals.join(", ")}).` });
  }
  if (!mapping.channelColumn && !context.defaultChannelId) {
    warnings.push({ message: "Without a channel mapping, values count for the campaign only, not for individual channels." });
  }

  const dateRange =
    seenDates.length > 0
      ? {
          from: new Date(Math.min(...seenDates.map((d) => d.getTime()))),
          to: new Date(Math.max(...seenDates.map((d) => d.getTime()))),
        }
      : null;

  return { values, errors, warnings, unknownChannels, emptyCells, dateRange };
}

/** Per channel and KPI: number of values and their sum (preview before import). */
export function summarizeValues(values: readonly ImportedValue[]) {
  const map = new Map<string, { channelId: string | null; kpiName: string; count: number; sum: number }>();
  for (const v of values) {
    const key = `${v.channelId ?? ""}|${v.kpiName}`;
    const entry = map.get(key) ?? { channelId: v.channelId, kpiName: v.kpiName, count: 0, sum: 0 };
    entry.count++;
    entry.sum += v.value;
    map.set(key, entry);
  }
  return [...map.values()];
}
