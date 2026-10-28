import { describe, expect, it } from "vitest";
import { euroToCents, parseDateInput, parseGermanNumber, slugify, toDateInput } from "@/lib/format";

describe("parseGermanNumber", () => {
  it.each([
    ["1500", 1500],
    ["12.345,50", 12345.5],
    ["0,5", 0.5],
    ["1.000.000", 1_000_000],
    [" 250.000 € ", 250_000],
    ["70 %", 70],
    ["-3,2", -3.2],
  ])("parses %j", (input, expected) => {
    expect(parseGermanNumber(input)).toBe(expected);
  });

  it.each(["", "abc", "1,2,3", "12.34", "1.2345", ","])("rejects %j", (input) => {
    expect(parseGermanNumber(input)).toBeNull();
  });
});

describe("euroToCents", () => {
  it("rounds to whole cents", () => {
    expect(euroToCents(19.99)).toBe(1999);
    expect(euroToCents(0.1 + 0.2)).toBe(30);
  });
});

describe("slugify", () => {
  it("transliterates umlauts and strips punctuation", () => {
    expect(slugify("Frühjahrsaktion Shop – Größe & Maß!")).toBe("fruehjahrsaktion-shop-groesse-mass");
  });

  it("handles accents and leading/trailing separators", () => {
    expect(slugify("  Café Été 2026  ")).toBe("cafe-ete-2026");
  });
});

describe("date input helpers", () => {
  it("round-trips YYYY-MM-DD", () => {
    const date = parseDateInput("2026-11-03");
    expect(date?.toISOString()).toBe("2026-11-03T00:00:00.000Z");
    expect(toDateInput(date)).toBe("2026-11-03");
  });

  it("rejects invalid dates", () => {
    expect(parseDateInput("2026-02-31")).toBeNull();
    expect(parseDateInput("03.11.2026")).toBeNull();
    expect(parseDateInput("")).toBeNull();
  });
});
