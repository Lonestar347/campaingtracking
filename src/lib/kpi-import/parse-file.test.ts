import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { UploadError, checkUpload, decodeCsv, parseUpload } from "@/lib/kpi-import/parse-file";
import { extractTable } from "@/lib/kpi-import";

describe("checkUpload", () => {
  it("accepts xlsx and csv up to 10 MB", () => {
    expect(() => checkUpload("Report.XLSX", 1000)).not.toThrow();
    expect(() => checkUpload("report.csv", 1000)).not.toThrow();
  });

  it("rejects other files with clear messages", () => {
    expect(() => checkUpload("alt.xls", 10)).toThrow(/\.xlsx speichern/);
    expect(() => checkUpload("bild.png", 10)).toThrow(UploadError);
    expect(() => checkUpload("leer.csv", 0)).toThrow(/leer/);
    expect(() => checkUpload("gross.xlsx", 11 * 1024 * 1024)).toThrow(/10 MB/);
  });
});

describe("parseUpload", () => {
  it("reads xlsx sheets with numbers, dates, formulas and rich text", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Woche 45");
    ws.addRow(["Datum", "Kanal", "Klicks", "Kosten"]);
    ws.addRow([new Date(Date.UTC(2026, 10, 2)), { richText: [{ text: "Social " }, { text: "Reach" }] }, 120, { formula: "B1", result: 99.5 }]);
    ws.addRow([]);
    ws.addRow(["Summe", null, 120, null]);
    const hidden = wb.addWorksheet("Intern");
    hidden.state = "hidden";
    hidden.addRow(["geheim"]);
    wb.addWorksheet("Leer");
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const sheets = await parseUpload(buffer, "report.xlsx");
    expect(sheets.map((s) => s.name)).toEqual(["Woche 45"]);
    const table = extractTable(sheets[0].rows);
    expect(table.headers).toEqual(["Datum", "Kanal", "Klicks", "Kosten"]);
    expect(table.rows).toEqual([[new Date(Date.UTC(2026, 10, 2)), "Social Reach", 120, 99.5]]);
    expect(table.skippedTotals).toEqual([4]);
  });

  it("reads semicolon CSV in Windows-1252 with German numbers", async () => {
    const csv = "Datum;Kanal;Öffnungsrate %\r\n03.11.2026;Newsletter;35,5\r\n";
    const buffer = Buffer.from(Uint8Array.from([...csv].map((c) => c.charCodeAt(0))));
    const [sheet] = await parseUpload(buffer, "export.csv");
    expect(sheet.rows[0]).toEqual(["Datum", "Kanal", "Öffnungsrate %"]);
    expect(sheet.rows[1]).toEqual(["03.11.2026", "Newsletter", "35,5"]);
  });

  it("reads comma CSV in UTF-8 with BOM and quoted values", async () => {
    const buffer = Buffer.from('﻿Date,Channel,Clicks\n2026-11-03,"TV, Linear","1,234"\n', "utf-8");
    const [sheet] = await parseUpload(buffer, "export.csv");
    expect(sheet.rows[1]).toEqual(["2026-11-03", "TV, Linear", "1,234"]);
  });

  it("rejects broken files", async () => {
    await expect(parseUpload(Buffer.from("kein zip"), "kaputt.xlsx")).rejects.toThrow(/nicht gelesen/);
    await expect(parseUpload(Buffer.from("\n\n"), "leer.csv")).rejects.toThrow(/keine Daten/);
  });

  it("decodes UTF-8 without touching it", () => {
    expect(decodeCsv(Buffer.from("Größe;Wert", "utf-8"))).toBe("Größe;Wert");
  });
});
