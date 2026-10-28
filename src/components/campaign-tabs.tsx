"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function CampaignTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/kampagnen/${slug}`;
  const tabs = [
    { href: base, label: "Übersicht", active: pathname === base },
    { href: `${base}/charter`, label: "Launch Charter", active: pathname.startsWith(`${base}/charter`) },
  ];
  return (
    <nav className="flex gap-1 border-b print:hidden" aria-label="Kampagnenansichten">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            tab.active
              ? "border-josera-gold text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
