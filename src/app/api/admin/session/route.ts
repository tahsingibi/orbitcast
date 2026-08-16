import { NextResponse } from "next/server";

import { adminEnabled, checkPassword, endSession, startSession } from "@/lib/admin-auth";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { t } = await getI18n();

  if (!adminEnabled) {
    return NextResponse.json(
      { error: t.errors.adminDisabled },
      { status: 503 },
    );
  }

  const { password } = await request.json().catch(() => ({ password: "" }));

  if (typeof password !== "string" || !checkPassword(password)) {
    // Kaba kuvvet denemelerini biraz yavaşlat.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ error: t.errors.wrongPassword }, { status: 401 });
  }

  await startSession();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await endSession();
  return NextResponse.json({ ok: true });
}
