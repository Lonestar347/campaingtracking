import { notFound } from "next/navigation";
import { can, getCurrentUser } from "@/lib/auth";
import { getCampaignBySlug, getCharterFormOptions } from "@/lib/queries";
import { CampaignMindmap } from "@/components/mindmap/campaign-mindmap";
import type { Selection } from "@/components/mindmap/detail-panel";

// Core view: interactive campaign mindmap. Deep links: ?asset=<id> or ?kanal=<id>.
export default async function CampaignMindmapPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ asset?: string; kanal?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const [campaign, options, user] = await Promise.all([
    getCampaignBySlug(slug),
    getCharterFormOptions(),
    getCurrentUser(),
  ]);
  if (!campaign) notFound();

  const initialSelection: Selection | null = query.asset
    ? { kind: "asset", id: query.asset }
    : query.kanal
      ? { kind: "channel", id: query.kanal }
      : null;

  return (
    <CampaignMindmap
      key={campaign.id}
      campaign={campaign}
      options={options}
      canEdit={!!user && can(user.role, "write")}
      initialSelection={initialSelection}
    />
  );
}
