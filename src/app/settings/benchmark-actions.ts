"use server";

// Planning master data (admins only): benchmarks per channel type and lead
// times per asset type.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { ASSET_TYPES } from "@/lib/domain/enums";

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
