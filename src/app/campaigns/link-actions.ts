"use server";

// Create/update/delete links on campaigns, channels and assets. Changes are
// logged on the owning object.

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateLinkForm, type LinkFormValues } from "@/lib/links";
import type { EntityActionResult } from "@/app/campaigns/entity-actions";

export type LinkTarget = { campaignId: string } | { channelId: string } | { assetId: string };

/** Owning object of a link: its log entity and the campaign slug for revalidation. */
async function resolveOwner(
  target: { campaignId?: string | null; channelId?: string | null; assetId?: string | null },
): Promise<{ entityType: "campaign" | "channel" | "asset"; entityId: string; slug: string } | null> {
  if (target.campaignId) {
    const c = await db.campaign.findUnique({ where: { id: target.campaignId }, select: { slug: true } });
    return c && { entityType: "campaign", entityId: target.campaignId, slug: c.slug };
  }
  if (target.channelId) {
    const c = await db.channel.findUnique({
      where: { id: target.channelId },
      select: { campaign: { select: { slug: true } } },
    });
    return c && { entityType: "channel", entityId: target.channelId, slug: c.campaign.slug };
  }
  if (target.assetId) {
    const a = await db.asset.findUnique({
      where: { id: target.assetId },
      select: { channel: { select: { campaign: { select: { slug: true } } } } },
    });
    return a && { entityType: "asset", entityId: target.assetId, slug: a.channel.campaign.slug };
  }
  return null;
}

function revalidateCampaign(slug: string) {
  revalidatePath("/");
  revalidatePath(`/campaigns/${slug}`, "layout");
}

export async function createLink(target: LinkTarget, values: LinkFormValues): Promise<EntityActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };

  const result = validateLinkForm(values);
  if (!result.success) return { ok: false, fieldErrors: result.errors };

  const owner = await resolveOwner(target);
  if (!owner) return { ok: false, formError: "Item not found." };

  const id = await db.$transaction(async (tx) => {
    // Set exactly one owner foreign key, never fields passed through from the client.
    const ownerKey = { campaign: "campaignId", channel: "channelId", asset: "assetId" }[owner.entityType];
    const link = await tx.link.create({ data: { ...result.data, [ownerKey]: owner.entityId } });
    await tx.activityLog.create({
      data: {
        entityType: owner.entityType,
        entityId: owner.entityId,
        action: "link_added",
        details: { linkId: link.id, type: link.type, url: link.url },
        userId: auth.user.id,
      },
    });
    return link.id;
  });

  revalidateCampaign(owner.slug);
  return { ok: true, id };
}

export async function updateLink(linkId: string, values: LinkFormValues): Promise<EntityActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };

  const result = validateLinkForm(values);
  if (!result.success) return { ok: false, fieldErrors: result.errors };

  const link = await db.link.findUnique({ where: { id: linkId } });
  if (!link) return { ok: false, formError: "Link not found." };
  const owner = await resolveOwner(link);
  if (!owner) return { ok: false, formError: "Item not found." };

  await db.$transaction(async (tx) => {
    await tx.link.update({ where: { id: linkId }, data: result.data });
    await tx.activityLog.create({
      data: {
        entityType: owner.entityType,
        entityId: owner.entityId,
        action: "link_updated",
        details: {
          linkId,
          from: { type: link.type, url: link.url, label: link.label },
          to: { type: result.data.type, url: result.data.url, label: result.data.label },
        } as Prisma.InputJsonValue,
        userId: auth.user.id,
      },
    });
  });

  revalidateCampaign(owner.slug);
  return { ok: true, id: linkId };
}

export async function deleteLink(linkId: string): Promise<EntityActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };

  const link = await db.link.findUnique({ where: { id: linkId } });
  if (!link) return { ok: false, formError: "Link not found." };
  const owner = await resolveOwner(link);
  if (!owner) return { ok: false, formError: "Item not found." };

  await db.$transaction(async (tx) => {
    await tx.link.delete({ where: { id: linkId } });
    await tx.activityLog.create({
      data: {
        entityType: owner.entityType,
        entityId: owner.entityId,
        action: "link_removed",
        details: { linkId, type: link.type, url: link.url },
        userId: auth.user.id,
      },
    });
  });

  revalidateCampaign(owner.slug);
  return { ok: true, id: linkId };
}
