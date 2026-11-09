import { getTimelineCampaigns } from "@/lib/queries";
import { buildYearTimeline, timelineYears } from "@/lib/gantt/year";
import { rollupCampaign } from "@/lib/status";
import { YearTimelineView } from "@/components/timeline/year-timeline";

export const metadata = { title: "Timeline · Campaign Tracker" };
export const dynamic = "force-dynamic";

// All campaigns of a year as a Gantt chart (?year=2026); campaigns expand to their channels.
export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const params = await searchParams;
  const now = new Date();
  const campaigns = await getTimelineCampaigns();
  const years = timelineYears(campaigns, now);
  const requested = Number(params.year);
  const year = Number.isInteger(requested) && requested > 1990 && requested < 2200 ? requested : now.getUTCFullYear();
  const timeline = buildYearTimeline(campaigns, year, now);
  const status = Object.fromEntries(
    campaigns.map((c) => {
      const rollup = rollupCampaign(c, now);
      return [
        c.id,
        { light: rollup.campaign.trafficLight, phase: rollup.campaign.phase, progress: rollup.campaign.progress },
      ];
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Timeline</h1>
        <p className="mt-1 text-base text-muted-foreground">
          All campaigns of the year. Expand a campaign to see its channels and asset deadlines.
        </p>
      </div>
      <YearTimelineView timeline={timeline} years={years} status={status} />
    </div>
  );
}
