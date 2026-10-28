"use client";

import { AlertCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ASSET_TYPE_LABELS,
  EXECUTION_TYPE_LABELS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  type AssetType,
  type ExecutionType,
} from "@/lib/domain/enums";
import { stepForPath, type WizardStepId } from "@/lib/charter/form";
import { formatDate } from "@/lib/dates";
import { parseDateInput } from "@/lib/format";
import { STAGE_STYLES } from "@/components/stage-styles";
import { StepIntro } from "@/components/charter/steps-basic";
import { TextAreaField, useCharterForm } from "@/components/charter/form-context";

const showDate = (value: string) => (value ? formatDate(parseDateInput(value)) : "–");
const showText = (value: string) => value.trim() || "–";

function Section({
  title,
  step,
  onEdit,
  hasErrors,
  children,
}: {
  title: string;
  step: WizardStepId;
  onEdit: (step: WizardStepId) => void;
  hasErrors: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-lg border bg-card p-4", hasErrors && "border-status-red")}>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-semibold">{title}</h3>
        {hasErrors && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-status-red">
            <AlertCircle className="size-3.5" /> Please check
          </span>
        )}
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onEdit(step)}>
          <Pencil /> Edit
        </Button>
      </div>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="whitespace-pre-line">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ReviewStep({
  steps,
  errorSteps,
  onEdit,
}: {
  steps: readonly WizardStepId[];
  errorSteps: Set<WizardStepId>;
  onEdit: (step: WizardStepId) => void;
}) {
  const { values, options, mode, errors } = useCharterForm();
  const userName = (id: string) => options.users.find((u) => u.id === id)?.name ?? "–";
  const { basis, strategy, budget, links } = values;
  const generalErrors = Object.entries(errors).filter(([path]) => stepForPath(path) === "review");
  const sectionProps = (step: WizardStepId) => ({ step, onEdit, hasErrors: errorSteps.has(step) });

  const assetCount = values.channels.reduce((sum, c) => sum + c.assets.length, 0);

  return (
    <div>
      <StepIntro title={mode === "create" ? "Review & create" : "Review & save"}>
        {mode === "create"
          ? `Creating will set up the campaign, ${values.channels.length} channels and ${assetCount} assets.`
          : "Saving creates a new version of the charter."}
      </StepIntro>

      {generalErrors.length > 0 && (
        <p className="mb-4 text-sm font-medium text-status-red">{generalErrors.map(([, m]) => m).join(" ")}</p>
      )}

      <div className="space-y-4">
        <Section title="Basics" {...sectionProps("basis")}>
          <Rows
            rows={[
              ["Name", showText(basis.name)],
              ["Brand / product line", [basis.brand, basis.productLine].filter(Boolean).join(" / ") || "–"],
              ["Markets", basis.markets.join(", ") || "–"],
              ["Period", `${showDate(basis.startDate)} – ${showDate(basis.endDate)}`],
              ["Owner", userName(basis.ownerId)],
              ["Execution", EXECUTION_TYPE_LABELS[basis.executionType as ExecutionType] ?? "–"],
              ["Partners", showText(basis.partners)],
            ]}
          />
        </Section>

        <Section title="Strategy" {...sectionProps("strategy")}>
          <Rows
            rows={[
              ["Objective", showText(strategy.objective)],
              ["Target audience", showText(strategy.targetAudience)],
              ["Key message", showText(strategy.keyMessage)],
              ["Insight", showText(strategy.insight)],
              ["Reason to Believe", showText(strategy.reasonToBelieve)],
            ]}
          />
        </Section>

        <Section title="Budget" {...sectionProps("budget")}>
          <Rows
            rows={[
              ["Total", budget.total ? `€${budget.total}` : "–"],
              ...FUNNEL_STAGES.filter((s) => budget.byStage[s]).map(
                (s) => [FUNNEL_STAGE_LABELS[s], `€${budget.byStage[s]}`] as [string, string],
              ),
            ]}
          />
        </Section>

        {steps.includes("channels") && (
          <Section title={`Channels & assets (${values.channels.length})`} {...sectionProps("channels")}>
            {values.channels.length === 0 ? (
              <p className="text-sm text-muted-foreground">No channels selected.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {values.channels.map((c) => (
                  <li key={c.clientId} className={cn("border-l-4 pl-3", STAGE_STYLES[c.funnelStage].border)}>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground"> · {FUNNEL_STAGE_LABELS[c.funnelStage]}</span>
                    {c.kpis.length > 0 && (
                      <span className="text-muted-foreground">
                        {" "}
                        · KPIs: {c.kpis.map((k) => `${k.name} ${k.target}`).join(", ")}
                      </span>
                    )}
                    {c.assets.length > 0 && (
                      <ul className="mt-1 text-muted-foreground">
                        {c.assets.map((a) => (
                          <li key={a.clientId}>
                            – {a.title || "Untitled"} ({ASSET_TYPE_LABELS[a.assetType as AssetType] ?? "type missing"}
                            {a.dueDate && `, due ${showDate(a.dueDate)}`})
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {errorSteps.has("assets") && (
              <Button variant="link" size="sm" className="mt-2 px-0 text-status-red" onClick={() => onEdit("assets")}>
                Check assets
              </Button>
            )}
          </Section>
        )}

        <Section title="Links" {...sectionProps("links")}>
          <Rows
            rows={[
              ["Frontify", showText(links.frontify)],
              ["SharePoint", showText(links.sharepoint)],
              ["Looker Studio", showText(links.lookerStudio)],
            ]}
          />
        </Section>

        <Section title="Stakeholders" {...sectionProps("stakeholders")}>
          <Rows
            rows={[
              ...values.stakeholders.map(
                (s) =>
                  [s.team || "Team missing", [s.people, s.role && `(${s.role})`].filter(Boolean).join(" ") || "–"] as [
                    string,
                    string,
                  ],
              ),
              ["Approval process", showText(values.approvalProcess)],
            ]}
          />
        </Section>

        {mode === "edit" && (
          <TextAreaField
            path="changeNote"
            label="What changed?"
            hint="Optional, shown in the version history"
            rows={2}
          />
        )}
      </div>

    </div>
  );
}
