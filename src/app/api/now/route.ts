import { NextResponse } from "next/server";

/**
 * Zaman referansı. İstemci kendi saatine güvenmek yerine buradan okuduğu
 * değerle bir offset hesaplar. Kesinlikle önbelleğe alınmamalı.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { now: Date.now() },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
