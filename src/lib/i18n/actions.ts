"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { isLocale, LOCALE_COOKIE } from "./config";

/**
 * Ziyaretçinin dil tercihini kaydeder.
 *
 * Çerez istemciden değil sunucudan yazılıyor: sözlük zaten sunucuda çözülüyor,
 * böylece seçim tek adımda uygulanıp sayfa doğru dille yeniden render ediliyor.
 */
export async function setLocale(next: string): Promise<void> {
  if (!isLocale(next)) return;

  (await cookies()).set(LOCALE_COOKIE, next, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}
