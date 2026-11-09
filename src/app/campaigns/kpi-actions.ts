"use server";

// Choice of the headline KPIs shown at the top of the performance tab.

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { HEADLINE_COUNT } from "@/lib/kpi";

export async function saveHeadlineKpis(
  campaignId: string,
  names: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, error: auth.error };
  const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { slug: true } });
  if (!campaign) return { ok: false, error: "Campaign not found." };

  const cleaned = [...new Set(names.map((n) => (typeof n === "string" ? n.trim() : "")).filter(Boolean))];
  if (cleaned.length > HEADLINE_COUNT) return { ok: false, error: `Choose up to ${HEADLINE_COUNT} KPIs.` };
  if (cleaned.some((n) => n.length > 120)) return { ok: false, error: "KPI names are limited to 120 characters." };

  await db.$transaction(async (tx) => {
    await tx.campaign.update({
      where: { id: campaignId },
      // An empty choice means "automatic".
      data: { headlineKpis: cleaned.length > 0 ? cleaned : Prisma.DbNull },
    });
    await tx.activityLog.create({
      data: {
        campaignId,
        entityType: "campaign",
        entityId: campaignId,
        action: "headline_kpis_changed",
        details: { kpis: cleaned },
        userId: auth.user.id,
      },
    });
  });
  revalidatePath(`/campaigns/${campaign.slug}`, "layout");
  return { ok: true };
}
