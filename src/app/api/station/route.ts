import { NextResponse } from "next/server";

import { getStation } from "@/lib/station";

/**
 * Yayının güncel hâli. Açık sayfalar bunu düzenli olarak yoklayıp playlist
 * değiştiğinde kendini yeniler — dinleyicinin sayfayı yenilemesi gerekmez.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const station = await getStation();

  return NextResponse.json(
    { now: Date.now(), station },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
