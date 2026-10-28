"use server";

// Comments on campaigns, channels and assets. Everyone may comment; authors
// edit/delete their own comments, admins may delete any comment.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can, requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

export type CommentTarget = { entityType: "campaign" | "channel" | "asset"; entityId: string };

export type CommentActionResult = { ok: true; id: string } | { ok: false; error: string };

const bodySchema = z
  .string()
  .trim()
  .min(1, "Write a comment first.")
  .max(2000, "Comments can be at most 2,000 characters.");

/** Campaign id and slug of the commented object, or null if it does not exist. */
async function resolveCampaign(target: CommentTarget): Promise<{ campaignId: string; slug: string } | null> {
  if (target.entityType === "campaign") {
    const c = await db.campaign.findUnique({ where: { id: target.entityId }, select: { id: true, slug: true } });
    return c && { campaignId: c.id, slug: c.slug };
  }
  if (target.entityType === "channel") {
    const c = await db.channel.findUnique({ where: { id: target.entityId }, select: { campaign: { select: { id: true, slug: true } } } });
    return c && { campaignId: c.campaign.id, slug: c.campaign.slug };
  }
  const a = await db.asset.findUnique({
    where: { id: target.entityId },
    select: { channel: { select: { campaign: { select: { id: true, slug: true } } } } },
  });
  return a && { campaignId: a.channel.campaign.id, slug: a.channel.campaign.slug };
}

function revalidateCampaign(slug: string) {
  revalidatePath("/");
  revalidatePath(`/campaigns/${slug}`, "layout");
}

export async function addComment(target: CommentTarget, body: string): Promise<CommentActionResult> {
  const auth = await requirePermission("comment");
  if (!auth.user) return { ok: false, error: auth.error };
  if (!["campaign", "channel", "asset"].includes(target.entityType)) return { ok: false, error: "Unknown item." };

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const owner = await resolveCampaign(target);
  if (!owner) return { ok: false, error: "Item not found." };

  const comment = await db.comment.create({
    data: {
      entityType: target.entityType,
      entityId: target.entityId,
      campaignId: owner.campaignId,
      authorId: auth.user.id,
      body: parsed.data,
    },
  });
  revalidateCampaign(owner.slug);
  return { ok: true, id: comment.id };
}

export async function updateComment(commentId: string, body: string): Promise<CommentActionResult> {
  const auth = await requirePermission("comment");
  if (!auth.user) return { ok: false, error: auth.error };

  const comment = await db.comment.findUnique({ where: { id: commentId }, include: { campaign: { select: { slug: true } } } });
  if (!comment) return { ok: false, error: "Comment not found." };
  if (comment.authorId !== auth.user.id) return { ok: false, error: "You can only edit your own comments." };

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await db.comment.update({ where: { id: commentId }, data: { body: parsed.data } });
  if (comment.campaign) revalidateCampaign(comment.campaign.slug);
  return { ok: true, id: commentId };
}

export async function deleteComment(commentId: string): Promise<CommentActionResult> {
  const auth = await requirePermission("comment");
  if (!auth.user) return { ok: false, error: auth.error };

  const comment = await db.comment.findUnique({ where: { id: commentId }, include: { campaign: { select: { slug: true } } } });
  if (!comment) return { ok: false, error: "Comment not found." };
  if (comment.authorId !== auth.user.id && !can(auth.user.role, "manage")) {
    return { ok: false, error: "You can only delete your own comments." };
  }

  await db.comment.delete({ where: { id: commentId } });
  if (comment.campaign) revalidateCampaign(comment.campaign.slug);
  return { ok: true, id: commentId };
}
