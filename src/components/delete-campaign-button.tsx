"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteCampaign } from "@/app/campaigns/actions";

/** Admin action: delete a campaign after typing its name. */
export function DeleteCampaignButton({
  campaignId,
  name,
  counts,
}: {
  campaignId: string;
  name: string;
  counts: { channels: number; assets: number; creatives: number; reports: number };
}) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  const close = () => {
    setOpen(false);
    setTyped("");
    setError(null);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        // Redirects to the dashboard on success.
        const result = await deleteCampaign(campaignId, typed);
        if (result && !result.ok) setError(result.error);
      } catch (err) {
        // The redirect is delivered as a special error and handled by Next.js.
        if (
          err &&
          typeof err === "object" &&
          "digest" in err &&
          String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
        )
          throw err;
        setError("Deleting failed. Please try again.");
      }
    });
  };

  const parts = [
    `${counts.channels} channel${counts.channels === 1 ? "" : "s"}`,
    `${counts.assets} asset${counts.assets === 1 ? "" : "s"}`,
    `${counts.creatives} creative${counts.creatives === 1 ? "" : "s"}`,
    `${counts.reports} imported report${counts.reports === 1 ? "" : "s"}`,
  ];

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-status-red hover:text-status-red print:hidden"
        onClick={() => setOpen(true)}
      >
        <Trash2 /> Delete campaign
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !pending && close()}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onSubmit={onSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-xl"
          >
            <h2 id={titleId} className="text-lg font-semibold">
              Delete “{name}”?
            </h2>
            <p className="text-sm text-muted-foreground">
              This permanently deletes the campaign with its launch charter, {parts.join(", ")}, links, comments and
              history. Uploaded files are removed as well. This cannot be undone.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-name">Type the campaign name to confirm</Label>
              <Input
                id="confirm-name"
                autoFocus
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={name}
                aria-invalid={!!error}
              />
            </div>
            {error && (
              <p className="text-sm font-medium text-status-red" role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-status-red text-white hover:bg-status-red/90"
                disabled={pending || typed.trim() !== name.trim()}
              >
                {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Delete permanently
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
