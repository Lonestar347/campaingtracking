"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  WIZARD_STEPS,
  emptyCharterForm,
  errorsForStep,
  stepForPath,
  validateCharterForm,
  type CharterFormValues,
  type FieldErrors,
  type WizardStepId,
} from "@/lib/charter/form";
import type { CharterFormOptions } from "@/lib/queries";
import type { CharterActionResult } from "@/app/campaigns/actions";
import { CharterFormProvider, setIn } from "@/components/charter/form-context";
import { BasisStep, BudgetStep, LinksStep, StakeholdersStep, StrategyStep } from "@/components/charter/steps-basic";
import { AssetsStep, ChannelsStep } from "@/components/charter/steps-channels";
import { ReviewStep } from "@/components/charter/review-step";

const DRAFT_KEY = "campaign-tracker:charter-draft";

function readDraft(): CharterFormValues | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as CharterFormValues) : null;
  } catch {
    return null;
  }
}

function writeDraft(values: CharterFormValues | null) {
  try {
    if (values) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage unavailable (private mode etc.) – drafts are a convenience only.
  }
}

export interface CharterWizardProps {
  mode: "create" | "edit";
  options: CharterFormOptions;
  initialValues?: CharterFormValues;
  defaultOwnerId?: string;
  onSubmit: (values: CharterFormValues) => Promise<CharterActionResult>;
  /** Path suffix after /campaigns/[slug] to open after a successful save, e.g. "/charter". */
  successSuffix?: string;
  cancelHref: string;
}

