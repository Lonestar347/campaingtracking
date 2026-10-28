// Activity log and comments for display: human-readable descriptions of log
// entries, relative times and a day-grouped timeline. Pure functions.

import { statusConfig } from "@/lib/config";
import { formatDate, toDayNumber } from "@/lib/dates";
import {
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  FUNNEL_STAGE_LABELS,
  LINK_TYPES,
  type AssetStatus,
  type AssetType,
  type FunnelStage,
} from "@/lib/domain/enums";
import { LINK_TYPE_LABELS } from "@/lib/links";

export interface ActivityEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  details: unknown;
  createdAt: Date;
  user: { name: string } | null;
}

export interface CommentEntry {
  id: string;
  entityType: string;
  entityId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: { id: string; name: string };
}

/** Names of current objects; deleted objects fall back to names stored in the entry details. */
export interface ActivityContext {
  campaignName?: string;
  channels: ReadonlyMap<string, string>;
  assets: ReadonlyMap<string, string>;
  users: ReadonlyMap<string, string>;
}

/** Object an entry refers to, for linking into the mind map. */
export interface ActivityTarget {
  kind: "campaign" | "channel" | "asset" | "creative";
  id: string;
}

export interface DescribedActivity {
  actor: string;
  text: string;
  target: ActivityTarget | null;
  /** Optional quote, e.g. a charter change note. */
  note?: string;
}

type Details = Record<string, unknown>;

const asDetails = (value: unknown): Details =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Details) : {};
const str = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);
const quote = (name: string | undefined, fallback: string) => (name ? `“${name}”` : fallback);

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  name: "name",
  assetType: "type",
  format: "format",
  status: "status",
  dueDate: "due date",
  ownerId: "owner",
  approverId: "approver",
  notes: "notes",
  funnelStage: "funnel stage",
  startDate: "start",
  endDate: "end",
  kpiTargets: "KPI targets",
  channelId: "channel",
  kpiValues: "KPI values",
};

/** Fields whose values are not shown in the summary (long or structured). */
const VALUELESS_FIELDS = new Set(["notes", "kpiTargets", "kpiValues"]);

