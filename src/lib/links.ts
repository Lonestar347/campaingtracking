// Links to external tools (Frontify, SharePoint, Looker Studio): type
// detection, validation, and Looker Studio embed URLs. Pure functions.

import { z } from "zod";
import { LINK_TYPES, type LinkType } from "@/lib/domain/enums";
import { optionalText, urlField, type FieldErrors, toFieldErrors } from "@/lib/validation/fields";

export const LINK_TYPE_LABELS: Record<LinkType, string> = {
  frontify: "Frontify",
  sharepoint: "SharePoint",
  looker_studio: "Looker Studio",
  other: "Link",
};

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const matchesHost = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Guesses the link type from the URL's host. */
export function detectLinkType(url: string): LinkType {
  const host = hostOf(url.trim());
  if (!host) return "other";
  if (matchesHost(host, "frontify.com")) return "frontify";
  if (matchesHost(host, "sharepoint.com") || matchesHost(host, "sharepoint.de")) return "sharepoint";
  if (host === "lookerstudio.google.com" || host === "datastudio.google.com") return "looker_studio";
  return "other";
}

/** Short, readable form of a URL for lists, e.g. "example.frontify.com/…/autumn". */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const path = parts.length > 1 ? `/…/${parts[parts.length - 1]}` : parts.length === 1 ? `/${parts[0]}` : "";
    return `${u.hostname}${path}`;
  } catch {
    return url;
  }
}

/**
 * Looker Studio report URL -> embed URL.
 * https://lookerstudio.google.com/reporting/<id>/page/<page> -> https://lookerstudio.google.com/embed/reporting/<id>/page/<page>
 * Also accepts the legacy datastudio.google.com host and /u/0/ prefixes.
 * Returns null if the URL is not a Looker Studio report.
 */
export function toLookerEmbedUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (detectLinkType(u.toString()) !== "looker_studio") return null;
  const match = /^(?:\/u\/\d+)?\/(?:embed\/)?reporting\/([^/]+)(\/page\/[^/?#]+)?/.exec(u.pathname);
  if (!match) return null;
  const [, reportId, page = ""] = match;
  return `https://lookerstudio.google.com/embed/reporting/${reportId}${page}${u.search}`;
}

// ---------------------------------------------------------------------------
// Form

export interface LinkFormValues {
  url: string;
  type: string;
  label: string;
  thumbnailUrl: string;
  embed: boolean;
}

export const emptyLinkForm = (): LinkFormValues => ({ url: "", type: "", label: "", thumbnailUrl: "", embed: false });

export const linkFormSchema = z
  .object({
    url: z.string().trim().min(1, "Enter a URL").pipe(urlField),
    type: z.string().transform((v) => v || undefined),
    label: optionalText.pipe(z.string().max(120, "Maximum 120 characters").optional()),
    thumbnailUrl: urlField,
    embed: z.boolean(),
  })
  .transform((v, ctx) => {
    const type = (v.type ?? detectLinkType(v.url ?? "")) as LinkType;
    if (!(LINK_TYPES as readonly string[]).includes(type)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["type"], message: "Unknown link type" });
    }
    const embed = v.embed && type === "looker_studio";
    if (embed && v.url && !toLookerEmbedUrl(v.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["embed"],
        message: "Only report links (…/reporting/…) can be embedded",
      });
    }
    return { url: v.url!, type, label: v.label ?? null, thumbnailUrl: v.thumbnailUrl ?? null, embed };
  });

export type LinkInput = z.output<typeof linkFormSchema>;

export function validateLinkForm(
  values: LinkFormValues,
): { success: true; data: LinkInput } | { success: false; errors: FieldErrors } {
  const result = linkFormSchema.safeParse(values);
  return result.success ? { success: true, data: result.data } : { success: false, errors: toFieldErrors(result.error) };
}

export function linkFormFromRecord(link: {
  url: string;
  type: string;
  label: string | null;
  thumbnailUrl: string | null;
  embed: boolean;
}): LinkFormValues {
  return {
    url: link.url,
    type: link.type,
    label: link.label ?? "",
    thumbnailUrl: link.thumbnailUrl ?? "",
    embed: link.embed,
  };
}
