import { can, getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { storage } from "@/lib/storage";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/creatives";

/** Serves a creative's image. URLs carry a version (?v=), so responses can be cached. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "read")) return new Response("Not signed in.", { status: 401 });

  const { id } = await params;
  const creative = await db.creative.findUnique({ where: { id }, select: { imageKey: true, imageType: true } });
  if (!creative?.imageKey || !creative.imageType || !ACCEPTED_IMAGE_TYPES.includes(creative.imageType)) {
    return new Response("Image not found.", { status: 404 });
  }

  try {
    const data = await storage.get(creative.imageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": creative.imageType,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Image no longer available.", { status: 410 });
  }
}
