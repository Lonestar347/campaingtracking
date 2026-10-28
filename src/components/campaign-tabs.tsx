"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function CampaignTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/campaigns/${slug}`;
  const tabs = [
    { href: base, label: "Mind map", active: pathname === base },
    { href: `${base}/funnel`, label: "Funnel", active: pathname === `${base}/funnel` },
    { href: `${base}/charter`, label: "Launch charter", active: pathname.startsWith(`${base}/charter`) },
    { href: `${base}/performance`, label: "Performance", active: pathname.startsWith(`${base}/performance`) },
    { href: `${base}/activity`, label: "Activity", active: pathname === `${base}/activity` },
  ];
  return (
    <nav className="flex gap-1 border-b print:hidden" aria-label="Campaign views">
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
