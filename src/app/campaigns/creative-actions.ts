"use server";

// Creatives of a campaign: create/update/delete, image upload and the campaign
// image (cover). Every change is written to the activity log.

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { checkImage, creativeDataFromInput, creativeFormSchema, type CreativeFormValues } from "@/lib/creatives";
import { diffFields, validate } from "@/lib/entities/forms";
import type { EntityActionResult } from "@/app/campaigns/entity-actions";

type SimpleResult = { ok: true } | { ok: false; error: string };

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

function revalidateCampaign(slug: string) {
  revalidatePath("/");
  revalidatePath(`/campaigns/${slug}`, "layout");
}

async function log(
  tx: Prisma.TransactionClient,
  entry: { campaignId: string; entityId: string; action: string; details: Prisma.InputJsonValue; userId: string },
) {
  await tx.activityLog.create({ data: { ...entry, entityType: "creative" } });
}

const loadCreative = (id: string) =>
  db.creative.findUnique({ where: { id }, include: { campaign: { select: { id: true, slug: true } } } });

/** Field errors if the channel does not belong to the campaign. */
async function checkChannel(campaignId: string, channelId: string | null | undefined) {
  if (!channelId) return null;
  const channel = await db.channel.findFirst({ where: { id: channelId, campaignId }, select: { id: true } });
  return channel ? null : { channelId: "Channel does not belong to this campaign" };
}

export async function createCreative(campaignId: string, values: CreativeFormValues): Promise<EntityActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };
  const result = validate(creativeFormSchema, values);
  if (!result.success) return { ok: false, fieldErrors: result.errors };

  const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { slug: true } });
  if (!campaign) return { ok: false, formError: "Campaign not found." };
  const channelError = await checkChannel(campaignId, result.data.channelId);
  if (channelError) return { ok: false, fieldErrors: channelError };

  const data = creativeDataFromInput(result.data);
  const id = await db.$transaction(async (tx) => {
    const last = await tx.creative.findFirst({ where: { campaignId }, orderBy: { sortOrder: "desc" } });
    const creative = await tx.creative.create({
      data: { ...data, campaignId, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    await log(tx, {
      campaignId,
      entityId: creative.id,
      action: "created",
      details: { title: creative.title },
      userId: auth.user.id,
    });
    return creative.id;
  });
  revalidateCampaign(campaign.slug);
  return { ok: true, id };
}

export async function updateCreative(id: string, values: CreativeFormValues): Promise<EntityActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };
  const result = validate(creativeFormSchema, values);
  if (!result.success) return { ok: false, fieldErrors: result.errors };

  const creative = await loadCreative(id);
  if (!creative) return { ok: false, formError: "Creative not found." };
  const channelError = await checkChannel(creative.campaignId, result.data.channelId);
  if (channelError) return { ok: false, fieldErrors: channelError };

  const data = creativeDataFromInput(result.data);
  const changes = diffFields(creative as unknown as Record<string, unknown>, data);
  if (changes.length > 0) {
    await db.$transaction(async (tx) => {
      await tx.creative.update({ where: { id }, data });
      await log(tx, {
        campaignId: creative.campaignId,
        entityId: id,
        action: "updated",
        details: { title: data.title, changes: changes as unknown as Prisma.InputJsonValue },
        userId: auth.user.id,
      });
    });
    revalidateCampaign(creative.campaign.slug);
  }
  return { ok: true, id };
}

export async function deleteCreative(id: string): Promise<SimpleResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, error: auth.error };
  const creative = await loadCreative(id);
  if (!creative) return { ok: false, error: "Creative not found." };

  await db.$transaction(async (tx) => {
    await tx.creative.delete({ where: { id } });
    await log(tx, {
      campaignId: creative.campaignId,
      entityId: id,
      action: "deleted",
      details: { title: creative.title },
      userId: auth.user.id,
    });
  });
  if (creative.imageKey) await storage.delete(creative.imageKey).catch(() => undefined);
  revalidateCampaign(creative.campaign.slug);
  return { ok: true };
}

export async function uploadCreativeImage(id: string, formData: FormData): Promise<SimpleResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, error: auth.error };
  const creative = await loadCreative(id);
  if (!creative) return { ok: false, error: "Creative not found." };

  const file = formData.get("image");
  if (!(file instanceof File)) return { ok: false, error: "Please select an image." };
  const data = Buffer.from(await file.arrayBuffer());
  const check = checkImage(data);
  if (!check.ok) return { ok: false, error: check.error };

  const key = await storage.put(data, `image.${EXTENSIONS[check.type]}`, `creatives/${creative.campaignId}`);
  await db.$transaction(async (tx) => {
    await tx.creative.update({ where: { id }, data: { imageKey: key, imageType: check.type } });
    await log(tx, {
      campaignId: creative.campaignId,
      entityId: id,
      action: "image_uploaded",
      details: { title: creative.title },
      userId: auth.user.id,
    });
  });
  if (creative.imageKey) await storage.delete(creative.imageKey).catch(() => undefined);
  revalidateCampaign(creative.campaign.slug);
  return { ok: true };
}

export async function removeCreativeImage(id: string): Promise<SimpleResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, error: auth.error };
  const creative = await loadCreative(id);
  if (!creative) return { ok: false, error: "Creative not found." };
  if (!creative.imageKey) return { ok: true };

  await db.$transaction(async (tx) => {
    await tx.creative.update({ where: { id }, data: { imageKey: null, imageType: null, isCover: false } });
    await log(tx, {
      campaignId: creative.campaignId,
      entityId: id,
      action: "image_removed",
      details: { title: creative.title },
      userId: auth.user.id,
    });
  });
  await storage.delete(creative.imageKey).catch(() => undefined);
  revalidateCampaign(creative.campaign.slug);
  return { ok: true };
}

/** Makes the creative the campaign image on the dashboard. */
export async function setCoverCreative(id: string): Promise<SimpleResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, error: auth.error };
  const creative = await loadCreative(id);
  if (!creative) return { ok: false, error: "Creative not found." };
  if (!creative.imageKey) return { ok: false, error: "Upload an image first." };

  await db.$transaction(async (tx) => {
    await tx.creative.updateMany({
      where: { campaignId: creative.campaignId, isCover: true },
      data: { isCover: false },
    });
    await tx.creative.update({ where: { id }, data: { isCover: true } });
    await log(tx, {
      campaignId: creative.campaignId,
      entityId: id,
      action: "cover_set",
      details: { title: creative.title },
      userId: auth.user.id,
    });
  });
  revalidateCampaign(creative.campaign.slug);
  return { ok: true };
}
