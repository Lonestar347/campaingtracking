"use server";

// Create/update/delete channels and assets from the mindmap detail panel.
// Every change is written to the activity log.

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { ASSET_STATUSES, type AssetStatus } from "@/lib/domain/enums";
import {
  assetDataFromInput,
  assetEditSchema,
  channelDataFromInput,
  channelEditSchema,
  diffFields,
  validate,
  type AssetEditValues,
  type ChannelEditValues,
} from "@/lib/entities/forms";
import type { FieldErrors } from "@/lib/validation/fields";

export type EntityActionResult =
  | { ok: true; id: string }
  | { ok: false; fieldErrors?: FieldErrors; formError?: string };

const notFound = (what: string): EntityActionResult => ({ ok: false, formError: `${what} not found.` });

function revalidateCampaign(slug: string) {
  revalidatePath("/");
  revalidatePath(`/campaigns/${slug}`, "layout");
}

/** Checks that referenced users exist; returns field errors for unknown ids. */
async function checkUsers(fields: Record<string, string | null | undefined>): Promise<FieldErrors> {
  const ids = [...new Set(Object.values(fields).filter((v): v is string => !!v))];
  if (ids.length === 0) return {};
  const known = new Set((await db.user.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((u) => u.id));
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, id]) => id && !known.has(id))
      .map(([field]) => [field, "Unknown person"]),
  );
}

async function log(
  tx: Prisma.TransactionClient,
  entry: { entityType: "channel" | "asset"; entityId: string; action: string; details?: Prisma.InputJsonValue; userId: string },
) {
  await tx.activityLog.create({ data: entry });
}

// ---------------------------------------------------------------------------
// Channels

export async function createChannel(campaignId: string, values: ChannelEditValues): Promise<EntityActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };

  const result = validate(channelEditSchema, values);
  if (!result.success) return { ok: false, fieldErrors: result.errors };

  const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { slug: true } });
  if (!campaign) return notFound("Campaign");
  const type = await db.channelType.findUnique({ where: { id: result.data.channelTypeId }, select: { id: true } });
  if (!type) return { ok: false, fieldErrors: { channelTypeId: "Unknown channel type" } };
  const userErrors = await checkUsers({ ownerId: result.data.ownerId });
  if (Object.keys(userErrors).length > 0) return { ok: false, fieldErrors: userErrors };

  const data = channelDataFromInput(result.data);
  const id = await db.$transaction(async (tx) => {
    const last = await tx.channel.findFirst({ where: { campaignId }, orderBy: { sortOrder: "desc" } });
    const channel = await tx.channel.create({
      data: { ...data, campaignId, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    await log(tx, {
      entityType: "channel",
      entityId: channel.id,
      action: "created",
      details: { name: channel.name, funnelStage: channel.funnelStage },
      userId: auth.user.id,
    });
    return channel.id;
  });

  revalidateCampaign(campaign.slug);
  return { ok: true, id };
}

export async function updateChannel(channelId: string, values: ChannelEditValues): Promise<EntityActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };

  const result = validate(channelEditSchema, values);
  if (!result.success) return { ok: false, fieldErrors: result.errors };

  const channel = await db.channel.findUnique({ where: { id: channelId }, include: { campaign: { select: { slug: true } } } });
  if (!channel) return notFound("Channel");
  const userErrors = await checkUsers({ ownerId: result.data.ownerId });
  if (Object.keys(userErrors).length > 0) return { ok: false, fieldErrors: userErrors };

  // The channel type stays fixed after creation.
  const data = { ...channelDataFromInput(result.data), channelTypeId: channel.channelTypeId };
  const changes = diffFields(channel, data);
  if (changes.length > 0) {
    await db.$transaction(async (tx) => {
      await tx.channel.update({ where: { id: channelId }, data });
      await log(tx, {
        entityType: "channel",
        entityId: channelId,
        action: "updated",
        details: { changes } as unknown as Prisma.InputJsonValue,
        userId: auth.user.id,
      });
    });
  }

  revalidateCampaign(channel.campaign.slug);
  return { ok: true, id: channelId };
}

export async function deleteChannel(channelId: string): Promise<EntityActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };

  const channel = await db.channel.findUnique({
    where: { id: channelId },
    include: { campaign: { select: { id: true, slug: true } }, _count: { select: { assets: true } } },
  });
  if (!channel) return notFound("Channel");

  await db.$transaction(async (tx) => {
    await tx.channel.delete({ where: { id: channelId } });
    await log(tx, {
      entityType: "channel",
      entityId: channelId,
      action: "deleted",
      details: { name: channel.name, campaignId: channel.campaign.id, assets: channel._count.assets },
      userId: auth.user.id,
    });
  });

  revalidateCampaign(channel.campaign.slug);
  return { ok: true, id: channelId };
}

