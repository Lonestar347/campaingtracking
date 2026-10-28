"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { slugify } from "@/lib/format";
import {
  validateCharterForm,
  type CharterFormValues,
  type CharterInput,
  type FieldErrors,
} from "@/lib/charter/form";
import {
  buildCampaignPlan,
  campaignFieldsFromCharter,
  changedCharterSections,
  charterDataFromInput,
  diffCharterLinks,
} from "@/lib/charter/plan";
import { launchCharterDataSchema } from "@/lib/validation";
import { toLookerEmbedUrl } from "@/lib/links";

export type CharterActionResult =
  | { ok: true; slug: string; message?: string }
  | { ok: false; fieldErrors?: FieldErrors; formError?: string };

/** Checks that referenced users and channel types exist. */
async function checkReferences(input: CharterInput): Promise<FieldErrors> {
  const userIds = new Set([
    input.basis.ownerId,
    ...input.channels.flatMap((c) => [c.ownerId, ...c.assets.map((a) => a.ownerId)]),
  ].filter((id): id is string => !!id));
  const typeIds = new Set(input.channels.map((c) => c.channelTypeId));

  const [users, types] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true } }),
    db.channelType.findMany({ where: { id: { in: [...typeIds] } }, select: { id: true } }),
  ]);
  const knownUsers = new Set(users.map((u) => u.id));
  const knownTypes = new Set(types.map((t) => t.id));

  const errors: FieldErrors = {};
  if (!knownUsers.has(input.basis.ownerId)) errors["basis.ownerId"] = "Unknown owner";
  input.channels.forEach((channel, ci) => {
    if (!knownTypes.has(channel.channelTypeId)) errors[`channels.${ci}.channelTypeId`] = "Unknown channel type";
    if (channel.ownerId && !knownUsers.has(channel.ownerId)) errors[`channels.${ci}.ownerId`] = "Unknown person";
    channel.assets.forEach((asset, ai) => {
      if (asset.ownerId && !knownUsers.has(asset.ownerId)) {
        errors[`channels.${ci}.assets.${ai}.ownerId`] = "Unknown person";
      }
    });
  });
  return errors;
}

async function uniqueSlug(name: string, tx: Prisma.TransactionClient): Promise<string> {
  const base = slugify(name) || "campaign";
  let slug = base;
  for (let n = 2; await tx.campaign.findUnique({ where: { slug }, select: { id: true } }); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
}

export async function createCampaignFromCharter(values: CharterFormValues): Promise<CharterActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };

  const result = validateCharterForm(values);
  if (!result.success) return { ok: false, fieldErrors: result.errors };

  const referenceErrors = await checkReferences(result.data);
  if (Object.keys(referenceErrors).length > 0) return { ok: false, fieldErrors: referenceErrors };

  const plan = buildCampaignPlan(result.data);
  const userId = auth.user.id;

  const slug = await db.$transaction(async (tx) => {
    const campaign = await tx.campaign.create({
      data: {
        ...plan.campaign,
        slug: await uniqueSlug(plan.campaign.name, tx),
        charter: {
          create: {
            currentVersion: 1,
            data: plan.charterData,
            versions: {
              create: { version: 1, data: plan.charterData, createdById: userId, changeNote: "Initial version" },
            },
          },
        },
        links: { create: plan.links },
      },
    });

    for (const { assets, ...channel } of plan.channels) {
      await tx.channel.create({
        data: { ...channel, campaignId: campaign.id, assets: { create: assets } },
      });
    }

    await tx.activityLog.create({
      data: {
        entityType: "campaign",
        entityId: campaign.id,
        action: "created",
        details: {
          via: "launch_charter",
          channels: plan.channels.length,
          assets: plan.channels.reduce((sum, c) => sum + c.assets.length, 0),
        },
        userId,
      },
    });
    return campaign.slug;
  });

  revalidatePath("/");
  return { ok: true, slug };
}

export async function updateCharter(slug: string, values: CharterFormValues): Promise<CharterActionResult> {
  const auth = await requirePermission("write");
  if (!auth.user) return { ok: false, formError: auth.error };

  // Channels and assets are not edited via the charter.
  const result = validateCharterForm({ ...values, channels: [] });
  if (!result.success) return { ok: false, fieldErrors: result.errors };

  const referenceErrors = await checkReferences(result.data);
  if (Object.keys(referenceErrors).length > 0) return { ok: false, fieldErrors: referenceErrors };

  const campaign = await db.campaign.findUnique({ where: { slug }, include: { charter: true } });
  if (!campaign) return { ok: false, formError: "Campaign not found." };

  const next = charterDataFromInput(result.data);
  const previousParsed = launchCharterDataSchema.safeParse(campaign.charter?.data ?? {});
  const previous = previousParsed.success ? previousParsed.data : null;
  const changed = previous ? changedCharterSections(previous, next) : ["Charter"];
  if (changed.length === 0) return { ok: true, slug, message: "No changes." };

  const userId = auth.user.id;
  const version = (campaign.charter?.currentVersion ?? 0) + 1;
  const changeNote = result.data.changeNote ?? null;

  await db.$transaction(async (tx) => {
    await tx.campaign.update({ where: { id: campaign.id }, data: campaignFieldsFromCharter(result.data) });

    const charter = await tx.launchCharter.upsert({
      where: { campaignId: campaign.id },
      create: {
        campaignId: campaign.id,
        currentVersion: version,
        data: next,
        versions: { create: { version, data: next, createdById: userId, changeNote } },
      },
      update: {
        currentVersion: version,
        data: next,
        versions: { create: { version, data: next, createdById: userId, changeNote } },
      },
    });

    for (const change of diffCharterLinks(previous?.links ?? {}, result.data.links)) {
      if (change.remove) {
        await tx.link.deleteMany({ where: { campaignId: campaign.id, type: change.type, url: change.remove } });
      }
      if (change.add) {
        await tx.link.create({
          data: {
            campaignId: campaign.id,
            type: change.type,
            url: change.add,
            label: change.label,
            embed: change.type === "looker_studio" && toLookerEmbedUrl(change.add) != null,
          },
        });
      }
    }

    await tx.activityLog.create({
      data: {
        entityType: "charter",
        entityId: charter.id,
        action: "charter_updated",
        details: { version, sections: changed, changeNote },
        userId,
      },
    });
  });

  revalidatePath("/");
  revalidatePath(`/campaigns/${slug}`, "layout");
  return { ok: true, slug };
}
