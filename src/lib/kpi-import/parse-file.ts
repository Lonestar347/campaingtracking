// Reads uploaded report files into raw sheet rows. Server only (exceljs).

import ExcelJS from "exceljs";
import Papa from "papaparse";
import type { CellValue } from "@/lib/kpi-import";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = [".xlsx", ".csv"] as const;
/** Upper bound on rows per sheet, to keep memory and validation time bounded. */
const MAX_ROWS = 50_000;

export interface ParsedSheet {
  name: string;
  rows: CellValue[][];
}

export class UploadError extends Error {}

export function extensionOf(fileName: string): string {
  const match = /\.[^.]+$/.exec(fileName.toLowerCase());
  return match ? match[0] : "";
}

/** Checks name and size before parsing; throws UploadError with a user-facing message. */
export function checkUpload(fileName: string, size: number) {
  const ext = extensionOf(fileName);
  if (ext === ".xls") {
    throw new UploadError("Legacy .xls files are not supported. Please save the file as .xlsx in Excel.");
  }
  if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new UploadError("Please upload an Excel (.xlsx) or CSV file.");
  }
  if (size === 0) throw new UploadError("The file is empty.");
  if (size > MAX_UPLOAD_BYTES) throw new UploadError("The file is larger than 10 MB.");
}

export async function parseUpload(buffer: Buffer, fileName: string): Promise<ParsedSheet[]> {
  const ext = extensionOf(fileName);
  try {
    const sheets = ext === ".csv" ? [parseCsv(buffer, fileName)] : await parseXlsx(buffer);
    const nonEmpty = sheets.filter((s) => s.rows.some((r) => r.some((c) => c != null && c !== "")));
    if (nonEmpty.length === 0) throw new UploadError("The file contains no data.");
    if (nonEmpty.some((s) => s.rows.length > MAX_ROWS)) {
      throw new UploadError(`Too many rows (maximum ${MAX_ROWS.toLocaleString("en-GB")} per sheet).`);
    }
    return nonEmpty;
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError(
      ext === ".csv"
        ? "The CSV file could not be read."
        : "The Excel file could not be read. Is it damaged or password-protected?",
    );
  }
}

/** Decodes CSV bytes: UTF-8 (with or without BOM), falling back to Windows-1252 (German Excel default). */
export function decodeCsv(buffer: Buffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const text = utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
  return text.replace(/^﻿/, "");
}

function parseCsv(buffer: Buffer, fileName: string): ParsedSheet {
  const result = Papa.parse<string[]>(decodeCsv(buffer), {
    delimitersToGuess: [";", ",", "\t", "|"],
    skipEmptyLines: false,
  });
  if (result.errors.some((e) => e.type === "Delimiter" && result.data.length > 1 && result.data[0].length > 1)) {
    throw new UploadError("The CSV delimiter could not be detected.");
  }
  return {
    name: fileName.replace(/\.csv$/i, ""),
    rows: result.data.map((row) => row.map((cell) => (cell.trim() === "" ? null : cell))),
  };
}

function normalizeCell(value: ExcelJS.CellValue): CellValue {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return normalizeCell((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ("richText" in value) return (value as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in value) return String((value as ExcelJS.CellHyperlinkValue).text);
    if ("error" in value) return null;
  }
  return null;
}

async function parseXlsx(buffer: Buffer): Promise<ParsedSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets
    .filter((ws) => ws.state !== "hidden" && ws.state !== "veryHidden")
    .map((ws) => {
      const rows: CellValue[][] = [];
      ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
        if (rowNumber > MAX_ROWS + 1) return;
        const cells: CellValue[] = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          cells[col - 1] = normalizeCell(cell.value);
        });
        rows[rowNumber - 1] = Array.from(cells, (c) => c ?? null);
      });
      return { name: ws.name, rows: Array.from(rows, (r) => r ?? []) };
    });
}
