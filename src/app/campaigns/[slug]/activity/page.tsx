import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { getCampaignActivity, getCampaignBySlug, getCampaignComments, getCharterFormOptions } from "@/lib/queries";
import { groupByDay, mergeTimeline, type ActivityContext, type TimelineItem } from "@/lib/activity";
import { TimelineRow } from "@/components/team/activity-items";

export const metadata = { title: "Activity · Campaign Tracker" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "changes", label: "Changes" },
  { id: "status", label: "Status changes" },
  { id: "comments", label: "Comments" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function matches(item: TimelineItem, filter: FilterId): boolean {
  if (filter === "all") return true;
  if (filter === "comments") return item.kind === "comment";
  if (item.kind !== "activity") return false;
  return filter === "status" ? item.entry.action === "status_changed" : true;
}

// Campaign timeline: activity log and comments, newest first, grouped by day.
export default async function CampaignActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ show?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const campaign = await getCampaignBySlug(slug);
  if (!campaign) notFound();
  const [activity, comments, options] = await Promise.all([
    getCampaignActivity(campaign.id),
    getCampaignComments(campaign.id),
    getCharterFormOptions(),
  ]);

  const filter: FilterId = FILTERS.some((f) => f.id === query.show) ? (query.show as FilterId) : "all";
  const context: ActivityContext = {
    campaignName: campaign.name,
    channels: new Map(campaign.channels.map((c) => [c.id, c.name])),
    assets: new Map(campaign.channels.flatMap((c) => c.assets.map((a) => [a.id, a.title] as [string, string]))),
    users: new Map(options.users.map((u) => [u.id, u.name])),
  };
  const targetName = (entityType: string, entityId: string) => {
    if (entityType === "campaign") return { name: "the campaign", href: `/campaigns/${slug}` };
    const name = entityType === "channel" ? context.channels.get(entityId) : context.assets.get(entityId);
    return name
      ? { name: `“${name}”`, href: `/campaigns/${slug}?${entityType}=${entityId}` }
      : { name: `a deleted ${entityType}`, href: null };
  };

  const now = new Date();
  const items = mergeTimeline(activity, comments).filter((item) => matches(item, filter));
  const groups = groupByDay(items, now);

  return (
    <div className="max-w-3xl space-y-5">
      <nav aria-label="Filter activity" className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={f.id === "all" ? `/campaigns/${slug}/activity` : `/campaigns/${slug}/activity?show=${f.id}`}
            aria-current={filter === f.id ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-sm transition-colors",
              filter === f.id ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {groups.length === 0 ? (
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
            <ol className="space-y-4 rounded-xl border bg-card p-4">
              {group.items.map((item) => (
                <li key={item.id}>
                  <TimelineRow item={item} context={context} now={now} slug={slug} targetName={targetName} />
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
