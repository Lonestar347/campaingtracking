import { notFound, redirect } from "next/navigation";
import { can, getCurrentUser } from "@/lib/auth";
import { getCampaignBySlug, getCharterFormOptions } from "@/lib/queries";
import { charterFormFromCampaign } from "@/lib/charter/edit";
import { CharterWizard } from "@/components/charter/charter-wizard";
import { updateCharter } from "@/app/kampagnen/actions";

export const metadata = { title: "Charter bearbeiten · Kampagnen-Tracker" };

export default async function EditCharterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user || !can(user.role, "write")) redirect(`/kampagnen/${slug}/charter`);

  const [campaign, options] = await Promise.all([getCampaignBySlug(slug), getCharterFormOptions()]);
  if (!campaign) notFound();

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Launch Charter bearbeiten</h2>
        <p className="text-sm text-muted-foreground">
          Aktuell Version {campaign.charter?.currentVersion ?? 0}. Kanäle und Assets werden in der Kampagne gepflegt.
        </p>
      </div>
      <CharterWizard
        mode="edit"
        options={options}
        initialValues={charterFormFromCampaign(campaign)}
        onSubmit={updateCharter.bind(null, slug)}
        successSuffix="/charter"
        cancelHref={`/kampagnen/${slug}/charter`}
      />
    </div>
  );
}
