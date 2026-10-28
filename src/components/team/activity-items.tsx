import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  describeActivity,
  formatDateTime,
  formatRelativeTime,
  type ActivityContext,
  type ActivityEntry,
  type ActivityTarget,
  type TimelineItem,
} from "@/lib/activity";
import { Avatar } from "@/components/team/avatar";

/** Mind map deep link for an activity target. */
export function targetHref(slug: string, target: ActivityTarget | null): string | null {
  if (!target) return null;
  if (target.kind === "campaign") return `/campaigns/${slug}`;
  return `/campaigns/${slug}?${target.kind}=${target.id}`;
}

function Time({ date, now }: { date: Date; now: Date }) {
  return (
    <time className="text-xs text-muted-foreground" dateTime={date.toISOString()} title={formatDateTime(date)} suppressHydrationWarning>
      {formatRelativeTime(date, now)}
    </time>
  );
}

/** One described log entry: "Ben Mock changed the status of … · 2 h ago". */
export function ActivityLine({
  entry,
  context,
  now,
  href,
  compact,
}: {
  entry: ActivityEntry;
  context: ActivityContext;
  now: Date;
  href?: string | null;
  compact?: boolean;
}) {
  const d = describeActivity(entry, context);
  const text = (
    <>
      <span className="font-semibold">{d.actor}</span> {d.text}
    </>
  );
  return (
    <div className={cn("flex gap-2.5", compact && "gap-2")}>
      {!compact && <Avatar name={d.actor} />}
      <div className="min-w-0 flex-1 text-sm">
        <p className="break-words">
          {href ? (
            <Link href={href} className="hover:underline">
              {text}
            </Link>
          ) : (
            text
          )}
        </p>
        {d.note && <p className="mt-0.5 text-xs italic text-muted-foreground">“{d.note}”</p>}
        <Time date={entry.createdAt} now={now} />
      </div>
    </div>
  );
}

/** Timeline item: a log entry or a comment (with the commented object's name). */
export function TimelineRow({
  item,
  context,
  now,
  slug,
  targetName,
}: {
  item: TimelineItem;
  context: ActivityContext;
  now: Date;
  slug: string;
  targetName: (entityType: string, entityId: string) => { name: string; href: string | null };
}) {
  if (item.kind === "activity") {
    const d = describeActivity(item.entry, context);
    return <ActivityLine entry={item.entry} context={context} now={now} href={targetHref(slug, d.target)} />;
  }
  const { comment } = item;
  const target = targetName(comment.entityType, comment.entityId);
  return (
    <div className="flex gap-2.5">
      <Avatar name={comment.author.name} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="break-words">
          <span className="font-semibold">{comment.author.name}</span> commented on{" "}
          {target.href ? (
            <Link href={target.href} className="font-medium hover:underline">
              {target.name}
            </Link>
          ) : (
            target.name
          )}
        </p>
        <blockquote className="mt-1 flex gap-2 rounded-md bg-muted px-2.5 py-1.5 text-sm">
          <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="whitespace-pre-line break-words">{comment.body}</span>
        </blockquote>
        <Time date={comment.createdAt} now={now} />
      </div>
    </div>
  );
}