function formatValue(field: string, value: unknown, ctx: ActivityContext): string {
  if (value == null || value === "") return "none";
  if (field === "ownerId" || field === "approverId") return ctx.users.get(String(value)) ?? "unknown person";
  if (field === "channelId") return ctx.channels.get(String(value)) ?? "a deleted channel";
  if (field === "status") return ASSET_STATUS_LABELS[value as AssetStatus] ?? String(value);
  if (field === "assetType") return ASSET_TYPE_LABELS[value as AssetType] ?? String(value);
  if (field === "funnelStage") return FUNNEL_STAGE_LABELS[value as FunnelStage] ?? String(value);
  if ((field === "dueDate" || field === "startDate" || field === "endDate") && typeof value === "string") {
    return formatDate(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  }
  return String(value);
}

/** "owner → Anna Sample, due date → 05/11/2026, notes" */
export function describeChanges(changes: unknown, ctx: ActivityContext): string {
  if (!Array.isArray(changes)) return "";
  return changes
    .map((c) => asDetails(c))
    .filter((c) => typeof c.field === "string" && c.field !== "channelTypeId")
    .map((c) => {
      const field = c.field as string;
      const label = FIELD_LABELS[field] ?? field;
      return VALUELESS_FIELDS.has(field) ? label : `${label} → ${formatValue(field, c.to, ctx)}`;
    })
    .join(", ");
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function linkTypeLabel(type: unknown): string {
  return type !== "other" && (LINK_TYPES as readonly string[]).includes(String(type))
    ? LINK_TYPE_LABELS[type as keyof typeof LINK_TYPE_LABELS]
    : "a";
}

export function describeActivity(entry: ActivityEntry, ctx: ActivityContext): DescribedActivity {
  const d = asDetails(entry.details);
  const actor = entry.user?.name ?? "Someone";
  const { entityType, entityId, action } = entry;

  const assetName = ctx.assets.get(entityId) ?? str(d.title);
  const channelName = ctx.channels.get(entityId) ?? str(d.name);
  const exists = (entityType === "asset" && ctx.assets.has(entityId)) || (entityType === "channel" && ctx.channels.has(entityId));
  const target: ActivityTarget | null =
    entityType === "campaign" || entityType === "charter"
      ? { kind: "campaign", id: entityId }
      : entityType === "creative"
        ? action === "deleted"
          ? null
          : { kind: "creative", id: entityId }
        : exists
          ? { kind: entityType as "asset" | "channel", id: entityId }
          : null;
  const objectName =
    entityType === "asset"
      ? quote(assetName, "an asset")
      : entityType === "channel"
        ? quote(channelName, "a channel")
        : entityType === "creative"
          ? quote(str(d.title), "a creative")
          : "the campaign";

  const result = (text: string, note?: string): DescribedActivity => ({ actor, text, target, note });

  if (action.startsWith("link_")) {
    const kind = linkTypeLabel(d.type);
    const article = kind === "a" ? "a" : /^[aeiou]/i.test(kind) ? "an" : "a";
    const linkText = kind === "a" ? "a link" : `${article} ${kind} link`;
    if (action === "link_added") return result(`added ${linkText} to ${objectName}`);
    if (action === "link_removed") return result(`removed ${linkText} from ${objectName}`);
    return result(`updated ${linkText} on ${objectName}`);
  }

  switch (`${entityType}:${action}`) {
    case "campaign:created": {
      const channels = typeof d.channels === "number" ? d.channels : null;
      const assets = typeof d.assets === "number" ? d.assets : null;
      const extra = channels != null && assets != null ? ` (${plural(channels, "channel")}, ${plural(assets, "asset")})` : "";
      return result(`created the campaign via the launch charter${extra}`);
    }
    case "charter:charter_updated": {
      const sections = Array.isArray(d.sections) ? d.sections.filter((s) => typeof s === "string").join(", ") : "";
      const version = typeof d.version === "number" ? ` version ${d.version}` : " a new version";
      return result(`saved launch charter${version}${sections ? ` (${sections})` : ""}`, str(d.changeNote));
    }
    case "channel:created": {
      const stage = FUNNEL_STAGE_LABELS[d.funnelStage as FunnelStage];
      return result(`created channel ${objectName}${stage ? ` in ${stage}` : ""}`);
    }
    case "channel:updated": {
      const changes = Array.isArray(d.changes) ? d.changes.map(asDetails) : [];
      const move = changes.find((c) => c.field === "funnelStage");
      if (move && changes.length === 1) {
        return result(
          `moved channel ${objectName} from ${formatValue("funnelStage", move.from, ctx)} to ${formatValue("funnelStage", move.to, ctx)}`,
        );
      }
      return result(`updated channel ${objectName}: ${describeChanges(d.changes, ctx)}`);
    }
    case "channel:deleted": {
      const assets = typeof d.assets === "number" && d.assets > 0 ? ` and ${plural(d.assets, "asset")}` : "";
      return result(`deleted channel ${objectName}${assets}`);
    }
    case "asset:created":
      return result(`added asset ${objectName}`);
    case "asset:status_changed":
      return result(
        `changed the status of ${objectName} from ${formatValue("status", d.from, ctx)} to ${formatValue("status", d.to, ctx)}`,
      );
    case "asset:updated":
      return result(`updated asset ${objectName}: ${describeChanges(d.changes, ctx)}`);
    case "asset:deleted":
      return result(`deleted asset ${objectName}`);
    case "creative:created":
      return result(`added creative ${objectName}`);
    case "creative:updated":
      return result(`updated creative ${objectName}: ${describeChanges(d.changes, ctx)}`);
    case "creative:image_uploaded":
      return result(`uploaded a new image for ${objectName}`);
    case "creative:image_removed":
      return result(`removed the image of ${objectName}`);
    case "creative:cover_set":
      return result(`made ${objectName} the campaign image`);
    case "creative:deleted":
      return result(`deleted creative ${objectName}`);
    case "kpi_report:imported": {
      const values = typeof d.values === "number" ? ` (${plural(d.values, "value")})` : "";
      return result(`imported report ${quote(str(d.fileName), "a report")}${str(d.source) ? ` from ${d.source}` : ""}${values}`);
    }
    case "kpi_report:deleted":
      return result(`deleted report ${quote(str(d.fileName), "a report")}${str(d.source) ? ` from ${d.source}` : ""}`);
    default:
      return result(`${action.replace(/_/g, " ")} ${objectName}`);
  }
}

// ---------------------------------------------------------------------------
// Times and timeline

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date. */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const days = toDayNumber(now, statusConfig.timeZone) - toDayNumber(date, statusConfig.timeZone);
  if (days === 0) return `${hours} h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return formatDate(date);
}

/** Absolute date and time for tooltips, e.g. "28/10/2026, 14:05". */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: statusConfig.timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export type TimelineItem =
  | { kind: "activity"; id: string; createdAt: Date; entry: ActivityEntry }
  | { kind: "comment"; id: string; createdAt: Date; comment: CommentEntry };

/** Activity entries and comments, newest first. */
export function mergeTimeline(entries: readonly ActivityEntry[], comments: readonly CommentEntry[]): TimelineItem[] {
  return [
    ...entries.map((entry): TimelineItem => ({ kind: "activity", id: `a:${entry.id}`, createdAt: entry.createdAt, entry })),
    ...comments.map((comment): TimelineItem => ({ kind: "comment", id: `c:${comment.id}`, createdAt: comment.createdAt, comment })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
}

/** Groups (already sorted) items by calendar day: "Today", "Yesterday", then the date. */
export function groupByDay<T extends { createdAt: Date }>(items: readonly T[], now: Date = new Date()): { label: string; items: T[] }[] {
  const today = toDayNumber(now, statusConfig.timeZone);
  const groups: { key: number; label: string; items: T[] }[] = [];
  for (const item of items) {
    const key = toDayNumber(item.createdAt, statusConfig.timeZone);
    let group = groups.find((g) => g.key === key);
    if (!group) {
      const label = key === today ? "Today" : key === today - 1 ? "Yesterday" : formatDate(item.createdAt);
      group = { key, label, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups.map(({ label, items }) => ({ label, items }));
}

/** Entries about one object (asset, channel, or the campaign incl. its charter and reports). */
export function entriesFor<T extends { entityType: string; entityId: string }>(
  items: readonly T[],
  kind: "campaign" | "channel" | "asset",
  id: string,
): T[] {
  if (kind === "campaign") {
    return items.filter((i) => i.entityType === "campaign" || i.entityType === "charter" || i.entityType === "kpi_report");
  }
  return items.filter((i) => i.entityType === kind && i.entityId === id);
}
