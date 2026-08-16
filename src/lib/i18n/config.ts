/** Desteklenen diller. Yeni dil eklemek için buraya ve dictionaries/ altına ekleyin. */
export const LOCALES = ["tr", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** Ziyaretçinin tercihi yoksa ve tarayıcı dili eşleşmezse kullanılır. */
export const DEFAULT_LOCALE: Locale = "tr";

/** Ziyaretçinin seçimi burada saklanır. */
export const LOCALE_COOKIE = "orbitcast_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  tr: "Türkçe",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
