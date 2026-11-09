"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { FUNNEL_STAGES, FUNNEL_STAGE_LABELS, type FunnelStage } from "@/lib/domain/enums";
import { emptyChannelForm } from "@/lib/entities/forms";
import { createChannel } from "@/app/campaigns/entity-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export interface ChannelTypeOption {
  id: string;
  name: string;
  stage: FunnelStage;
}

/** Adds a channel to the campaign in this funnel stage, straight from the planning. */
export function AddPlanChannel({
  campaignId,
  stage,
  channelTypes,
}: {
  campaignId: string;
  stage: FunnelStage;
  channelTypes: ChannelTypeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [typeId, setTypeId] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const ordered = [stage, ...FUNNEL_STAGES.filter((s) => s !== stage)];

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" className="w-full border-dashed" onClick={() => setOpen(true)}>
        <Plus /> Add channel
      </Button>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const type = channelTypes.find((t) => t.id === typeId);
    if (!type) {
      setError("Select a channel type.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await createChannel(campaignId, {
          ...emptyChannelForm({ funnelStage: stage, channelTypeId: type.id }),
          name: name.trim() || type.name,
        });
        if (result.ok) {
          setOpen(false);
          setTypeId("");
          setName("");
          router.refresh();
        } else {
          setError(
            result.formError ?? Object.values(result.fieldErrors ?? {})[0] ?? "The channel could not be created.",
          );
        }
      } catch {
        setError("The channel could not be created. Please try again.");
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-dashed p-3">
      <p className="text-sm font-medium">New channel in {FUNNEL_STAGE_LABELS[stage]}</p>
      <label htmlFor={`add-type-${stage}`} className="sr-only">
        Channel type
      </label>
      <Select
        id={`add-type-${stage}`}
        value={typeId}
        onChange={(e) => {
          const type = channelTypes.find((t) => t.id === e.target.value);
          setTypeId(e.target.value);
          if (type && (!name || channelTypes.some((t) => t.name === name))) setName(type.name);
        }}
      >
        <option value="">Channel type</option>
        {ordered.map((s) => (
          <optgroup key={s} label={FUNNEL_STAGE_LABELS[s]}>
            {channelTypes
              .filter((t) => t.stage === s)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </optgroup>
        ))}
      </Select>
      <label htmlFor={`add-name-${stage}`} className="sr-only">
        Channel name
      </label>
      <Input id={`add-name-${stage}`} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      {error && (
        <p className="text-xs font-medium text-status-red" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Add
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Missing a channel type? Admins add it under Settings → Benchmarks.
      </p>
    </form>
  );
}
