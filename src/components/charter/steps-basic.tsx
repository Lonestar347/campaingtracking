"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  EXECUTION_TYPES,
  EXECUTION_TYPE_LABELS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  MARKETS,
  TEAMS,
} from "@/lib/domain/enums";
import { formatEuroCents } from "@/lib/dates";
import { euroToCents, parseGermanNumber } from "@/lib/format";
import { STAGE_STYLES } from "@/components/stage-styles";
import {
  SelectField,
  TextAreaField,
  TextField,
  newClientId,
  useCharterForm,
  useUserOptions,
} from "@/components/charter/form-context";

export function StepIntro({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}

export function BasisStep() {
  const { values, errors, set } = useCharterForm();
  const userOptions = useUserOptions();
  const markets = values.basis.markets;

  return (
    <div>
      <StepIntro title="Basis">Die Eckdaten der Kampagne.</StepIntro>
      <div className="grid gap-5 md:grid-cols-2">
        <TextField path="basis.name" label="Kampagnenname" required className="md:col-span-2" autoFocus />
        <TextAreaField
          path="basis.description"
          label="Kurzbeschreibung"
          className="md:col-span-2"
          rows={2}
        />
        <TextField path="basis.brand" label="Marke" />
        <TextField path="basis.productLine" label="Produktlinie" />

        <Field label="Märkte" required error={errors["basis.markets"]} className="md:col-span-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Märkte">
            {MARKETS.map((market) => {
              const active = markets.includes(market);
              return (
                <button
                  key={market}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    set("basis.markets", active ? markets.filter((m) => m !== market) : [...markets, market])
                  }
                  className={cn(
                    "h-9 min-w-14 rounded-md border px-3 text-sm font-semibold transition-colors",
                    active ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
                  )}
                >
                  {market}
                </button>
              );
            })}
          </div>
        </Field>

        <TextField path="basis.startDate" label="Start" type="date" required />
        <TextField path="basis.endDate" label="Ende" type="date" required />
        <SelectField path="basis.ownerId" label="Owner" required options={userOptions} />
        <SelectField
          path="basis.executionType"
          label="Umsetzung"
          required
          options={EXECUTION_TYPES.map((t) => ({ value: t, label: EXECUTION_TYPE_LABELS[t] }))}
        />
        <TextAreaField
          path="basis.partners"
          label="Partner (Agentur / Produktion)"
          hint="Ein Partner pro Zeile"
          className="md:col-span-2"
          rows={2}
        />
      </div>
    </div>
  );
}

export function StrategyStep() {
  return (
    <div>
      <StepIntro title="Strategie">Wofür steht die Kampagne und wen soll sie erreichen?</StepIntro>
      <div className="grid gap-5">
        <TextAreaField path="strategy.objective" label="Ziel / Objective" rows={2} />
        <TextAreaField path="strategy.targetAudience" label="Zielgruppe" rows={2} />
        <TextAreaField path="strategy.keyMessage" label="Kernbotschaft" rows={2} />
        <TextAreaField path="strategy.insight" label="Insight" rows={2} />
        <TextAreaField path="strategy.reasonToBelieve" label="Reason to Believe" rows={2} />
      </div>
    </div>
  );
}

