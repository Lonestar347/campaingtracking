"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, ExternalLink, Plus, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ASSET_STATUSES,
  ASSET_STATUS_LABELS,
  ASSET_TYPE_LABELS,
  FUNNEL_STAGE_LABELS,
  type AssetStatus,
  type AssetType,
  type FunnelStage,
} from "@/lib/domain/enums";
import { formatDate, formatDateRange } from "@/lib/dates";
import { formatGermanNumber } from "@/lib/format";
import { isOverdue, rollupCampaign, summarizeAssets } from "@/lib/status";
import { parseKpiTargets } from "@/lib/validation";
import {
  assetFormFromRecord,
  channelFormFromRecord,
  emptyAssetForm,
  emptyChannelForm,
} from "@/lib/entities/forms";
import type { CampaignDetail, CharterFormOptions } from "@/lib/queries";
import {
  createAsset,
  createChannel,
  deleteAsset,
  deleteChannel,
  setAssetStatus,
  updateAsset,
  updateChannel,
} from "@/app/kampagnen/entity-actions";
import { ProgressBar, TrafficLightBadge } from "@/components/status-badges";
import { STAGE_STYLES } from "@/components/stage-styles";
import { AssetStatusChip } from "@/components/asset-status";
import { AssetForm, ChannelForm } from "@/components/mindmap/entity-forms";

export type Selection =
  | { kind: "campaign" }
  | { kind: "stage"; stage: FunnelStage }
  | { kind: "channel"; id: string }
  | { kind: "asset"; id: string }
  | { kind: "new-channel"; stage: FunnelStage }
  | { kind: "new-asset"; channelId: string };

type Channel = CampaignDetail["channels"][number];
type Asset = Channel["assets"][number];

const LINK_TYPE_LABELS: Record<string, string> = {
  frontify: "Frontify",
  sharepoint: "SharePoint",
  looker_studio: "Looker Studio",
  other: "Link",
};

interface PanelProps {
  campaign: CampaignDetail;
  options: CharterFormOptions;
  canEdit: boolean;
  selection: Selection;
  onSelect: (selection: Selection | null) => void;
}

function PanelHeader({
  eyebrow,
  title,
  onClose,
  accent,
}: {
  eyebrow: React.ReactNode;
  title: React.ReactNode;
  onClose: () => void;
  accent?: string;
}) {
  return (
    <div className={cn("sticky top-0 z-10 flex items-start gap-2 border-b bg-card px-4 py-3", accent)}>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{eyebrow}</p>
        <h2 className="text-base font-semibold leading-tight break-words">{title}</h2>
      </div>
      <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Panel schließen">
        <X />
      </Button>
    </div>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{children}</h3>
      {action}
    </div>
  );
}

function ListButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
    >
      {children}
      <ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function LinkList({ links }: { links: { id: string; type: string; url: string; label: string | null }[] }) {
  if (links.length === 0) return null;
  return (
    <section>
      <SectionTitle>Links</SectionTitle>
      <ul className="space-y-1">
        {links.map((link) => (
          <li key={link.id}>
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <span className="w-20 shrink-0 text-xs font-semibold text-muted-foreground">
                {LINK_TYPE_LABELS[link.type] ?? link.type}
              </span>
              <span className="min-w-0 flex-1 truncate">{link.label ?? link.url}</span>
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AssetRow({ asset, onClick }: { asset: Asset; onClick: () => void }) {
  const overdue = isOverdue(asset, new Date());
  return (
    <ListButton onClick={onClick}>
      <span className="min-w-0 flex-1 truncate">{asset.title}</span>
      {asset.dueDate && (
        <span className={cn("text-xs tabular-nums", overdue ? "font-semibold text-status-red" : "text-muted-foreground")}>
          {formatDate(asset.dueDate)}
        </span>
      )}
      <AssetStatusChip status={asset.status as AssetStatus} />
    </ListButton>
  );
}

// ---------------------------------------------------------------------------

export function DetailPanel(props: PanelProps) {
  const { selection } = props;
  return (
    <aside
      className="absolute inset-0 z-10 flex flex-col overflow-y-auto bg-card sm:static sm:w-[400px] sm:shrink-0 sm:border-l"
      aria-label="Details"
    >
      {selection.kind === "campaign" && <CampaignPanel {...props} />}
      {selection.kind === "stage" && <StagePanel {...props} stage={selection.stage} />}
      {selection.kind === "channel" && <ChannelPanel {...props} channelId={selection.id} />}
      {selection.kind === "asset" && <AssetPanel {...props} assetId={selection.id} />}
      {selection.kind === "new-channel" && <NewChannelPanel {...props} stage={selection.stage} />}
      {selection.kind === "new-asset" && <NewAssetPanel {...props} channelId={selection.channelId} />}
    </aside>
  );
}

function CampaignPanel({ campaign, onSelect }: PanelProps) {
  const now = new Date();
  const rollup = rollupCampaign(campaign, now);
  const overdue = campaign.channels.flatMap((c) =>
    c.assets.filter((a) => isOverdue(a, now)).map((a) => ({ asset: a, channel: c })),
  );

  return (
    <>
      <PanelHeader eyebrow="Kampagne" title={campaign.name} onClose={() => onSelect(null)} />
      <div className="space-y-6 p-4">
        <section className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <TrafficLightBadge value={rollup.campaign.trafficLight} />
            <span className="text-muted-foreground">{formatDateRange(campaign.startDate, campaign.endDate)}</span>
          </div>
          <ProgressBar progress={rollup.campaign.progress} />
          {campaign.objective && <p className="pt-1">{campaign.objective}</p>}
          <Link
            href={`/kampagnen/${campaign.slug}/charter`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}
          >
            Launch Charter öffnen
          </Link>
        </section>

        <section>
          <SectionTitle>Funnel-Stufen</SectionTitle>
          <ul className="space-y-1">
            {(Object.keys(rollup.stages) as FunnelStage[]).map((stage) => (
              <li key={stage}>
                <ListButton onClick={() => onSelect({ kind: "stage", stage })}>
                  <span className={cn("size-2 rounded-full", STAGE_STYLES[stage].bg)} />
                  <span className="flex-1">{FUNNEL_STAGE_LABELS[stage]}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {rollup.stages[stage].progress.done}/{rollup.stages[stage].progress.total}
                  </span>
                  <TrafficLightBadge value={rollup.stages[stage].trafficLight} className="w-20 text-xs" />
                </ListButton>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionTitle>Überfällige Assets ({overdue.length})</SectionTitle>
          {overdue.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine – alles im Zeitplan.</p>
          ) : (
            <ul className="space-y-1">
              {overdue.map(({ asset, channel }) => (
                <li key={asset.id}>
                  <ListButton onClick={() => onSelect({ kind: "asset", id: asset.id })}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{asset.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{channel.name}</span>
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-status-red">
                      {formatDate(asset.dueDate)}
                    </span>
                  </ListButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        <LinkList links={campaign.links} />
      </div>
    </>
  );
}

function StagePanel({ campaign, canEdit, onSelect, stage }: PanelProps & { stage: FunnelStage }) {
  const now = new Date();
  const channels = campaign.channels.filter((c) => c.funnelStage === stage);
  const summary = summarizeAssets(
    channels.flatMap((c) => c.assets),
    now,
  );

  return (
    <>
      <PanelHeader
        eyebrow="Funnel-Stufe"
        title={FUNNEL_STAGE_LABELS[stage]}
        onClose={() => onSelect(null)}
        accent={cn("border-t-4", STAGE_STYLES[stage].border)}
      />
      <div className="space-y-6 p-4">
        <section className="space-y-2">
          <TrafficLightBadge value={summary.trafficLight} />
          <ProgressBar progress={summary.progress} />
        </section>
        <section>
          <SectionTitle
            action={
              canEdit && (
                <Button size="sm" variant="outline" onClick={() => onSelect({ kind: "new-channel", stage })}>
                  <Plus /> Kanal
                </Button>
              )
            }
          >
            Kanäle ({channels.length})
          </SectionTitle>
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Kanäle in dieser Stufe.</p>
          ) : (
            <ul className="space-y-1">
              {channels.map((c) => {
                const s = summarizeAssets(c.assets, now);
                return (
                  <li key={c.id}>
                    <ListButton onClick={() => onSelect({ kind: "channel", id: c.id })}>
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {s.progress.done}/{s.progress.total}
                      </span>
                      <TrafficLightBadge value={s.trafficLight} className="w-20 text-xs" />
                    </ListButton>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function ChannelPanel({ campaign, options, canEdit, onSelect, channelId }: PanelProps & { channelId: string }) {
  const router = useRouter();
  const channel = campaign.channels.find((c) => c.id === channelId);
  const [deleting, startDelete] = React.useTransition();

  if (!channel) return <Missing onClose={() => onSelect(null)} />;
  const stage = channel.funnelStage as FunnelStage;
  const summary = summarizeAssets(channel.assets, new Date());
  const kpis = Object.entries(parseKpiTargets(channel.kpiTargets));

  const remove = () => {
    const extra = channel.assets.length > 0 ? ` und ${channel.assets.length} Asset(s)` : "";
    if (!window.confirm(`Kanal „${channel.name}“${extra} löschen?`)) return;
    startDelete(async () => {
      const result = await deleteChannel(channel.id);
      if (result.ok) {
        onSelect({ kind: "stage", stage });
        router.refresh();
      } else {
        window.alert(result.formError ?? "Löschen fehlgeschlagen.");
      }
    });
  };

  return (
    <>
      <PanelHeader
        eyebrow={
          <button type="button" className="hover:underline" onClick={() => onSelect({ kind: "stage", stage })}>
            {FUNNEL_STAGE_LABELS[stage]} · {channel.channelType.name}
          </button>
        }
        title={channel.name}
        onClose={() => onSelect(null)}
        accent={cn("border-t-4", STAGE_STYLES[stage].border)}
      />
      <div className={cn("space-y-6 p-4", deleting && "pointer-events-none opacity-60")}>
        <section className="space-y-2">
          <TrafficLightBadge value={summary.trafficLight} />
          <ProgressBar progress={summary.progress} />
        </section>

        <section>
          <SectionTitle
            action={
              canEdit && (
                <Button size="sm" variant="outline" onClick={() => onSelect({ kind: "new-asset", channelId: channel.id })}>
                  <Plus /> Asset
                </Button>
              )
            }
          >
            Assets ({channel.assets.length})
          </SectionTitle>
          {channel.assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Noch keine Assets.</p>
          ) : (
            <ul className="space-y-0.5">
              {channel.assets.map((a) => (
                <li key={a.id}>
                  <AssetRow asset={a} onClick={() => onSelect({ kind: "asset", id: a.id })} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {canEdit ? (
          <section>
            <SectionTitle>Kanal bearbeiten</SectionTitle>
            <ChannelForm
              key={`${channel.id}-${channel.updatedAt.getTime()}`}
              mode="edit"
              initial={channelFormFromRecord(channel)}
              options={options}
              submit={(values) => updateChannel(channel.id, values)}
              onSaved={() => router.refresh()}
              onDelete={remove}
            />
          </section>
        ) : (
          <section className="space-y-1 text-sm">
            <SectionTitle>Details</SectionTitle>
            <p>Owner: {channel.owner?.name ?? "offen"}</p>
            {(channel.startDate || channel.endDate) && <p>Zeitraum: {formatDateRange(channel.startDate, channel.endDate)}</p>}
            {kpis.length > 0 && <p>KPI-Ziele: {kpis.map(([k, v]) => `${k} ${formatGermanNumber(v)}`).join(" · ")}</p>}
            {channel.notes && <p className="whitespace-pre-line">{channel.notes}</p>}
          </section>
        )}

        <LinkList links={channel.links} />
      </div>
    </>
  );
}

const WORKFLOW: AssetStatus[] = ["IDEE", "BRIEFING", "IN_PRODUKTION", "FREIGABE", "FERTIG", "LIVE"];

function AssetPanel({ campaign, options, canEdit, onSelect, assetId }: PanelProps & { assetId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const channel = campaign.channels.find((c) => c.assets.some((a) => a.id === assetId));
  const asset = channel?.assets.find((a) => a.id === assetId);

  if (!channel || !asset) return <Missing onClose={() => onSelect(null)} />;
  const status = asset.status as AssetStatus;
  const stage = channel.funnelStage as FunnelStage;
  const overdue = isOverdue(asset, new Date());
  const userName = (id: string | null) => options.users.find((u) => u.id === id)?.name;

  const changeStatus = (next: AssetStatus) => {
    if (next === status) return;
    setError(null);
    startTransition(async () => {
      const result = await setAssetStatus(asset.id, next);
      if (result.ok) router.refresh();
      else setError(result.formError ?? "Status konnte nicht geändert werden.");
    });
  };

  const remove = () => {
    if (!window.confirm(`Asset „${asset.title}“ löschen?`)) return;
    startTransition(async () => {
      const result = await deleteAsset(asset.id);
      if (result.ok) {
        onSelect({ kind: "channel", id: channel.id });
        router.refresh();
      } else {
        setError(result.formError ?? "Löschen fehlgeschlagen.");
      }
    });
  };

  return (
    <>
      <PanelHeader
        eyebrow={
          <button type="button" className="hover:underline" onClick={() => onSelect({ kind: "channel", id: channel.id })}>
            {FUNNEL_STAGE_LABELS[stage]} · {channel.name}
          </button>
        }
        title={asset.title}
        onClose={() => onSelect(null)}
        accent={cn("border-t-4", STAGE_STYLES[stage].border)}
      />
      <div className="space-y-6 p-4">
        <section className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <AssetStatusChip status={status} className="text-xs" />
            <span className="text-muted-foreground">{ASSET_TYPE_LABELS[asset.assetType as AssetType] ?? asset.assetType}</span>
            {asset.dueDate && (
              <span className={cn("ml-auto tabular-nums", overdue ? "font-semibold text-status-red" : "text-muted-foreground")}>
                {overdue ? "Überfällig seit " : "Fällig "}
                {formatDate(asset.dueDate)}
              </span>
            )}
          </div>
          {!canEdit && (
            <div className="space-y-1 pt-2">
              {asset.format && <p>Format: {asset.format}</p>}
              <p>Owner: {userName(asset.ownerId) ?? "offen"}</p>
              <p>Freigabe: {userName(asset.approverId) ?? "offen"}</p>
              {asset.notes && <p className="whitespace-pre-line">{asset.notes}</p>}
            </div>
          )}
        </section>

        {canEdit && (
          <section>
            <SectionTitle>Status</SectionTitle>
            <div className={cn("grid grid-cols-3 gap-1.5", pending && "opacity-60")} role="group" aria-label="Status setzen">
              {WORKFLOW.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === status ? "default" : "outline"}
                  aria-pressed={s === status}
                  disabled={pending}
                  onClick={() => changeStatus(s)}
                >
                  {ASSET_STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {ASSET_STATUSES.filter((s) => !WORKFLOW.includes(s)).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === status ? "default" : "ghost"}
                  aria-pressed={s === status}
                  disabled={pending}
                  onClick={() => changeStatus(s)}
                >
                  {ASSET_STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
            {error && (
              <p className="mt-2 text-sm font-medium text-status-red" role="alert">
                {error}
              </p>
            )}
          </section>
        )}

        {canEdit && (
          <section>
            <SectionTitle>Asset bearbeiten</SectionTitle>
            <AssetForm
              key={`${asset.id}-${asset.updatedAt.getTime()}`}
              mode="edit"
              initial={assetFormFromRecord(asset)}
              options={options}
              submit={(values) => updateAsset(asset.id, values)}
              onSaved={() => router.refresh()}
              onDelete={remove}
            />
          </section>
        )}

        <LinkList links={asset.links} />
      </div>
    </>
  );
}

function NewChannelPanel({ campaign, options, onSelect, stage }: PanelProps & { stage: FunnelStage }) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  return (
    <>
      <PanelHeader
        eyebrow={`${FUNNEL_STAGE_LABELS[stage]} · Neuer Kanal`}
        title="Kanal hinzufügen"
        onClose={() => onSelect(null)}
        accent={cn("border-t-4", STAGE_STYLES[stage].border)}
      />
      <div className="p-4">
        <ChannelForm
          mode="create"
          initial={emptyChannelForm({ funnelStage: stage })}
          options={options}
          submit={(values) => createChannel(campaign.id, values)}
          onSaved={(id) =>
            // Refresh and select in one transition so the new channel is in the data when selected.
            startTransition(() => {
              router.refresh();
              onSelect({ kind: "channel", id });
            })
          }
          onCancel={() => onSelect({ kind: "stage", stage })}
        />
      </div>
    </>
  );
}

function NewAssetPanel({ campaign, options, onSelect, channelId }: PanelProps & { channelId: string }) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const channel = campaign.channels.find((c) => c.id === channelId);
  if (!channel) return <Missing onClose={() => onSelect(null)} />;
  const stage = channel.funnelStage as FunnelStage;

  return (
    <>
      <PanelHeader
        eyebrow={`${FUNNEL_STAGE_LABELS[stage]} · ${channel.name}`}
        title="Asset hinzufügen"
        onClose={() => onSelect(null)}
        accent={cn("border-t-4", STAGE_STYLES[stage].border)}
      />
      <div className="p-4">
        <AssetForm
          mode="create"
          initial={emptyAssetForm()}
          options={options}
          submit={(values) => createAsset(channel.id, values)}
          onSaved={(id) =>
            // Refresh and select in one transition so the new asset is in the data when selected.
            startTransition(() => {
              router.refresh();
              onSelect({ kind: "asset", id });
            })
          }
          onCancel={() => onSelect({ kind: "channel", id: channel.id })}
        />
      </div>
    </>
  );
}

function Missing({ onClose }: { onClose: () => void }) {
  return (
    <>
      <PanelHeader eyebrow="Details" title="Nicht gefunden" onClose={onClose} />
      <p className="p-4 text-sm text-muted-foreground">Dieses Element existiert nicht mehr.</p>
    </>
  );
}
