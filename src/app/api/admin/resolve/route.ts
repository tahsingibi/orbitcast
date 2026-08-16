import { NextResponse } from "next/server";

import { isAuthenticated } from "@/lib/admin-auth";
import { getI18n } from "@/lib/i18n/server";
import { resolveTrack } from "@/lib/youtube-metadata";

/** Bir YouTube linkinin metadata'sını çözer — kaydetmez, sadece önizler. */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { t } = await getI18n();

  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: t.errors.unauthorized }, { status: 401 });
  }

  const { url } = await request.json().catch(() => ({ url: "" }));
  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: t.errors.emptyLink }, { status: 400 });
  }

  try {
    const track = await resolveTrack(url);
    return NextResponse.json({ track });
  } catch (err) {
    // youtube-metadata kod fırlatır; çeviri burada yapılır.
    const code = (err as Error).message as keyof typeof t.errors;
    const message = (t.errors[code] as string | undefined) ?? t.errors.UPSTREAM_ERROR;
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
