"use server";

// Planning master data (admins only): benchmarks per channel type and lead
// times per asset type.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { ASSET_TYPES, FUNNEL_STAGES } from "@/lib/domain/enums";
import { slugify } from "@/lib/format";
import { extraKpisSchema } from "@/lib/planning/reverse";

type Result = { ok: true } | { ok: false; error: string };

const value = z.number().finite().nonnegative().nullable();
const benchmarkRows = z.array(
  z.object({
    channelTypeId: z.string().min(1),
    cpm: value,
    frequency: value,
    rateToNext: value.refine((v) => v == null || v <= 100, "Rates are at most 100 %"),
    costPerAction: value,
    avgOrderValue: value,
    extraKpis: extraKpisSchema,
  }),
);
const days = z.number().int().min(0).max(365);
const leadTimeRows = z.array(
  z.object({ assetType: z.enum(ASSET_TYPES), briefingDays: days, productionDays: days, approvalDays: days }),
);

export async function saveBenchmarks(rows: unknown): Promise<Result> {
  const auth = await requirePermission("manage");
  if (!auth.user) return { ok: false, error: auth.error };
  const parsed = benchmarkRows.safeParse(rows);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid values." };

  const known = new Set((await db.channelType.findMany({ select: { id: true } })).map((t) => t.id));
  if (parsed.data.some((r) => !known.has(r.channelTypeId))) return { ok: false, error: "Unknown channel type." };
  const duplicate = parsed.data.find((r) => {
    const names = r.extraKpis.map((k) => k.name.toLowerCase());
    return new Set(names).size !== names.length;
  });
  if (duplicate) return { ok: false, error: "Each additional KPI may appear only once per channel type." };
  await db.$transaction(
    parsed.data.map(({ channelTypeId, ...data }) =>
      db.channelBenchmark.upsert({ where: { channelTypeId }, create: { channelTypeId, ...data }, update: data }),
    ),
  );
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveLeadTimes(rows: unknown): Promise<Result> {
  const auth = await requirePermission("manage");
  if (!auth.user) return { ok: false, error: auth.error };
  const parsed = leadTimeRows.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "Lead times must be whole days between 0 and 365." };
  await db.$transaction(
    parsed.data.map(({ assetType, ...data }) =>
      db.assetLeadTime.upsert({ where: { assetType }, create: { assetType, ...data }, update: data }),
    ),
  );
  revalidatePath("/", "layout");
  return { ok: true };
}

const channelTypeSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80, "Maximum 80 characters"),
  stage: z.enum(FUNNEL_STAGES, { errorMap: () => ({ message: "Select a funnel stage" }) }),
});

/** Adds a channel type (with empty benchmarks) – available in the charter, the mind map and the planning. */
export async function createChannelType(values: { name: string; stage: string }): Promise<Result> {
  const auth = await requirePermission("manage");
  if (!auth.user) return { ok: false, error: auth.error };
  const parsed = channelTypeSchema.safeParse(values);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { name, stage } = parsed.data;

  const existing = await db.channelType.findMany({ select: { key: true, name: true, sortOrder: true } });
  if (existing.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: "A channel type with this name already exists." };
  }
  const base = slugify(name).replace(/-/g, "_") || "channel";
  let key = base;
  for (let n = 2; existing.some((t) => t.key === key); n++) key = `${base}_${n}`;

  await db.channelType.create({
    data: {
      key,
      name,
      defaultFunnelStage: stage,
      sortOrder: Math.max(0, ...existing.map((t) => t.sortOrder)) + 1,
      benchmark: { create: { extraKpis: [] } },
    },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
