"use server";

// Reverse planning: save the plan inputs, apply the resulting KPI targets to the
// channels and set asset due dates from the backward schedule. Results are
// recalculated on the server from the stored master data.

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlanningMasterData } from "@/lib/queries";
import { parseKpiTargets } from "@/lib/validation";
import { diffFields } from "@/lib/entities/forms";
import { EMPTY_BENCHMARK } from "@/lib/planning/defaults";
import { computeReversePlan, mergeTargets, reversePlanSchema, type PlanChannel } from "@/lib/planning/reverse";
import { backwardSchedule } from "@/lib/planning/schedule";
import type { FunnelStage } from "@/lib/domain/enums";
import { parseDateInput } from "@/lib/format";

type Result = { ok: true; count: number } | { ok: false; error: string };

async function loadCampaign(campaignId: string) {
  return db.campaign.findUnique({
    where: { id: campaignId },
    include: { channels: { orderBy: { sortOrder: "asc" }, include: { assets: { orderBy: { sortOrder: "asc" } } } } },
  });
}

export async function saveReversePlan(campaignId: string, plan: unknown): Promise<Result> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, error: auth.error };
  const parsed = reversePlanSchema.safeParse(plan);
  if (!parsed.success) return { ok: false, error: "Please check the plan: the goal must be a positive number." };
  const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { slug: true } });
  if (!campaign) return { ok: false, error: "Campaign not found." };

  await db.$transaction(async (tx) => {
    await tx.campaign.update({
      where: { id: campaignId },
      data: { reversePlan: parsed.data as Prisma.InputJsonValue },
    });
    await tx.activityLog.create({
      data: {
        campaignId,
        entityType: "campaign",
        entityId: campaignId,
        action: "reverse_plan_saved",
        details: { goalType: parsed.data.goalType, goalValue: parsed.data.goalValue },
        userId: auth.user.id,
      },
    });
  });
  revalidatePath(`/campaigns/${campaign.slug}`, "layout");
  return { ok: true, count: 0 };
}

/** Saves the plan and writes its KPI targets into the channels (other targets stay). */
export async function applyReversePlan(campaignId: string, plan: unknown): Promise<Result> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, error: auth.error };
  const parsed = reversePlanSchema.safeParse(plan);
  if (!parsed.success) return { ok: false, error: "Please check the plan: the goal must be a positive number." };
  const campaign = await loadCampaign(campaignId);
  if (!campaign) return { ok: false, error: "Campaign not found." };

  const { benchmarks } = await getPlanningMasterData();
  const benchmarkByType = new Map(benchmarks.map((b) => [b.channelTypeId, b]));
  const planChannels: PlanChannel[] = campaign.channels.map((c) => ({
    id: c.id,
    name: c.name,
    stage: c.funnelStage as FunnelStage,
    benchmark: benchmarkByType.get(c.channelTypeId)?.values ?? EMPTY_BENCHMARK,
    extraKpis: benchmarkByType.get(c.channelTypeId)?.extraKpis ?? [],
  }));
  const result = computeReversePlan(planChannels, parsed.data);
  const updates = result.channels
    .map((planned) => {
      const channel = campaign.channels.find((c) => c.id === planned.id)!;
      const before = parseKpiTargets(channel.kpiTargets);
      const after = mergeTargets(before, planned.kpis);
      return { channel, before, after };
    })
    .filter(({ before, after }) => JSON.stringify(before) !== JSON.stringify(after));

  await db.$transaction(async (tx) => {
    await tx.campaign.update({
      where: { id: campaignId },
      data: { reversePlan: parsed.data as Prisma.InputJsonValue },
    });
    for (const { channel, before, after } of updates) {
      await tx.channel.update({ where: { id: channel.id }, data: { kpiTargets: after } });
      await tx.activityLog.create({
        data: {
          campaignId,
          entityType: "channel",
          entityId: channel.id,
          action: "updated",
          details: {
            name: channel.name,
            via: "reverse_planning",
            changes: diffFields({ kpiTargets: before }, { kpiTargets: after }) as unknown as Prisma.InputJsonValue,
          },
          userId: auth.user.id,
        },
      });
    }
  });
  revalidatePath("/");
  revalidatePath(`/campaigns/${campaign.slug}`, "layout");
  return { ok: true, count: updates.length };
}

/**
 * Sets the due dates of the given assets to the "ready by" date of the backward
 * schedule. A go-live date per asset (YYYY-MM-DD, "" = channel start) is saved too.
 */
export async function applyScheduleDueDates(
  campaignId: string,
  items: { id: string; goLiveDate: string }[],
  bufferDays: number,
): Promise<Result> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, error: auth.error };
  if (!Number.isInteger(bufferDays) || bufferDays < 0 || bufferDays > 60) {
    return { ok: false, error: "The buffer must be between 0 and 60 days." };
  }
  const campaign = await loadCampaign(campaignId);
  if (!campaign) return { ok: false, error: "Campaign not found." };
  const { leadTimes } = await getPlanningMasterData();

  const ownGoLive = new Map<string, Date | null>();
  for (const item of items) {
    const date = item.goLiveDate ? parseDateInput(item.goLiveDate) : null;
    if (item.goLiveDate && !date) return { ok: false, error: "Invalid go-live date." };
    ownGoLive.set(item.id, date);
  }
  const assets = campaign.channels.flatMap((c) =>
    c.assets
      .filter((a) => ownGoLive.has(a.id))
      .map((a) => {
        const own = ownGoLive.get(a.id) ?? null;
        return {
          id: a.id,
          title: a.title,
          assetType: a.assetType,
          status: a.status,
          dueDate: a.dueDate,
          channelId: c.id,
          channelName: c.name,
          goLive: own ?? c.startDate ?? campaign.startDate,
          goLiveSource: own ? ("asset" as const) : c.startDate ? ("channel" as const) : ("campaign" as const),
          before: a.goLiveDate,
          own,
        };
      }),
  );
  const sameDay = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
  const rows = backwardSchedule(assets, leadTimes, bufferDays, new Date())
    .map((row, i) => ({ ...row, before: assets[i].before, own: assets[i].own }))
    .filter((r) => r.changed || !sameDay(r.before, r.own));

  await db.$transaction(async (tx) => {
    for (const row of rows) {
      await tx.asset.update({ where: { id: row.id }, data: { dueDate: row.readyBy, goLiveDate: row.own } });
      await tx.activityLog.create({
        data: {
          campaignId,
          entityType: "asset",
          entityId: row.id,
          action: "updated",
          details: {
            title: row.title,
            via: "backward_schedule",
            changes: diffFields(
              { dueDate: row.dueDate, goLiveDate: row.before },
              { dueDate: row.readyBy, goLiveDate: row.own },
            ) as unknown as Prisma.InputJsonValue,
          },
          userId: auth.user.id,
        },
      });
    }
  });
  revalidatePath("/");
  revalidatePath(`/campaigns/${campaign.slug}`, "layout");
  return { ok: true, count: rows.length };
}
