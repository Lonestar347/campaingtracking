import { BarChart3, FolderOpen, Image as ImageIcon, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LinkType } from "@/lib/domain/enums";

// Generic icons per tool (no third-party logos): Frontify = asset library,
// SharePoint = document folder, Looker Studio = report.
const ICONS: Record<LinkType, typeof Link2> = {
  frontify: ImageIcon,
  sharepoint: FolderOpen,
  looker_studio: BarChart3,
  other: Link2,
};

export function LinkIcon({ type, className }: { type: string; className?: string }) {
  const Icon = ICONS[type as LinkType] ?? Link2;
  return <Icon className={cn("size-4 shrink-0", className)} aria-hidden />;
}
