"use client";

import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  FUNNEL_STAGES,
  FUNNEL_STAGE_LABELS,
  type FunnelStage,
} from "@/lib/domain/enums";
import type { ChannelFormValues } from "@/lib/charter/form";
import { STAGE_STYLES } from "@/components/stage-styles";
import { StepIntro } from "@/components/charter/steps-basic";
import { KpiDatalist } from "@/components/kpi-datalist";
import {
  SelectField,
  TextField,
  newClientId,
  useCharterForm,
  useUserOptions,
} from "@/components/charter/form-context";

export function ChannelsStep() {
  const { values, options, update } = useCharterForm();
  const channels = values.channels;

  const typesByStage = FUNNEL_STAGES.map((stage) => ({
    stage,
    types: options.channelTypes.filter((t) => t.defaultFunnelStage === stage),
  }));

  const toggleType = (type: (typeof options.channelTypes)[number]) => {
    const existing = channels.filter((c) => c.channelTypeId === type.id);
    if (existing.length > 0) {
      const hasContent = existing.some((c) => c.assets.length > 0 || c.kpis.length > 0);
      if (hasContent && !window.confirm(`Remove “${type.name}”? Entered KPIs and assets will be lost.`)) {
        return;
      }
      update((v) => ({ ...v, channels: v.channels.filter((c) => c.channelTypeId !== type.id) }));
      return;
    }
    update((v) => ({
      ...v,
      channels: [
        ...v.channels,
        {
          clientId: newClientId(),
          channelTypeId: type.id,
          funnelStage: type.defaultFunnelStage as FunnelStage,
          name: type.name,
          ownerId: "",
          startDate: "",
          endDate: "",
          kpis: [],
          assets: [],
        },
      ],
    }));
  };

  return (
    <div>
      <StepIntro title="Channels">
        Select channels. The funnel stage is preset and can be changed per channel.
      </StepIntro>

      <div className="grid gap-4 md:grid-cols-3">
        {typesByStage.map(({ stage, types }) => (
          <fieldset key={stage} className={cn("rounded-lg border-t-4 bg-card p-3", STAGE_STYLES[stage].border)}>
            <legend className="sr-only">{FUNNEL_STAGE_LABELS[stage]}</legend>
            <p className={cn("mb-2 text-sm font-semibold", STAGE_STYLES[stage].text)}>{FUNNEL_STAGE_LABELS[stage]}</p>
            <div className="flex flex-col gap-1.5">
              {types.map((type) => {
                const selected = channels.some((c) => c.channelTypeId === type.id);
                return (
                  <button
                    key={type.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleType(type)}
                    className={cn(
                      "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors",
                      selected ? cn("border-transparent font-medium", STAGE_STYLES[stage].soft) : "hover:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border",
                        selected && cn("border-transparent text-white", STAGE_STYLES[stage].bg),
                      )}
                    >
                      {selected && <Check className="size-3" />}
                    </span>
                    {type.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <KpiDatalist />

      <h3 className="mt-8 text-sm font-semibold">
        Selected channels <span className="font-normal text-muted-foreground">({channels.length})</span>
      </h3>
      {channels.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No channels selected yet. Channels can also be added later in the mind map.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {channels.map((channel, index) => (
            <ChannelCard key={channel.clientId} channel={channel} index={index} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelCard({ channel, index }: { channel: ChannelFormValues; index: number }) {
  const { errors, options, set, update } = useCharterForm();
  const userOptions = useUserOptions();
  const typeName = options.channelTypes.find((t) => t.id === channel.channelTypeId)?.name ?? "";
  const base = `channels.${index}`;

  const setKpis = (fn: (kpis: ChannelFormValues["kpis"]) => ChannelFormValues["kpis"]) =>
    set(`${base}.kpis`, fn(channel.kpis));

  const duplicate = () =>
    update((v) => {
      const copy: ChannelFormValues = {
        ...channel,
        clientId: newClientId(),
        name: `${channel.name} (2)`,
        kpis: channel.kpis.map((k) => ({ ...k, clientId: newClientId() })),
        assets: [],
      };
      const next = [...v.channels];
      next.splice(index + 1, 0, copy);
      return { ...v, channels: next };
    });

  const remove = () => {
    if ((channel.assets.length > 0 || channel.kpis.length > 0) && !window.confirm(`Remove “${channel.name}”?`)) {
      return;
    }
    update((v) => ({ ...v, channels: v.channels.filter((c) => c.clientId !== channel.clientId) }));
  };

  return (
    <div className={cn("rounded-lg border border-l-4 bg-card p-4", STAGE_STYLES[channel.funnelStage].border)}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{typeName}</span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon-sm" onClick={duplicate} aria-label="Duplicate channel" title="Duplicate, e.g. for another market">
            <Copy />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={remove} aria-label="Remove channel">
            <Trash2 />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-6">
        <TextField path={`${base}.name`} label="Name" required className="md:col-span-2" />
        <SelectField
          path={`${base}.funnelStage`}
          label="Funnel stage"
          className="md:col-span-2"
          placeholder="–"
          options={FUNNEL_STAGES.map((s) => ({ value: s, label: FUNNEL_STAGE_LABELS[s] }))}
        />
        <SelectField path={`${base}.ownerId`} label="Owner" placeholder="Unassigned" className="md:col-span-2" options={userOptions} />
        <TextField path={`${base}.startDate`} label="Start" type="date" className="md:col-span-2" />
        <TextField path={`${base}.endDate`} label="End" type="date" className="md:col-span-2" />
      </div>

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium">KPI targets</p>
        <div className="space-y-2">
          {channel.kpis.map((kpi, ki) => (
            <div key={kpi.clientId} className="grid grid-cols-[2fr_1fr_auto] items-start gap-2">
              <Field label={<span className="sr-only">KPI</span>} error={errors[`${base}.kpis.${ki}.name`]}>
                <Input
                  list="kpi-options"
                  placeholder="KPI, e.g. reach"
                  value={kpi.name}
                  onChange={(e) => set(`${base}.kpis.${ki}.name`, e.target.value)}
                  aria-invalid={!!errors[`${base}.kpis.${ki}.name`]}
                />
              </Field>
              <Field label={<span className="sr-only">Target</span>} error={errors[`${base}.kpis.${ki}.target`]}>
                <Input
                  inputMode="decimal"
                  placeholder="Target"
                  value={kpi.target}
                  onChange={(e) => set(`${base}.kpis.${ki}.target`, e.target.value)}
                  aria-invalid={!!errors[`${base}.kpis.${ki}.target`]}
                />
              </Field>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setKpis((kpis) => kpis.filter((k) => k.clientId !== kpi.clientId))}
                aria-label="Remove KPI"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setKpis((kpis) => [...kpis, { clientId: newClientId(), name: "", target: "" }])}
          >
            <Plus /> KPI target
          </Button>
        </div>
      </div>
    </div>
  );
}

export function AssetsStep({ onGoToChannels }: { onGoToChannels: () => void }) {
  const { values, errors, set } = useCharterForm();
  const userOptions = useUserOptions();
  const channels = values.channels;

  if (channels.length === 0) {
    return (
      <div>
        <StepIntro title="Assets (optional)" />
        <p className="text-sm text-muted-foreground">Assets belong to channels. No channels are selected yet.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onGoToChannels}>
          Go to channels
        </Button>
      </div>
    );
  }

  return (
    <div>
      <StepIntro title="Assets (optional)">
        Initial asset list per channel. New assets start with the status “Idea”.
      </StepIntro>

      <div className="space-y-5">
        {FUNNEL_STAGES.flatMap((stage) =>
          channels
            .map((channel, index) => ({ channel, index }))
            .filter(({ channel }) => channel.funnelStage === stage),
        ).map(({ channel, index }) => {
          const base = `channels.${index}.assets`;
          return (
            <section
              key={channel.clientId}
              className={cn("rounded-lg border border-l-4 bg-card p-4", STAGE_STYLES[channel.funnelStage].border)}
            >
              <h3 className="mb-3 flex items-baseline gap-2 text-sm font-semibold">
                {channel.name || "Untitled channel"}
                <span className={cn("text-xs font-medium", STAGE_STYLES[channel.funnelStage].text)}>
                  {FUNNEL_STAGE_LABELS[channel.funnelStage]}
                </span>
              </h3>

              <div className="space-y-2">
                {channel.assets.length > 0 && (
                  <div className="hidden grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground lg:grid">
                    <span>Title</span>
                    <span>Type</span>
                    <span>Format</span>
                    <span>Due</span>
                    <span>Owner</span>
                    <span className="w-9" />
                  </div>
                )}
                {channel.assets.map((asset, ai) => {
                  const p = `${base}.${ai}`;
                  return (
                    <div
                      key={asset.clientId}
                      className="grid items-start gap-2 border-b pb-2 last:border-b-0 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:border-b-0 lg:pb-0"
                    >
                      <Field label={<span className="lg:sr-only">Title</span>} error={errors[`${p}.title`]}>
                        <Input
                          value={asset.title}
                          onChange={(e) => set(`${p}.title`, e.target.value)}
                          aria-invalid={!!errors[`${p}.title`]}
                          placeholder="e.g. Reel 9:16"
                        />
                      </Field>
                      <Field label={<span className="lg:sr-only">Type</span>} error={errors[`${p}.assetType`]}>
                        <Select
                          value={asset.assetType}
                          onChange={(e) => set(`${p}.assetType`, e.target.value)}
                          aria-invalid={!!errors[`${p}.assetType`]}
                        >
                          <option value="">Type</option>
                          {ASSET_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {ASSET_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={<span className="lg:sr-only">Format</span>}>
                        <Input
                          value={asset.format}
                          onChange={(e) => set(`${p}.format`, e.target.value)}
                          placeholder="e.g. 9:16, 15s"
                        />
                      </Field>
                      <Field label={<span className="lg:sr-only">Due</span>} error={errors[`${p}.dueDate`]}>
                        <Input type="date" value={asset.dueDate} onChange={(e) => set(`${p}.dueDate`, e.target.value)} />
                      </Field>
                      <Field label={<span className="lg:sr-only">Owner</span>}>
                        <Select value={asset.ownerId} onChange={(e) => set(`${p}.ownerId`, e.target.value)}>
                          <option value="">Unassigned</option>
                          {userOptions.map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="lg:mt-0"
                        onClick={() => set(base, channel.assets.filter((a) => a.clientId !== asset.clientId))}
                        aria-label="Remove asset"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    set(base, [
                      ...channel.assets,
                      { clientId: newClientId(), title: "", assetType: "", format: "", dueDate: "", ownerId: "" },
                    ])
                  }
                >
                  <Plus /> Asset
                </Button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
