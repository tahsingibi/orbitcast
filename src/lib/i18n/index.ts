import { DEFAULT_LOCALE, type Locale } from "./config";
import { tr } from "./dictionaries/tr";

/**
 * Sözlüğün şekli Türkçe sözlükten türetilir. Yeni bir anahtar eklendiğinde
 * diğer diller derleme hatası verir — çeviri unutmak mümkün değil.
 *
 * Bütün değerler düz metindir; değişkenler `{token}` yer tutucularıyla yazılır
 * ve `format()` ile doldurulur. Fonksiyon kullanılamaz, çünkü sözlük sunucudan
 * istemci bileşenlerine prop olarak geçiyor.
 */
export type Dictionary = {
  [Area in keyof typeof tr]: { [Key in keyof (typeof tr)[Area]]: string };
};

const DICTIONARIES: Record<Locale, () => Promise<Dictionary>> = {
  tr: async () => tr as Dictionary,
  en: async () => (await import("./dictionaries/en")).en,
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return (DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE])();
}

export * from "./config";
