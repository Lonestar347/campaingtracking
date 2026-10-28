import { redirect } from "next/navigation";
import { can, getCurrentUser } from "@/lib/auth";
import { getCharterFormOptions } from "@/lib/queries";
import { CharterWizard } from "@/components/charter/charter-wizard";
import { createCampaignFromCharter } from "@/app/kampagnen/actions";

export const metadata = { title: "Neue Kampagne · Kampagnen-Tracker" };

// Users and channel types must be read per request, not at build time.
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "write")) redirect("/");
  const options = await getCharterFormOptions();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Neue Kampagne</h1>
        <p className="text-sm text-muted-foreground">
          Launch Charter ausfüllen – daraus entstehen Kampagne, Kanäle und Assets.
        </p>
      </div>
      <CharterWizard
        mode="create"
        options={options}
        defaultOwnerId={user.id}
        onSubmit={createCampaignFromCharter}
        cancelHref="/"
      />
    </div>
  );
}
