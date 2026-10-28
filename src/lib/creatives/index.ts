// Creatives: finished ads/visuals of a campaign with an image and KPI values.
// Form schema, image checks, KPI aggregation (manual + imported) and the
// ranking for the dashboard's "Top creatives". Pure functions.

import { z } from "zod";
import { formatNumber } from "@/lib/format";
import { aggregationFor, lowerIsBetter } from "@/lib/kpi-import/actuals";
import { parseKpiTargets } from "@/lib/validation";
import { kpiRowsSchema, optionalId, optionalText, requiredText, type KpiFormValues } from "@/lib/validation/fields";

// ---------------------------------------------------------------------------
// Form

export interface CreativeFormValues {
  title: string;
  channelId: string;
  format: string;
  notes: string;
  /** Manual KPI values; `target` holds the value (shared KPI row editor). */
  kpis: KpiFormValues[];
}

export const creativeFormSchema = z.object({
  title: requiredText("Enter a title").max(200, "Maximum 200 characters"),
  channelId: optionalId,
  format: optionalText,
  notes: optionalText,
  kpis: kpiRowsSchema,
});
export type CreativeFormInput = z.output<typeof creativeFormSchema>;

export function emptyCreativeForm(): CreativeFormValues {
  return { title: "", channelId: "", format: "", notes: "", kpis: [] };
}

export function creativeFormFromRecord(creative: {
  title: string;
  channelId: string | null;
  format: string | null;
  notes: string | null;
  kpiValues: unknown;
}): CreativeFormValues {
  return {
    title: creative.title,
    channelId: creative.channelId ?? "",
    format: creative.format ?? "",
    notes: creative.notes ?? "",
    kpis: Object.entries(parseKpiTargets(creative.kpiValues)).map(([name, value], index) => ({
      clientId: `k${index}`,
      name,
      target: formatNumber(value, 4),
    })),
  };
}

export function creativeDataFromInput(input: CreativeFormInput) {
  return {
    title: input.title,
    channelId: input.channelId ?? null,
    format: input.format ?? null,
    notes: input.notes ?? null,
    kpiValues: Object.fromEntries(input.kpis.map((k) => [k.name, k.target])),
  };
}

// ---------------------------------------------------------------------------
// Images

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Accepted raster formats with their magic bytes (SVG is excluded: it can carry scripts). */
const IMAGE_SIGNATURES: { type: string; matches: (b: Uint8Array) => boolean }[] = [
  { type: "image/png", matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", matches: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  {
    type: "image/webp",
    matches: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

export const ACCEPTED_IMAGE_TYPES = IMAGE_SIGNATURES.map((s) => s.type);

/** Detects the image type from the file content; returns an error message for unsupported files. */
export function checkImage(data: Uint8Array): { ok: true; type: string } | { ok: false; error: string } {
  if (data.byteLength === 0) return { ok: false, error: "The file is empty." };
  if (data.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "The image is larger than 5 MB." };
  const match = IMAGE_SIGNATURES.find((s) => s.matches(data));
  return match ? { ok: true, type: match.type } : { ok: false, error: "Please upload a PNG, JPG, WebP or GIF image." };
}

// ---------------------------------------------------------------------------
// KPIs

export interface CreativeKpi {
  kpiName: string;
  value: number;
  /** Manual values take precedence over imported ones. */
  source: "manual" | "import";
  /** Number of imported values behind an imported KPI. */
  valueCount: number;
}

const kpiKey = (name: string) => name.trim().toLocaleLowerCase("en-GB");

/**
 * KPI values of a creative: imported values are aggregated per KPI (sum, or
 * average for rates), a manual value for the same KPI (case-insensitive)
 * replaces the imported one.
 */
export function creativeKpis(manual: unknown, imported: readonly { kpiName: string; value: number }[]): CreativeKpi[] {
  const result = new Map<string, CreativeKpi>();
  const groups = new Map<string, { name: string; values: number[] }>();
  for (const v of imported) {
    const group = groups.get(kpiKey(v.kpiName)) ?? { name: v.kpiName.trim(), values: [] };
    group.values.push(v.value);
    groups.set(kpiKey(v.kpiName), group);
  }
  for (const [key, group] of groups) {
    const sum = group.values.reduce((a, b) => a + b, 0);
    const value = aggregationFor(group.name) === "sum" ? sum : sum / group.values.length;
    result.set(key, { kpiName: group.name, value, source: "import", valueCount: group.values.length });
  }
  for (const [name, value] of Object.entries(parseKpiTargets(manual))) {
    result.set(kpiKey(name), { kpiName: name.trim(), value, source: "manual", valueCount: 0 });
  }
  return [...result.values()].sort((a, b) => a.kpiName.localeCompare(b.kpiName, "en-GB"));
}

export interface RankableCreative {
  id: string;
  title: string;
  kpis: readonly CreativeKpi[];
}

/** KPI names used by creatives, most frequent first (ties alphabetically). Names are de-duplicated case-insensitively. */
export function creativeKpiOptions(creatives: readonly RankableCreative[]): string[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const c of creatives) {
    for (const k of c.kpis) {
      const entry = counts.get(kpiKey(k.kpiName)) ?? { name: k.kpiName, count: 0 };
      entry.count++;
      counts.set(kpiKey(k.kpiName), entry);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "en-GB"))
    .map((e) => e.name);
}

/** Picks the KPI to rank by: the requested one if creatives use it, else the most common one. */
export function resolveRankingKpi(requested: string | undefined, options: readonly string[]): string | null {
  if (requested) {
    const match = options.find((o) => kpiKey(o) === kpiKey(requested));
    if (match) return match;
  }
  return options[0] ?? null;
}

export interface RankedCreative<T extends RankableCreative> {
  creative: T;
  kpi: CreativeKpi;
  rank: number;
}

/** Best creatives for a KPI: highest first, lowest first for cost KPIs (CPC, CPM, …). */
export function rankCreatives<T extends RankableCreative>(
  creatives: readonly T[],
  kpiName: string,
  limit = 6,
): RankedCreative<T>[] {
  const ascending = lowerIsBetter(kpiName);
  return creatives
    .flatMap((creative) => {
      const kpi = creative.kpis.find((k) => kpiKey(k.kpiName) === kpiKey(kpiName));
      return kpi ? [{ creative, kpi }] : [];
    })
    .sort(
      (a, b) =>
        (ascending ? a.kpi.value - b.kpi.value : b.kpi.value - a.kpi.value) ||
        a.creative.title.localeCompare(b.creative.title, "en-GB"),
    )
    .slice(0, limit)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** Campaign image: the creative marked as cover (if it has an image), else the first creative with an image. */
export function pickCover<T extends { isCover: boolean; imageKey: string | null; sortOrder: number }>(
  creatives: readonly T[],
): T | null {
  const withImage = creatives.filter((c) => c.imageKey).sort((a, b) => a.sortOrder - b.sortOrder);
  return withImage.find((c) => c.isCover) ?? withImage[0] ?? null;
}

/** URL of a creative's image; `version` busts the browser cache after a new upload. */
export function creativeImageUrl(creative: { id: string; updatedAt: Date }): string {
  return `/api/creatives/${creative.id}/image?v=${creative.updatedAt.getTime()}`;
}