export function BudgetStep() {
  const { values, errors } = useCharterForm();
  const toCents = (v: string) => {
    const n = parseGermanNumber(v);
    return n == null ? 0 : euroToCents(n);
  };
  const total = parseGermanNumber(values.budget.total);
  const split = FUNNEL_STAGES.reduce((sum, s) => sum + toCents(values.budget.byStage[s]), 0);

  return (
    <div>
      <StepIntro title="Budget">Beträge in EUR, z. B. 25.000 oder 1.500,50.</StepIntro>
      <div className="grid gap-5 md:max-w-md">
        <TextField path="budget.total" label="Gesamtbudget (EUR)" inputMode="decimal" placeholder="0" />
      </div>

      <h3 className="mt-8 text-sm font-semibold">Aufteilung nach Funnel-Stufe (optional)</h3>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        {FUNNEL_STAGES.map((stage) => (
          <div key={stage} className={cn("rounded-lg border-l-4 pl-3", STAGE_STYLES[stage].border)}>
            <TextField
              path={`budget.byStage.${stage}`}
              label={FUNNEL_STAGE_LABELS[stage]}
              inputMode="decimal"
              placeholder="0"
            />
          </div>
        ))}
      </div>
      <p className={cn("mt-3 text-sm", errors["budget.byStage"] ? "font-medium text-status-red" : "text-muted-foreground")}>
        {errors["budget.byStage"] ? `${errors["budget.byStage"]}: ` : "Summe der Aufteilung: "}
        {formatEuroCents(split)}
        {total != null && ` von ${formatEuroCents(euroToCents(total))}`}
      </p>
    </div>
  );
}

export function LinksStep() {
  return (
    <div>
      <StepIntro title="Links">
        Ablageorte der Kampagne. Die Links erscheinen an der Kampagne und können später ergänzt werden.
      </StepIntro>
      <div className="grid gap-5 md:max-w-2xl">
        <TextField
          path="links.frontify"
          label="Frontify-Ordner"
          type="url"
          placeholder="https://…frontify.com/…"
        />
        <TextField
          path="links.sharepoint"
          label="SharePoint-Ordner"
          type="url"
          placeholder="https://…sharepoint.com/…"
        />
        <TextField
          path="links.lookerStudio"
          label="Looker-Studio-Report"
          type="url"
          placeholder="https://lookerstudio.google.com/…"
        />
      </div>
    </div>
  );
}

export function StakeholdersStep() {
  const { values, errors, set, update } = useCharterForm();
  const stakeholders = values.stakeholders;

  const add = () =>
    update((v) => ({
      ...v,
      stakeholders: [...v.stakeholders, { clientId: newClientId(), team: "", people: "", role: "" }],
    }));
  const remove = (clientId: string) =>
    update((v) => ({ ...v, stakeholders: v.stakeholders.filter((s) => s.clientId !== clientId) }));

  return (
    <div>
      <StepIntro title="Stakeholder">Beteiligte Teams und Personen sowie der Freigabeprozess.</StepIntro>

      <datalist id="team-options">
        {TEAMS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="space-y-3">
        {stakeholders.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Stakeholder eingetragen.</p>
        )}
        {stakeholders.map((s, index) => (
          <div key={s.clientId} className="grid items-start gap-3 rounded-lg border p-3 md:grid-cols-[1fr_2fr_1fr_auto]">
            <Field label="Team" error={errors[`stakeholders.${index}.team`]}>
              <Input
                list="team-options"
                value={s.team}
                onChange={(e) => set(`stakeholders.${index}.team`, e.target.value)}
                aria-invalid={!!errors[`stakeholders.${index}.team`]}
              />
            </Field>
            <Field label="Personen" hint="Mit Komma trennen">
              <Input value={s.people} onChange={(e) => set(`stakeholders.${index}.people`, e.target.value)} />
            </Field>
            <Field label="Rolle">
              <Input
                value={s.role}
                placeholder="z. B. Freigabe"
                onChange={(e) => set(`stakeholders.${index}.role`, e.target.value)}
              />
            </Field>
            <Button
              variant="ghost"
              size="icon"
              className="mt-6"
              onClick={() => remove(s.clientId)}
              aria-label="Stakeholder entfernen"
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add}>
          <Plus /> Stakeholder hinzufügen
        </Button>
      </div>

      <div className="mt-8 md:max-w-2xl">
        <TextAreaField
          path="approvalProcess"
          label="Freigabeprozess"
          rows={3}
          placeholder="z. B. Kreation → Brand Lead → Geschäftsführung"
        />
      </div>
    </div>
  );
}
