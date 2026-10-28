import { can, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { extensionOf } from "@/lib/kpi-import/parse-file";

const CONTENT_TYPES: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv; charset=utf-8",
};

/** Downloads the original file of an imported KPI report. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "read")) return new Response("Nicht angemeldet.", { status: 401 });

  const { id } = await params;
  const report = await db.kpiReport.findUnique({ where: { id } });
  if (!report) return new Response("Report nicht gefunden.", { status: 404 });

  try {
    const data = await storage.get(report.storageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": CONTENT_TYPES[extensionOf(report.originalFileName)] ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(report.originalFileName)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Datei nicht mehr vorhanden.", { status: 410 });
  }
}
