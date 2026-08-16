/**
 * Script'lerin playlist deposuna eriştiği tek kapı.
 *
 * Bunun ayrı bir modül olmasının sebebi somut bir hata: script'ler her zaman
 * `data/playlist.json` dosyasına yazıyordu, oysa site Redis'ten okuyordu.
 * Panelden silinen parçalar dosyada durduğu için "sildiğim şarkılar geri
 * geliyor" gibi görünüyordu. Artık ikisi de *aynı* aktif depoyu kullanıyor.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadEnv } from "./env.mjs";

const REDIS_KEY = "radio:playlist";

export const ROOT = path.resolve(import.meta.dirname, "..", "..");
export const PLAYLIST_PATH = path.join(ROOT, "data", "playlist.json");

loadEnv(ROOT);

/**
 * Belgenin nerede saklandığı. Uygulamadaki resolveStoreKind ile aynı kural.
 *
 * YouTube burada yok: o bir depo değil, bir yayın kaynağı. YouTube'dan yayın
 * yapan bir kurulumda da istasyon kimliği ve yedek liste bir yerde durur.
 */
export function storeKind() {
  const explicit = process.env.RADIO_SOURCE?.trim().toLowerCase();
  if (explicit === "redis") return "redis";
  if (explicit === "file") return "file";
  return process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? "redis"
    : "file";
}

export function storeLabel() {
  return storeKind() === "redis" ? "Upstash Redis" : "data/playlist.json";
}

/** Yayın hangi listeden çıkıyor? Belgedeki seçim, yoksa ortam değişkeni. */
export function broadcastSource(doc) {
  if (doc?.pinnedSource) return doc.pinnedSource;
  const explicit = process.env.RADIO_SOURCE?.trim().toLowerCase();
  if (explicit === "youtube") return "youtube";
  if (!explicit && process.env.YOUTUBE_PLAYLIST_URL?.trim()) return "youtube";
  return storeKind();
}

async function getRedis() {
  const { Redis } = await import("@upstash/redis");
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

/**
 * Redis çağrılarını okunabilir bir hataya sarar.
 *
 * Uygulama bir Redis arızasında yedek listeye düşebiliyor ama script'in
 * düşecek yeri yok: yanlış depoya yazmaktansa durup sebebi söylemeli.
 * Sarmalanmazsa kullanıcı ham bir UpstashError yığın izi görüyor.
 */
async function withRedis(operation) {
  try {
    const redis = await getRedis();
    return await operation(redis);
  } catch (err) {
    const wrapped = new Error("REDIS_UNREACHABLE");
    wrapped.cause = err;
    throw wrapped;
  }
}

/** Alanları sabit sırada tutar ki dosya diff'leri okunabilir kalsın. */
export function orderDoc(doc) {
  const out = {
    name: doc.name,
    tagline: doc.tagline,
    shareTagline: doc.shareTagline,
    epoch: doc.epoch,
    tracks: (doc.tracks ?? []).map((t) => {
      const track = {
        videoId: t.videoId,
        title: t.title,
        artist: t.artist,
        durationSec: t.durationSec,
        thumbnail: t.thumbnail,
        url: t.url,
      };
      // Yalnızca yerel parçalarda anlamlı olan alanları boşuna yazmıyoruz.
      if (t.kind === "audio") {
        track.kind = "audio";
        track.src = t.src;
      }
      return track;
    }),
  };
  if (doc.updatedAt) out.updatedAt = doc.updatedAt;
  if (doc.pinnedSource) out.pinnedSource = doc.pinnedSource;
  if (doc.youtubePlaylistUrl) out.youtubePlaylistUrl = doc.youtubePlaylistUrl;
  return out;
}

export async function readFileDoc() {
  return JSON.parse(await readFile(PLAYLIST_PATH, "utf8"));
}

export async function writeFileDoc(doc) {
  await writeFile(PLAYLIST_PATH, `${JSON.stringify(orderDoc(doc), null, 2)}\n`, "utf8");
}

/**
 * Aktif depodaki listeyi okur.
 *
 * Redis boşsa (ilk çalıştırma) repo'daki dosya tohum listedir — uygulamanın
 * yaptığının aynısı.
 */
export async function readDoc() {
  if (storeKind() !== "redis") return readFileDoc();

  const stored = await withRedis((redis) => redis.get(REDIS_KEY));
  if (stored && Array.isArray(stored.tracks)) return stored;
  return readFileDoc();
}

/**
 * Aktif depoya yazar.
 *
 * `youtube` modunda yayının parça listesi YouTube'da; burada yazılan dosya
 * istasyon kimliğini (ad, slogan, epoch) ve YouTube'a ulaşılamadığında devreye
 * giren yedek listeyi tutar.
 */
export async function writeDoc(doc) {
  const kind = storeKind();
  const next = { ...orderDoc(doc), updatedAt: new Date().toISOString() };

  if (kind === "redis") {
    await withRedis((redis) => redis.set(REDIS_KEY, next));
    await mirrorToBackup(next);
  } else {
    await writeFile(PLAYLIST_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  }

  return next;
}

/**
 * Redis'e yazılanı repodaki yedek dosyaya da yazar.
 *
 * Böylece bir sonraki deploy'da yedek liste canlı listeyle aynı oluyor; Redis'e
 * bir şey olduğunda yayın aylar öncesinin listesine düşmüyor. Bu iş yalnızca
 * CLI'de yapılıyor — panel sunucuda çalışıyor ve orada dosya sistemi salt
 * okunur.
 *
 * Kaynak seçimi kopyalanmıyor: yedek dosya `pinnedSource` taşısaydı, yedeğe
 * düşen yayın oradan tekrar başka bir kaynağa yönlenirdi.
 */
async function mirrorToBackup(doc) {
  const backup = orderDoc({ ...doc, pinnedSource: undefined, youtubePlaylistUrl: undefined });

  try {
    await writeFile(PLAYLIST_PATH, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  } catch (err) {
    // Redis yazımı başarılı; yedek kopyalanamadıysa komutu düşürmek yerine
    // uyarmak doğru — canlı liste zaten güncellendi.
    console.warn(`  ! yedek liste güncellenemedi: ${err.message}`);
  }
}
