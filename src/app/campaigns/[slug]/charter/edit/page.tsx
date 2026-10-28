import { notFound, redirect } from "next/navigation";
import { can, getCurrentUser } from "@/lib/auth";
import { getCampaignBySlug, getCharterFormOptions } from "@/lib/queries";
import { charterFormFromCampaign } from "@/lib/charter/edit";
import { CharterWizard } from "@/components/charter/charter-wizard";
import { updateCharter } from "@/app/campaigns/actions";

export const metadata = { title: "Edit charter · Campaign Tracker" };

export default async function EditCharterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user || !can(user.role, "write")) redirect(`/campaigns/${slug}/charter`);

  const [campaign, options] = await Promise.all([getCampaignBySlug(slug), getCharterFormOptions()]);
  if (!campaign) notFound();

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Edit launch charter</h2>
        <p className="text-sm text-muted-foreground">
          Currently version {campaign.charter?.currentVersion ?? 0}. Channels and assets are managed in the campaign.
        </p>
      </div>
      <CharterWizard
        mode="edit"
        options={options}
        initialValues={charterFormFromCampaign(campaign)}
        onSubmit={updateCharter.bind(null, slug)}
        successSuffix="/charter"
        cancelHref={`/campaigns/${slug}/charter`}
      />
    </div>
  );
}
