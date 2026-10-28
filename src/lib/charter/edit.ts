import { emptyCharterForm, type CharterFormValues } from "@/lib/charter/form";
import { formatGermanNumber, toDateInput } from "@/lib/format";
import { FUNNEL_STAGES } from "@/lib/domain/enums";
import { launchCharterDataSchema, parseStringList } from "@/lib/validation";

interface CampaignForEdit {
  name: string;
  description: string | null;
  brand: string | null;
  productLine: string | null;
  markets: unknown;
  startDate: Date;
  endDate: Date;
  ownerId: string;
  executionType: string;
  partners: unknown;
  budgetCents: number | null;
  charter: { data: unknown } | null;
}

const centsToInput = (cents: number | null | undefined) => (cents == null ? "" : formatGermanNumber(cents / 100));

/**
 * Pre-fills the wizard for editing an existing charter. Basis values come from
 * the campaign columns (source of truth), the rest from the charter document.
 * Channels and assets are not part of charter editing.
 */
export function charterFormFromCampaign(campaign: CampaignForEdit): CharterFormValues {
  const form = emptyCharterForm();
  const parsed = launchCharterDataSchema.safeParse(campaign.charter?.data ?? {});
  const data = parsed.success ? parsed.data : null;

  form.basis = {
    name: campaign.name,
    description: campaign.description ?? "",
    brand: campaign.brand ?? "",
    productLine: campaign.productLine ?? "",
    markets: parseStringList(campaign.markets),
    startDate: toDateInput(campaign.startDate),
    endDate: toDateInput(campaign.endDate),
    ownerId: campaign.ownerId,
    executionType: campaign.executionType,
    partners: parseStringList(campaign.partners).join("\n"),
  };

  if (!data) {
    form.budget.total = centsToInput(campaign.budgetCents);
    return form;
  }

  form.strategy = {
    objective: data.strategy.objective ?? "",
    targetAudience: data.strategy.targetAudience ?? "",
    keyMessage: data.strategy.keyMessage ?? "",
    insight: data.strategy.insight ?? "",
    reasonToBelieve: data.strategy.reasonToBelieve ?? "",
  };
  form.budget = {
    total: centsToInput(campaign.budgetCents ?? data.budget.totalCents),
    byStage: Object.fromEntries(
      FUNNEL_STAGES.map((stage) => [stage, centsToInput(data.budget.byFunnelStageCents?.[stage])]),
    ) as CharterFormValues["budget"]["byStage"],
  };
  form.links = {
    frontify: data.links.frontify ?? "",
    sharepoint: data.links.sharepoint ?? "",
    lookerStudio: data.links.lookerStudio ?? "",
  };
  form.stakeholders = data.stakeholders.map((s, index) => ({
    clientId: `s${index}`,
    team: s.team,
    people: s.people.join(", "),
    role: s.role ?? "",
  }));
  form.approvalProcess = data.approvalProcess ?? "";
  return form;
}
