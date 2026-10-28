import Link from "next/link";
import { getActivityNames, getRecentActivity } from "@/lib/queries";
import { describeActivity, type ActivityContext } from "@/lib/activity";
import { ActivityLine, targetHref } from "@/components/team/activity-items";

/** Latest changes across all campaigns. */
export async function RecentActivity() {
  const [entries, names] = await Promise.all([getRecentActivity(8), getActivityNames()]);
  const context: ActivityContext = {
    channels: new Map(names.channels),
    assets: new Map(names.assets),
    users: new Map(names.users),
  };
  const now = new Date();

  return (
    <section aria-labelledby="recent-title" className="rounded-xl border bg-card">
      <h2 id="recent-title" className="border-b px-4 py-3 font-semibold">
        Recent activity
      </h2>
      {entries.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ol className="space-y-3 p-4">
          {entries.map((entry) => {
            const slug = entry.campaign?.slug ?? "";
            const described = describeActivity(entry, { ...context, campaignName: entry.campaign?.name });
            return (
              <li key={entry.id} className="space-y-0.5">
                {entry.campaign && (
                  <Link
                    href={`/campaigns/${slug}/activity`}
                    className="block truncate text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {entry.campaign.name}
                  </Link>
                )}
                <ActivityLine entry={entry} context={context} now={now} href={targetHref(slug, described.target)} compact />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
