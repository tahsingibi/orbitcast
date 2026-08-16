/**
 * `.env.local` ve `.env` dosyalarını process.env'e yükler.
 *
 * Next uygulaması bunu kendisi yapıyor ama script'ler Next'in dışında
 * çalışıyor. Zaten tanımlı olan değişkenler ezilmez: kabuktan verilen değer
 * her zaman dosyadakinden önceliklidir.
 */

import { readFileSync } from "node:fs";

/** Tırnakları soyar, satır sonu kaçışlarını çözer. */
function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\n/g, "\n");
  }
  return trimmed;
}

export function loadEnv(root) {
  for (const file of [".env.local", ".env"]) {
    let text;
    try {
      text = readFileSync(`${root}/${file}`, "utf8");
    } catch {
      continue;
    }

    for (const line of text.split("\n")) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=(.*)$/i);
      if (!match) continue;
      const [, key, raw] = match;
      if (process.env[key] === undefined) process.env[key] = unquote(raw);
    }
  }
}

/**
 * Değişkenleri bir .env metnine işler ve yeni metni döndürür.
 *
 * Var olan satır yerinde güncellenir, yoksa sona eklenir; kullanıcının kendi
 * yorumları ve sıralaması korunur. Kurulum sihirbazı bu fonksiyonla mevcut
 * `.env.local` dosyasının üstüne yazdığı için davranışı testle sabitlenmiştir.
 */
export function applyEnv(text, values) {
  let out = text;

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(out)) {
      out = out.replace(pattern, line);
      continue;
    }
    // Boş dosyada başa boş satır atmamak için: içerik varsa tek satır sonuyla
    // ayır, yoksa doğrudan yaz.
    const base = out.replace(/\s+$/, "");
    out = base ? `${base}\n${line}\n` : `${line}\n`;
  }

  return out;
}

/**
 * Upstash panelinden yapıştırılan satırı değere indirger.
 *
 * Panel bilgileri `ANAHTAR="değer"` biçiminde, iki satırlık bir blok olarak
 * kopyalatıyor. Kullanıcı bloğu olduğu gibi yapıştırdığında satırın tamamı
 * cevap oluyordu ve hata ancak ilk Redis çağrısında ortaya çıkıyordu.
 *
 * Ön ek yalnızca gerçekten bir değişken adına benziyorsa (büyük harf ve en az
 * bir alt çizgi) ve arkasında bir değer varsa atılır — base64 token'ların
 * sonundaki `=` dolgusu yanlışlıkla ön ek sanılmasın.
 */
export function cleanPastedValue(raw) {
  let value = String(raw).trim();

  const assignment = value.match(/^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\s*=\s*(\S.*)$/);
  if (assignment) value = assignment[2].trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return value.trim();
}
