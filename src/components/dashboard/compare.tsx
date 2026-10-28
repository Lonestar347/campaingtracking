"use client";

import * as React from "react";
import Link from "next/link";
import { Columns3, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MAX_COMPARE } from "@/lib/dashboard";

interface CompareItem {
  slug: string;
  name: string;
}

interface CompareContextValue {
  selected: CompareItem[];
  toggle: (item: CompareItem) => void;
  clear: () => void;
}

const CompareContext = React.createContext<CompareContextValue | null>(null);

function useCompare() {
  const ctx = React.useContext(CompareContext);
  if (!ctx) throw new Error("useCompare must be used inside CompareProvider");
  return ctx;
}

/** Holds the comparison selection; survives filter changes (same client tree). */
export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = React.useState<CompareItem[]>([]);
  const value = React.useMemo<CompareContextValue>(
    () => ({
      selected,
      toggle: (item) =>
        setSelected((prev) =>
          prev.some((s) => s.slug === item.slug)
            ? prev.filter((s) => s.slug !== item.slug)
            : prev.length >= MAX_COMPARE
              ? prev
              : [...prev, item],
        ),
      clear: () => setSelected([]),
    }),
    [selected],
  );
  return (
    <CompareContext.Provider value={value}>
      {children}
      <CompareBar />
    </CompareContext.Provider>
  );
}

export function CompareToggle({ slug, name }: CompareItem) {
  const { selected, toggle } = useCompare();
  const checked = selected.some((s) => s.slug === slug);
  const full = !checked && selected.length >= MAX_COMPARE;
  return (
    <label
      className={cn(
        "relative z-10 inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-foreground",
        full && "cursor-not-allowed opacity-50",
      )}
      title={full ? `Compare up to ${MAX_COMPARE} campaigns` : undefined}
    >
      <input
        type="checkbox"
        className="size-4 accent-foreground"
        checked={checked}
        disabled={full}
        onChange={() => toggle({ slug, name })}
      />
      Compare
    </label>
  );
}

function CompareBar() {
  const { selected, clear, toggle } = useCompare();
  if (selected.length === 0) return null;
  const href = `/compare?c=${selected.map((s) => encodeURIComponent(s.slug)).join(",")}`;

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 print:hidden">
      <div
        role="region"
        aria-label="Comparison selection"
        className="flex max-w-full flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-2.5 shadow-lg"
      >
        <span className="text-sm font-medium">
          {selected.length}/{MAX_COMPARE} selected:
        </span>
        {selected.map((s) => (
          <span key={s.slug} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-sm">
            {s.name}
            <button type="button" aria-label={`Remove ${s.name}`} onClick={() => toggle(s)} className="hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <Link
          href={href}
          aria-disabled={selected.length < 2}
          className={cn(
            buttonVariants({ variant: "accent", size: "sm" }),
            selected.length < 2 && "pointer-events-none opacity-50",
          )}
        >
          <Columns3 /> Compare
        </Link>
        <Button size="sm" variant="ghost" onClick={clear}>
          Clear selection
        </Button>
      </div>
    </div>
  );
}
