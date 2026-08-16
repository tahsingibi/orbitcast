/**
 * Bir klasördeki ses dosyalarını yayına hazır parçalara çevirir.
 *
 * Dosyalar `public/audio/` altına kopyalanır — çünkü yayınlanabilmeleri için
 * repoda olmaları gerekir. Başlık, sanatçı ve kapak varsa ID3 etiketlerinden,
 * yoksa dosya adından türetilir.
 *
 * Süre burada kritik: senkronizasyonun tamamı ona dayanıyor. Süresi
 * okunamayan dosya sessizce atlanır, listeyi bozmasına izin verilmez.
 */

import { copyFile, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { readAudioFile } from "./mp3.mjs";
import { ROOT } from "./store.mjs";

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".flac"]);

const PUBLIC_DIR = path.join(ROOT, "public");
const AUDIO_DIR = path.join(PUBLIC_DIR, "audio");
const COVER_DIR = path.join(AUDIO_DIR, "covers");

const TR_MAP = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** Dosya adından adres güvenli, kararlı bir kimlik üretir. */
export function slugify(value) {
  const lowered = String(value)
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîû]/g, (ch) => TR_MAP[ch] ?? ch);

  return (
    lowered
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "parca"
  );
}

/** "Ceza - Suspus.mp3" -> { artist: "Ceza", title: "Suspus" } */
function fromFilename(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/^\d+[\s.\-_]+/, "");
  const split = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (split) return { artist: split[1].trim(), title: split[2].trim() };
  return { artist: "", title: base.trim() };
}

async function collectFiles(dir) {
  const found = [];

  const walk = async (current) => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    // Sıralı okuma, listenin klasördeki alfabetik sırayı korumasını sağlıyor.
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, "tr"))) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(full);
    }
  };

  await walk(dir);
  return found;
}

/**
 * Klasörü tarar ve parçaları döndürür.
 *
 * @param folder   Taranacak klasör.
 * @param existing Zaten listede olan kimlikler; tekrar eklenmez.
 * @param onProgress İsteğe bağlı ilerleme geri çağrısı.
 */
export async function importAudioFolder(folder, existing = new Set(), onProgress) {
  const resolved = path.resolve(folder.replace(/^~/, process.env.HOME ?? "~"));

  const info = await stat(resolved).catch(() => null);
  if (!info?.isDirectory()) throw new Error("AUDIO_FOLDER_NOT_FOUND");

  const files = await collectFiles(resolved);
  if (files.length === 0) throw new Error("AUDIO_FOLDER_EMPTY");

  await mkdir(AUDIO_DIR, { recursive: true });

  const tracks = [];
  const skipped = [];
  let bytes = 0;
  let done = 0;

  for (const file of files) {
    const fileName = path.basename(file);
    onProgress?.(++done, files.length, fileName);

    let meta;
    try {
      meta = await readAudioFile(file);
    } catch (err) {
      skipped.push({ name: fileName, reason: err.message });
      continue;
    }

    const guessed = fromFilename(fileName);
    const title = meta.title || guessed.title;
    const artist = meta.artist || guessed.artist || meta.album || "Bilinmeyen sanatçı";

    // Kimlik dosya adından türüyor: aynı dosya ikinci kez taranırsa aynı
    // kimliği alır ve tekrar eklenmez.
    const id = slugify(fileName.replace(/\.[^.]+$/, ""));
    if (existing.has(id)) {
      skipped.push({ name: fileName, reason: "zaten listede" });
      continue;
    }

    const extension = path.extname(file).toLowerCase();
    const target = path.join(AUDIO_DIR, `${id}${extension}`);

    // Zaten public/audio içindeyse kopyalamaya gerek yok.
    if (path.resolve(file) !== target) await copyFile(file, target);

    let thumbnail = "";
    if (meta.picture) {
      await mkdir(COVER_DIR, { recursive: true });
      const coverExt = meta.picture.mime === "image/png" ? "png" : "jpg";
      await writeFile(path.join(COVER_DIR, `${id}.${coverExt}`), meta.picture.data);
      thumbnail = `/audio/covers/${id}.${coverExt}`;
    }

    existing.add(id);
    bytes += (await stat(target)).size;

    tracks.push({
      kind: "audio",
      videoId: id,
      src: `/audio/${id}${extension}`,
      title,
      artist,
      durationSec: Math.round(meta.durationSec),
      thumbnail,
      url: "",
    });
  }

  return { tracks, skipped, bytes };
}
