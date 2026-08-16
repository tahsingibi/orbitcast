import "server-only";

import { cookies, headers } from "next/headers";

import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, LOCALES, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./index";

/**
 * Aktif dili çözer.
 *
 * Öncelik: ziyaretçinin seçimi (çerez) → tarayıcı dili → varsayılan.
 * Ziyaretçi bir kez seçtiğinde tarayıcı dili artık dikkate alınmaz.
 */
export async function resolveLocale(): Promise<Locale> {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  const accepted = (await headers()).get("accept-language") ?? "";
  for (const part of accepted.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
    const base = tag.split("-")[0];
    const match = LOCALES.find((locale) => locale === base);
    if (match) return match;
  }

  return DEFAULT_LOCALE;
}

/** Sunucu bileşenleri ve route handler'ları için: aktif dil + sözlük. */
export async function getI18n(): Promise<{ locale: Locale; t: Dictionary }> {
  const locale = await resolveLocale();
  return { locale, t: await getDictionary(locale) };
}