// ---------------------------------------------------------------------------
// Assets

export async function createAsset(channelId: string, values: AssetEditValues): Promise<EntityActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };

  const result = validate(assetEditSchema, values);
  if (!result.success) return { ok: false, fieldErrors: result.errors };

  const channel = await db.channel.findUnique({ where: { id: channelId }, include: { campaign: { select: { slug: true } } } });
  if (!channel) return notFound("Channel");
  const userErrors = await checkUsers({ ownerId: result.data.ownerId, approverId: result.data.approverId });
  if (Object.keys(userErrors).length > 0) return { ok: false, fieldErrors: userErrors };

  const id = await db.$transaction(async (tx) => {
    const last = await tx.asset.findFirst({ where: { channelId }, orderBy: { sortOrder: "desc" } });
    const asset = await tx.asset.create({
      data: { ...assetDataFromInput(result.data), channelId, sortOrder: (last?.sortOrder ?? -1) + 1 },
    });
    await log(tx, {
      entityType: "asset",
      entityId: asset.id,
      action: "created",
      details: { title: asset.title, status: asset.status },
      userId: auth.user.id,
    });
    return asset.id;
  });

  revalidateCampaign(channel.campaign.slug);
  return { ok: true, id };
}

async function applyAssetUpdate(
  assetId: string,
  update: (current: Prisma.AssetGetPayload<object>) => ReturnType<typeof assetDataFromInput> | Partial<ReturnType<typeof assetDataFromInput>>,
  userId: string,
): Promise<EntityActionResult> {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    include: { channel: { select: { campaign: { select: { slug: true } } } } },
  });
  if (!asset) return notFound("Asset");

  const data = update(asset);
  const changes = diffFields(asset, data);
  if (changes.length > 0) {
    const statusChange = changes.find((c) => c.field === "status");
    const otherChanges = changes.filter((c) => c.field !== "status");
    await db.$transaction(async (tx) => {
      await tx.asset.update({ where: { id: assetId }, data });
      if (statusChange) {
        await log(tx, {
          entityType: "asset",
          entityId: assetId,
          action: "status_changed",
          details: { from: statusChange.from, to: statusChange.to } as Prisma.InputJsonValue,
          userId,
        });
      }
      if (otherChanges.length > 0) {
        await log(tx, {
          entityType: "asset",
          entityId: assetId,
          action: "updated",
          details: { changes: otherChanges } as unknown as Prisma.InputJsonValue,
          userId,
        });
      }
    });
  }

  revalidateCampaign(asset.channel.campaign.slug);
  return { ok: true, id: assetId };
}

export async function updateAsset(assetId: string, values: AssetEditValues): Promise<EntityActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };

  const result = validate(assetEditSchema, values);
  if (!result.success) return { ok: false, fieldErrors: result.errors };
  const userErrors = await checkUsers({ ownerId: result.data.ownerId, approverId: result.data.approverId });
  if (Object.keys(userErrors).length > 0) return { ok: false, fieldErrors: userErrors };

  return applyAssetUpdate(assetId, () => assetDataFromInput(result.data), auth.user.id);
}

/** Quick status change (status buttons in the panel). */
export async function setAssetStatus(assetId: string, status: AssetStatus): Promise<EntityActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };
  if (!(ASSET_STATUSES as readonly string[]).includes(status)) return { ok: false, formError: "Unknown status." };

  return applyAssetUpdate(assetId, () => ({ status }), auth.user.id);
}

export async function deleteAsset(assetId: string): Promise<EntityActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };

  const asset = await db.asset.findUnique({
    where: { id: assetId },
    include: { channel: { select: { id: true, campaign: { select: { slug: true } } } } },
  });
  if (!asset) return notFound("Asset");

  await db.$transaction(async (tx) => {
    await tx.asset.delete({ where: { id: assetId } });
    await log(tx, {
      entityType: "asset",
      entityId: assetId,
      action: "deleted",
      details: { title: asset.title, channelId: asset.channel.id },
      userId: auth.user.id,
    });
  });

  revalidateCampaign(asset.channel.campaign.slug);
  return { ok: true, id: assetId };
}
