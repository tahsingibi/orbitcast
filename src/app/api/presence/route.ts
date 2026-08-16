import { NextResponse } from "next/server";

import { presenceEnabled, recordListener } from "@/lib/presence";

/**
 * Dinleyici kalp atışı.
 *
 * İstemci kendi rastgele kimliğini gönderir; sunucu onu sayıma katıp güncel
 * sayıyı döndürür. Kimlik oturumluk ve anlamsızdır — kullanıcıyı tanımlayan
 * hiçbir şey (IP, çerez, parmak izi) saklanmaz.
 */
export const dynamic = "force-dynamic";

/** Kimliğin biçimi sabit: uydurma uzun değerlerle HLL şişirilemesin. */
const ID_PATTERN = /^[a-z0-9]{8,32}$/;

export async function POST(request: Request) {
  if (!presenceEnabled) {
    return NextResponse.json({ count: null });
  }

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!ID_PATTERN.test(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  try {
    return NextResponse.json({ count: await recordListener(id) });
  } catch {
    // Sayaç yayının önüne geçmemeli: Redis düşse bile dinleyici müziği duyar,
    // yalnızca rozet kaybolur.
    return NextResponse.json({ count: null });
  }
}
