"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import type { AssetStatus, FunnelStage } from "@/lib/domain/enums";
import type { CriticalAsset } from "@/lib/dashboard";
import { AssetStatusChip } from "@/components/asset-status";
import { STAGE_STYLES } from "@/components/stage-styles";

const PREVIEW = 8;

function relativeDue(days: number): string {
  if (days < -1) return `seit ${-days} Tagen überfällig`;
  if (days === -1) return "seit gestern überfällig";
  if (days === 0) return "heute fällig";
  if (days === 1) return "morgen fällig";
  return `in ${days} Tagen fällig`;
}

export function CriticalList({ overdue, dueSoon }: { overdue: CriticalAsset[]; dueSoon: CriticalAsset[] }) {
  const [tab, setTab] = React.useState<"overdue" | "dueSoon">(overdue.length > 0 || dueSoon.length === 0 ? "overdue" : "dueSoon");
  const [expanded, setExpanded] = React.useState(false);
  const items = tab === "overdue" ? overdue : dueSoon;
  const visible = expanded ? items : items.slice(0, PREVIEW);

  const tabs = [
    { id: "overdue" as const, label: "Überfällig", count: overdue.length, icon: AlertTriangle, color: "text-status-red" },
    { id: "dueSoon" as const, label: "Bald fällig", count: dueSoon.length, icon: Clock, color: "text-status-yellow" },
  ];

  return (
    <section aria-labelledby="critical-title" className="rounded-xl border bg-card">
      <div className="border-b px-4 pt-3">
        <h2 id="critical-title" className="font-semibold">
          Kritisch
        </h2>
        <div role="tablist" aria-label="Kritische Assets" className="mt-2 flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setExpanded(false);
              }}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-2 py-1.5 text-sm transition-colors",
                tab === t.id ? "border-josera-gold font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className={cn("size-3.5", t.count > 0 && t.color)} />
              {t.label}
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div role="tabpanel" className="p-2">
        {items.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            {tab === "overdue" ? "Keine überfälligen Assets." : "Nichts in den nächsten Tagen fällig."}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {visible.map((a) => (
              <li key={a.assetId}>
                <Link
                  href={`/kampagnen/${a.campaignSlug}?asset=${a.assetId}`}
                  className={cn(
                    "block rounded-md border-l-2 px-2.5 py-2 hover:bg-muted",
                    STAGE_STYLES[a.funnelStage as FunnelStage]?.border ?? "border-border",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</span>
                    <AssetStatusChip status={a.status as AssetStatus} />
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {a.campaignName} · {a.channelName}
                    {a.ownerName && ` · ${a.ownerName}`}
                  </span>
                  <span
                    className={cn(
                      "block text-xs tabular-nums",
                      a.daysUntilDue < 0 ? "font-semibold text-status-red" : "font-medium text-status-yellow",
                    )}
                  >
                    {formatDate(a.dueDate)} · {relativeDue(a.daysUntilDue)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {items.length > PREVIEW && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="mt-1 w-full rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {expanded ? "Weniger anzeigen" : `Alle ${items.length} anzeigen`}
          </button>
        )}
      </div>
    </section>
  );
}
