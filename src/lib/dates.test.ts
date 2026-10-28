import { describe, expect, it } from "vitest";
import { daysBetween, formatDate, formatDateRange, formatEuroCents } from "@/lib/dates";

describe("formatDate", () => {
  it("formats as DD/MM/YYYY", () => {
    expect(formatDate(new Date("2026-03-05T00:00:00Z"))).toBe("05/03/2026");
  });

  it("shows a dash for missing dates", () => {
    expect(formatDate(null)).toBe("–");
    expect(formatDateRange(new Date("2026-03-05T00:00:00Z"), undefined)).toBe("05/03/2026 – –");
  });
});

describe("formatEuroCents", () => {
  it("formats cents as EUR", () => {
    expect(formatEuroCents(1234500).replace(/\s/g, " ")).toBe("€12,345.00");
  });
});

describe("daysBetween", () => {
  it("counts calendar days across a DST change", () => {
    // DST ends in Europe on 25.10.2026
    expect(daysBetween(new Date("2026-10-24T12:00:00Z"), new Date("2026-10-26T12:00:00Z"))).toBe(2);
  });
});