export function CharterWizard({
  mode,
  options,
  initialValues,
  defaultOwnerId,
  onSubmit,
  successSuffix = "",
  cancelHref,
}: CharterWizardProps) {
  const router = useRouter();
  const steps = React.useMemo<WizardStepId[]>(
    () =>
      WIZARD_STEPS.map((s) => s.id).filter((id) => mode === "create" || (id !== "channels" && id !== "assets")),
    [mode],
  );

  const [values, setValues] = React.useState<CharterFormValues>(
    () => initialValues ?? emptyCharterForm({ ownerId: defaultOwnerId }),
  );
  const [stepIndex, setStepIndex] = React.useState(0);
  // When editing, all data exists already, so every step is directly reachable.
  const [visited, setVisited] = React.useState<Set<WizardStepId>>(
    () => new Set(mode === "edit" ? steps : [steps[0]]),
  );
  /** Steps the user tried to leave; only their errors are shown. */
  const [checked, setChecked] = React.useState<Set<WizardStepId>>(() => new Set());
  const [serverErrors, setServerErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [draft, setDraft] = React.useState<CharterFormValues | null>(null);
  const dirty = React.useRef(false);
  const submitted = React.useRef(false);

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  // Offer to restore an unsaved draft (create mode only).
  React.useEffect(() => {
    if (mode === "create") setDraft(readDraft());
  }, [mode]);

  React.useEffect(() => {
    if (mode === "create" && dirty.current && !submitted.current) writeDraft(values);
  }, [mode, values]);

  React.useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current && !submitted.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const validation = React.useMemo(() => {
    const result = validateCharterForm(mode === "edit" ? { ...values, channels: [] } : values);
    return result.success ? {} : result.errors;
  }, [values, mode]);

  const allErrors = React.useMemo(() => ({ ...validation, ...serverErrors }), [validation, serverErrors]);
  const visibleErrors = React.useMemo(
    () => Object.fromEntries(Object.entries(allErrors).filter(([path]) => checked.has(stepForPath(path)))),
    [allErrors, checked],
  );
  const errorSteps = React.useMemo(
    () => new Set(Object.keys(allErrors).map(stepForPath).filter((s) => steps.includes(s))),
    [allErrors, steps],
  );

  const change = React.useCallback((fn: (v: CharterFormValues) => CharterFormValues) => {
    dirty.current = true;
    setServerErrors({});
    setValues(fn);
  }, []);
  const set = React.useCallback(
    (path: string, value: unknown) => change((v) => setIn(v, path, value)),
    [change],
  );

  const goTo = (target: WizardStepId) => {
    const index = steps.indexOf(target);
    if (index < 0) return;
    setStepIndex(index);
    setVisited((v) => new Set(v).add(target));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const next = () => {
    setChecked((c) => new Set(c).add(step));
    if (Object.keys(errorsForStep(allErrors, step)).length > 0) return;
    goTo(steps[stepIndex + 1]);
  };

  const submit = () => {
    setChecked(new Set(steps));
    const firstErrorStep = steps.find((s) => errorSteps.has(s) && s !== "review");
    if (firstErrorStep) {
      goTo(firstErrorStep);
      return;
    }
    setFormError(null);
    startTransition(async () => {
      try {
        const result = await onSubmit(values);
        if (result.ok) {
          submitted.current = true;
          if (mode === "create") writeDraft(null);
          router.push(`/campaigns/${result.slug}${successSuffix}`);
          router.refresh();
          return;
        }
        if (result.formError) setFormError(result.formError);
        if (result.fieldErrors) {
          setServerErrors(result.fieldErrors);
          const target = steps.find((s) => Object.keys(result.fieldErrors!).some((p) => stepForPath(p) === s));
          if (target) goTo(target);
        }
      } catch {
        setFormError("Saving failed. Please try again.");
      }
    });
  };

  return (
    <CharterFormProvider value={{ values, errors: visibleErrors, options, mode, set, update: change }}>
      {draft && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-josera-gold bg-josera-gold/10 px-4 py-3 text-sm">
          <span className="flex-1">
            There is an unsaved draft{draft.basis.name ? ` (“${draft.basis.name}”)` : ""}.
          </span>
          <Button
            size="sm"
            variant="accent"
            onClick={() => {
              setValues(draft);
              dirty.current = true;
              setDraft(null);
            }}
          >
            Restore
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              writeDraft(null);
              setDraft(null);
            }}
          >
            Discard
          </Button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Steps" className="min-w-0">
          <ol className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {steps.map((id, index) => {
              const meta = WIZARD_STEPS.find((s) => s.id === id)!;
              const active = index === stepIndex;
              const hasError = checked.has(id) && errorSteps.has(id);
              const done = visited.has(id) && index < stepIndex && !hasError;
              const reachable = visited.has(id) || index <= stepIndex;
              return (
                <li key={id} className="shrink-0">
                  <button
                    type="button"
                    disabled={!reachable}
                    onClick={() => goTo(id)}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-50",
                      active ? "bg-muted font-semibold" : "hover:bg-muted/60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        active && "border-foreground bg-foreground text-background",
                        done && "border-transparent bg-josera-gold text-black",
                        hasError && "border-status-red text-status-red",
                      )}
                    >
                      {done ? <Check className="size-3.5" /> : index + 1}
                    </span>
                    {meta.title}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0">
          <div className="rounded-xl border bg-card p-5 shadow-sm md:p-6">
            {step === "basis" && <BasisStep />}
            {step === "strategy" && <StrategyStep />}
            {step === "budget" && <BudgetStep />}
            {step === "channels" && <ChannelsStep />}
            {step === "assets" && <AssetsStep onGoToChannels={() => goTo("channels")} />}
            {step === "links" && <LinksStep />}
            {step === "stakeholders" && <StakeholdersStep />}
            {step === "review" && <ReviewStep steps={steps} errorSteps={errorSteps} onEdit={goTo} />}
          </div>

          {formError && (
            <p className="mt-4 text-sm font-medium text-status-red" role="alert">
              {formError}
            </p>
          )}

          <div className="mt-4 flex items-center gap-2">
            {stepIndex > 0 ? (
              <Button variant="outline" onClick={() => goTo(steps[stepIndex - 1])} disabled={pending}>
                <ArrowLeft /> Back
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => router.push(cancelHref)}>
                Cancel
              </Button>
            )}
            <div className="ml-auto">
              {isLast ? (
                <Button variant="accent" onClick={submit} disabled={pending}>
                  {pending ? <Loader2 className="animate-spin" /> : <Check />}
                  {mode === "create" ? "Create campaign" : "Save new version"}
                </Button>
              ) : (
                <Button onClick={next}>
                  Next <ArrowRight />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </CharterFormProvider>
  );
}
