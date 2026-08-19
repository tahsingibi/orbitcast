/**
 * Bir klasördeki ses dosyalarını yayına hazır parçalara çevirir.
 *
 * Dosyalar yapılandırılmış depoya yazılır (`src/lib/storage`): varsayılan
 * `public/audio/`, R2 tanımlıysa oraya. Parçanın `src` alanı deponun döndürdüğü
 * adres oluyor, o yüzden geri kalan hiçbir yerin depoyu bilmesi gerekmiyor.
 * Başlık, sanatçı ve kapak varsa ID3 etiketlerinden, yoksa dosya adından
 * türetilir.
 *
 * Süre burada kritik: senkronizasyonun tamamı ona dayanıyor. Süresi
 * okunamayan dosya sessizce atlanır, listeyi bozmasına izin verilmez.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { fromFilename, normalizeFolderPath, slugify } from "../../src/lib/audio-meta.ts";
import { contentTypeFor, resolveStorage } from "../../src/lib/storage/index.ts";
import { readAudioFile } from "../../src/lib/mp3.mjs";
import { ROOT } from "./store.mjs";

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".flac"]);

// Yazma işini artık depo yapıyor; bu yol yalnızca "dosya zaten hedefinde mi"
// sorusunu cevaplamak için duruyor.
const AUDIO_DIR = path.join(ROOT, "public", "audio");

// Kimlik ve ad çözümleme paneldeki yüklemeyle ortak: aynı dosya iki yoldan da
// eklense aynı kimliği almalı, yoksa depoda ikinci bir kopya oluşur.
export { slugify };

/** MIME'den depo uzantısı; kapak neyse o uzantıyla saklanmalı. */
function coverExtension(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
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
  const resolved = path.resolve(normalizeFolderPath(folder));

  const info = await stat(resolved).catch(() => null);
  if (!info?.isDirectory()) throw new Error("AUDIO_FOLDER_NOT_FOUND");

  const files = await collectFiles(resolved);
  if (files.length === 0) throw new Error("AUDIO_FOLDER_EMPTY");

  const storage = resolveStorage();

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
    const key = `${id}${extension}`;
    const data = await readFile(file);

    // Yerel depoda dosya zaten hedefindeyse üzerine yazmanın anlamı yok.
    const inPlace =
      storage.kind === "local" && path.resolve(file) === path.join(AUDIO_DIR, key);

    const src = inPlace
      ? `/audio/${key}`
      : await storage.put({ key, body: data, contentType: contentTypeFor(key) });

    let thumbnail = "";
    if (meta.picture) {
      const coverKey = `covers/${id}.${coverExtension(meta.picture.mime)}`;
      thumbnail = await storage.put({
        key: coverKey,
        body: meta.picture.data,
        contentType: contentTypeFor(coverKey),
      });
    }

    existing.add(id);
    bytes += data.length;

    tracks.push({
      kind: "audio",
      videoId: id,
      src,
      title,
      artist,
      durationSec: Math.round(meta.durationSec),
      thumbnail,
      url: "",
    });
  }

  return { tracks, skipped, bytes, storage: storage.kind };
}
