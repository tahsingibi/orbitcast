/**
 * Dosya adından parça kimliği ve metası türetme.
 *
 * Hem CLI içe aktarımı hem de panelden yükleme aynı kuralları kullanmak
 * zorunda: aynı dosya iki yoldan da eklense aynı kimliği almalı, yoksa depoda
 * ikinci bir kopya oluşur ve liste ikizlenir.
 */

const TR_MAP: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/** Dosya adından adres güvenli, kararlı bir kimlik üretir. */
export function slugify(value: string): string {
  const lowered = String(value)
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (ch) => TR_MAP[ch] ?? ch);

  return (
    lowered
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "parca"
  );
}

/** "Ceza - Suspus.mp3" -> { artist: "Ceza", title: "Suspus" } */
export function fromFilename(fileName: string): { artist: string; title: string } {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/^\d+[\s.\-_]+/, "");
  const split = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (split) return { artist: split[1].trim(), title: split[2].trim() };
  return { artist: "", title: base.trim() };
}

/**
 * Terminale yapıştırılan ya da Finder'dan sürüklenen klasör yolunu temizler.
 *
 * Finder'dan sürüklemek yolu olduğu gibi vermiyor: kabuğa güvenli hâlde
 * yazıyor. Terminal.app boşlukları ters bölü ile kaçırıyor
 * (`/Users/x/orbit\ mp3`), iTerm ve bazı kabuklar tümünü tırnağa alıyor
 * (`'/Users/x/orbit mp3'`). İkisi de ham hâlde geçerli bir yol değil —
 * tırnaklı olan göreli sayılıp çalışma dizinine ekleniyor ve "klasör
 * bulunamadı" hatası veriyordu. Sürükle-bırak en doğal kullanım olduğu için
 * bunu kabul etmek gerekiyor.
 */
export function normalizeFolderPath(input: string): string {
  let value = String(input).trim();

  // Tırnaklıysa içerik zaten birebir yol; ters bölüler kaçış değil, gerçek.
  const quoted =
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'));

  if (quoted && value.length >= 2) {
    value = value.slice(1, -1);
  } else {
    // Tırnaksızsa kabuk kaçışları çözülüyor: "\ " -> " ", "\(" -> "(" …
    value = value.replace(/\\(.)/g, "$1");
  }

  value = value.trim();
  if (value === "~") return process.env.HOME ?? value;
  if (value.startsWith("~/")) return `${process.env.HOME ?? "~"}${value.slice(1)}`;
  return value;
}
