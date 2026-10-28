"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteReport } from "@/app/kampagnen/import-actions";

export function DeleteReportButton({ reportId, label }: { reportId: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`Report ${label} löschen`}
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Report „${label}“ mit allen importierten Werten löschen?`)) return;
        startTransition(async () => {
          const result = await deleteReport(reportId);
          if (result.ok) router.refresh();
          else window.alert(result.error ?? "Löschen fehlgeschlagen.");
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
