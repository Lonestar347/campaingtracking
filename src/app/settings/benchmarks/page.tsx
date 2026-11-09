import { redirect } from "next/navigation";
import { can, getCurrentUser } from "@/lib/auth";
import { getPlanningMasterData } from "@/lib/queries";
import { BenchmarkAdmin } from "@/components/settings/benchmark-admin";

export const metadata = { title: "Benchmarks · Campaign Tracker" };
export const dynamic = "force-dynamic";

// Benchmarks and lead times used by the reverse planning (Planning tab of a campaign).
export default async function BenchmarksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  const { benchmarks, leadTimes } = await getPlanningMasterData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Benchmarks</h1>
        <p className="text-base text-muted-foreground">
          Planning values for the reverse planning of campaigns. The starting values are rough assumptions – replace
          them with your own experience values. Each plan can override them.
        </p>
      </div>
      <BenchmarkAdmin
        canEdit={can(user.role, "manage")}
        benchmarks={benchmarks.filter((b) => b.active)}
        leadTimes={leadTimes}
      />
    </div>
  );
}
