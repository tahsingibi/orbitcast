/**
 * `src/lib/site.ts` üzerinde güvenli düzenleme.
 *
 * Künye bilgileri ortam değişkeninde değil kaynak dosyada duruyor (yapılı ve
 * çoğalabilen veri), yani hem kurulum hem sıfırlama o dosyaya dokunmak
 * zorunda. Dosyayı **yeniden yazmak yerine yalnızca değerleri değiştiriyoruz**:
 * hazır bir şablonla değiştirmek bir kez `baseUrl()` fonksiyonunu düşürüp
 * uygulamayı derlenemez hâle getirmişti.
 *
 * Her yazma öncesi `export` sayısı karşılaştırılıyor; değiştiyse dosyaya
 * dokunulmuyor. Bozuk bir kaynak dosya bırakmaktansa işlemi atlamak iyidir.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ROOT } from "./store.mjs";

export const SITE_PATH = path.join(ROOT, "src", "lib", "site.ts");

export async function readSite() {
  return readFile(SITE_PATH, "utf8");
}

/** Dosyanın dışa açtığı şeyler korunuyor mu? */
function sameShape(before, after) {
  const exportsOf = (value) => (value.match(/^export /gm) ?? []).length;
  return exportsOf(before) === exportsOf(after);
}

export async function writeSite(before, after) {
  if (!sameShape(before, after)) throw new Error("dosya yapısı korunamadı");
  await writeFile(SITE_PATH, after, "utf8");
}

/** Tek satırlık bir metin alanının değerini değiştirir. */
export function setField(text, key, value) {
  const pattern = new RegExp(`(\\b${key}:\\s*)"[^"]*"`);
  if (!pattern.test(text)) return text;
  // JSON.stringify kaçışları da hallediyor: tırnaklı bir adres alanı bozmasın.
  return text.replace(pattern, `$1${JSON.stringify(String(value))}`);
}

/** Mevcut değeri okur; yoksa boş metin. */
export function getField(text, key) {
  return text.match(new RegExp(`\\b${key}:\\s*"([^"]*)"`))?.[1] ?? "";
}

/**
 * Künyedeki kişisel değerleri boşaltır.
 *
 * `author` bloğundaki `name`/`url`, sosyal hesaplar ve iletişim adresi. Bloğu
 * ayrı ele alıyoruz: `url` anahtarı sosyal hesap girdilerinde de geçiyor.
 */
export function blankSite(text) {
  let out = text;

  out = out.replace(/(author:\s*\{)([\s\S]*?)(\n\s*\},)/, (_all, open, body, close) => {
    const cleaned = body
      .replace(/(\bname:\s*)"[^"]*"/, '$1""')
      .replace(/(\burl:\s*)"[^"]*"/, '$1""')
      .replace(/(\bhandle:\s*)"[^"]*"/, '$1""');
    return open + cleaned + close;
  });

  out = out.replace(/(socials:\s*)\[[\s\S]*?\](\s*as\s+ReadonlyArray)/, "$1[]$2");
  out = setField(out, "contactEmail", "");
  out = setField(out, "stationUrl", "");

  return out;
}
