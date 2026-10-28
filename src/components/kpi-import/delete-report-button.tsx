"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteReport } from "@/app/campaigns/import-actions";

export function DeleteReportButton({ reportId, label }: { reportId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Delete report ${label}`}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Delete report “${label}” and all imported values?`)) return;
        startTransition(async () => {
          const result = await deleteReport(reportId);
          if (result.ok) router.refresh();
          else window.alert(result.error ?? "Deleting failed.");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
