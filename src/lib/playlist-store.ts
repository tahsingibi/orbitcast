import "server-only";

import { Redis } from "@upstash/redis";

import seed from "../../data/playlist.json";
import type { PlaylistSource, Track } from "./radio";
import { resolvePlaylistTracks } from "./youtube-metadata";

/**
 * Yayın listesinin nereden okunacağı.
 *
 * Üç kurulum biçimi var; hangisinin geçerli olduğunu ortam değişkenleri
 * belirler ve `storeKind` ile dışa açılır:
 *
 *   redis    — Upstash Redis. Panelden düzenlenir, deploy gerekmez.
 *   file     — data/playlist.json. Panelden düzenlenir, değişiklik commit'lenir.
 *   youtube  — Doğrudan bir YouTube playlist'i. Listeyi YouTube'da yönetirsiniz;
 *              panel salt okunur, hiçbir depoya ihtiyaç yoktur.
 *
 * Buna ek olarak okuma anında iki geçici durum oluşabilir:
 *
 *   pinned   — Yönetici bilinçli olarak yedek listeye geçmiş.
 *   fallback — Asıl kaynağa ulaşılamıyor (kota bitti, kimlik hatası, kesinti).
 *              Yayın kesilmez; repo'daki liste devreye girer.
 *
 * Son durum kritik: Upstash ücretsiz katmanının komut kotası dolduğunda okuma
 * hata fırlatır. Bu yakalanmazsa site komple çöker. Yakalanınca radyo çalmaya
 * devam eder, yalnızca düzenleme kapanır.
 */

/**
 * Paylaşım kartlarının altındaki cümlenin varsayılanı.
 *
 * İstasyon kendi metnini belirleyene kadar geçerli; `npm run radio:setup` ve admin
 * paneli bunu ilk fırsatta sorar. Şablon İngilizce dağıtıldığı için varsayılan
 * da İngilizce.
 *
 * Uzunluk kaza değil: paylaşım kartındaki satır ~45 karakterden sonra ikiye
 * bölünüyor ve kartın dengesi bozuluyor.
 */
export const DEFAULT_SHARE_TAGLINE = "Everyone hears the same thing right now";

export type PlaylistDoc = {
  name: string;
  tagline: string;
  /** Paylaşım kartlarında (OpenGraph) görünen alt metin. */
  shareTagline: string;
  /** Yayının kavramsal başlangıcı. Değişirse tüm akış kayar. */
  epoch: string;
  tracks: Track[];
  updatedAt: string;
  /**
   * Yöneticinin panelden seçtiği yayın kaynağı.
   *
   * Boşsa ortam değişkenlerinden gelen varsayılan geçerli. Bu alan sayesinde
   * kaynak değiştirmek için deploy almak gerekmiyor.
   */
  pinnedSource?: BroadcastSource;
  /** `pinnedSource === "youtube"` iken yayınlanacak liste. */
  youtubePlaylistUrl?: string;
};

/**
 * Yayının hangi listeden çıktığı.
 *
 *   redis   — depodaki liste (panelden düzenlenir)
 *   file    — repodaki data/playlist.json (yedek liste)
 *   youtube — doğrudan bir YouTube playlist'i
 *
 * Bu, `storeKind` ile aynı şey değil: depo listenin *nerede saklandığı*,
 * bu ise *hangisinin yayında olduğu*. Redis'te saklanan bir kurulum pekâlâ
 * YouTube'dan yayın yapabilir.
 */
export type BroadcastSource = "redis" | "file" | "youtube";

export type PlaylistRead = {
  doc: PlaylistDoc;
  source: PlaylistSource;
  /** `fallback` durumunda sebebi; panelde gösterilir, herkese açık API'ye sızmaz. */
  error?: string;
};

const REDIS_KEY = "radio:playlist";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const youtubePlaylist = process.env.YOUTUBE_PLAYLIST_URL?.trim();

/** Playlist belgesinin nerede saklandığı. */
export type StoreKind = "redis" | "file";

const envSource = process.env.RADIO_SOURCE?.trim().toLowerCase();

/**
 * Belge nerede duruyor?
 *
 * Yalnızca Upstash bilgilerine bakar. `RADIO_SOURCE=youtube` bir depo değil,
 * bir *yayın kaynağı* seçimidir: o kurulumda da istasyon kimliği ve yedek
 * liste bir yerde saklanmak zorunda.
 */
function resolveStoreKind(): StoreKind {
  if (envSource === "redis") return "redis";
  if (envSource === "file") return "file";
  return redisUrl && redisToken ? "redis" : "file";
}

export const storeKind: StoreKind = resolveStoreKind();

/**
 * Panelde bir seçim yapılmamışsa geçerli olan kaynak.
 *
 * `RADIO_SOURCE=youtube` ya da yalnızca `YOUTUBE_PLAYLIST_URL` tanımlamak,
 * panele hiç girmeden YouTube'dan yayın yapmaya yetiyor.
 */
const defaultSource: BroadcastSource | undefined =
  envSource === "youtube" || (!envSource && youtubePlaylist) ? "youtube" : undefined;

let redis: Redis | null = null;
function getRedis(): Redis {
  redis ??= new Redis({ url: redisUrl!, token: redisToken! });
  return redis;
}

function seedDoc(): PlaylistDoc {
  return {
    name: seed.name,
    tagline: seed.tagline,
    shareTagline: (seed as { shareTagline?: string }).shareTagline || DEFAULT_SHARE_TAGLINE,
    epoch: seed.epoch,
    tracks: seed.tracks as Track[],
    updatedAt: new Date(0).toISOString(),
  };
}

/** Deponun döndürdüğü ham veriyi güvenli bir PlaylistDoc'a indirger. */
function normalize(raw: unknown): PlaylistDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as Partial<PlaylistDoc>;
  if (!Array.isArray(doc.tracks)) return null;

  const fallback = seedDoc();
  return {
    name: doc.name || fallback.name,
    tagline: doc.tagline || fallback.tagline,
    // Alan sonradan eklendi; eski kayıtlarda yoksa varsayılana düşer.
    shareTagline: doc.shareTagline || fallback.shareTagline,
    epoch: doc.epoch || fallback.epoch,
    updatedAt: doc.updatedAt || fallback.updatedAt,
    pinnedSource:
      doc.pinnedSource === "file" || doc.pinnedSource === "youtube" || doc.pinnedSource === "redis"
        ? doc.pinnedSource
        : undefined,
    youtubePlaylistUrl:
      typeof doc.youtubePlaylistUrl === "string" && doc.youtubePlaylistUrl.trim()
        ? doc.youtubePlaylistUrl.trim()
        : undefined,
    tracks: doc.tracks.filter((t) => t && t.videoId && t.durationSec > 0),
  };
}

// --- Yerel dosya arka ucu ----------------------------------------------------

// import.meta.url derleme çıktısının içini gösterdiği için proje köküne
// çalışma dizininden gidiyoruz.
const FILE_PATH = `${process.cwd()}/data/playlist.json`;

async function readFromFile(): Promise<PlaylistDoc> {
  try {
    const { readFile } = await import("node:fs/promises");
    return normalize(JSON.parse(await readFile(FILE_PATH, "utf8"))) ?? seedDoc();
  } catch {
    // Serverless ortamlarında dosya paketlenmemiş olabilir; gömülü kopyaya düş.
    return seedDoc();
  }
}

async function writeToFile(doc: PlaylistDoc): Promise<void> {
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(FILE_PATH, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  } catch {
    throw new Error("storeReadOnly");
  }
}

// --- Canlı YouTube playlist arka ucu -----------------------------------------

/**
 * Listeyi doğrudan YouTube'dan okur. Hiçbir depo, hiçbir panel gerekmez:
 * YouTube'daki playlist'i düzenlersiniz, yayın en geç bir TTL sonra uyar.
 *
 * İstasyon kimliği (ad, slogan, epoch) yine data/playlist.json'dan gelir —
 * YouTube o bilgileri taşımıyor. Oradaki `tracks` alanı bu modda yalnızca
 * yedek liste olarak kullanılır.
 */
const PLAYLIST_TTL_MS =
  Math.max(30, Number(process.env.RADIO_PLAYLIST_TTL_SEC) || 300) * 1000;

let youtubeCache: { doc: PlaylistDoc; at: number; url: string; signature: string } | null = null;

/** Parça listesinin içeriğinden kısa, kararlı bir imza üretir (FNV-1a). */
function fingerprint(tracks: Track[]): string {
  let hash = 0x811c9dc5;
  for (const track of tracks) {
    for (const ch of `${track.videoId}:${track.durationSec};`) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(36);
}

async function readFromYouTube(url: string, identity: PlaylistDoc): Promise<PlaylistDoc> {
  if (youtubeCache && youtubeCache.url === url && Date.now() - youtubeCache.at < PLAYLIST_TTL_MS) {
    return { ...youtubeCache.doc, ...identityOf(identity) };
  }

  const tracks = await resolvePlaylistTracks(url);
  const signature = fingerprint(tracks);

  // updatedAt yalnızca liste gerçekten değişince ilerliyor; böylece istemciler
  // her tazelemede boşuna yeniden yüklenmez. İmza `updatedAt`in içine
  // gömülmüyor: orası bir tarih ve panelde tarih olarak biçimlendiriliyor.
  const unchanged = youtubeCache?.signature === signature;
  const doc: PlaylistDoc = {
    ...identity,
    tracks,
    updatedAt: unchanged ? youtubeCache!.doc.updatedAt : new Date().toISOString(),
  };

  youtubeCache = { doc, at: Date.now(), url, signature };
  return doc;
}

/** Yayınla birlikte taşınan, listeden bağımsız alanlar. */
function identityOf(doc: PlaylistDoc) {
  return {
    name: doc.name,
    tagline: doc.tagline,
    shareTagline: doc.shareTagline,
    epoch: doc.epoch,
    pinnedSource: doc.pinnedSource,
    youtubePlaylistUrl: doc.youtubePlaylistUrl,
  };
}

// --- Genel API ---------------------------------------------------------------

/**
 * Belgeyi deposundan okur. Depo Redis ise ilk çalıştırmada dosyayla tohumlanır.
 */
async function readDoc(): Promise<PlaylistDoc> {
  if (storeKind === "file") return readFromFile();

  const stored = normalize(await getRedis().get(REDIS_KEY));
  if (stored) return stored;

  const initial = { ...seedDoc(), updatedAt: new Date().toISOString() };
  await getRedis().set(REDIS_KEY, initial);
  return initial;
}

/** Panelde seçim yoksa ortamdan gelen varsayılana, o da yoksa depoya düşer. */
function effectiveSource(doc: PlaylistDoc): BroadcastSource {
  return doc.pinnedSource ?? defaultSource ?? storeKind;
}

/**
 * Yayına girecek listeyi çözer.
 *
 * Akış tek yönlü: önce belge okunur (kimlik ve seçimler oradadır), sonra
 * seçilen kaynak *maddeleştirilir*. Kaynak ne olursa olsun hata hâlinde
 * repodaki liste devreye girer — yayının susması en kötü sonuç.
 */
export async function readPlaylist(): Promise<PlaylistRead> {
  let doc: PlaylistDoc;
  try {
    doc = await readDoc();
  } catch (err) {
    // Depoya hiç ulaşılamıyor (kota, kimlik, kesinti).
    return { doc: await readFromFile(), source: "fallback", error: (err as Error).message };
  }

  const source = effectiveSource(doc);

  if (source === "youtube") {
    const url = doc.youtubePlaylistUrl ?? youtubePlaylist;
    try {
      if (!url) throw new Error("playlistNotConfigured");
      return { doc: await readFromYouTube(url, doc), source: "youtube" };
    } catch (err) {
      const file = await readFromFile();
      return {
        doc: { ...file, ...identityOf(doc), updatedAt: doc.updatedAt },
        source: "fallback",
        error: (err as Error).message,
      };
    }
  }

  if (source === "file" && storeKind !== "file") {
    // Yedek liste yayında. updatedAt belgeden geliyor ki moda geçiş
    // istemcilere sürüm değişikliği olarak ulaşsın.
    const file = await readFromFile();
    return {
      doc: { ...file, ...identityOf(doc), updatedAt: doc.updatedAt },
      source: "pinned",
    };
  }

  return { doc, source: storeKind };
}

export async function writePlaylist(
  doc: Omit<PlaylistDoc, "updatedAt">,
): Promise<PlaylistDoc> {
  const next: PlaylistDoc = { ...doc, updatedAt: new Date().toISOString() };

  if (storeKind === "file") await writeToFile(next);
  else await getRedis().set(REDIS_KEY, next);

  return next;
}

/** Belgenin yalnızca ayar alanlarını günceller; parça listesine dokunmaz. */
async function patchDoc(patch: Partial<PlaylistDoc>): Promise<void> {
  const current = await readDoc();
  const next: PlaylistDoc = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  if (storeKind === "file") await writeToFile(next);
  else await getRedis().set(REDIS_KEY, next);
}

/**
 * Yayının hangi listeden çıkacağını belirler.
 *
 * Her seçim, seçilebilir *olduğu* doğrulandıktan sonra kaydedilir: boş bir
 * yedeğe ya da adresi olmayan bir YouTube listesine geçmek yayını susturur.
 */
export async function setBroadcastSource(
  source: BroadcastSource,
  youtubePlaylistUrl?: string,
): Promise<void> {
  if (source === "file") {
    const backup = await readFromFile();
    if (backup.tracks.length === 0) throw new Error("backupPlaylistEmpty");
  }

  if (source === "youtube") {
    const url = youtubePlaylistUrl?.trim() || (await readDoc()).youtubePlaylistUrl || youtubePlaylist;
    if (!url) throw new Error("playlistUrlMissing");

    // Adresi kaydetmeden önce gerçekten okunabildiğini doğruluyoruz; aksi
    // hâlde yayın, hatası ancak dinleyicide görülen bir listeye geçerdi.
    const tracks = await resolvePlaylistTracks(url).catch(() => null);
    if (!tracks?.length) throw new Error("playlistUnreadable");

    youtubeCache = null;
    await patchDoc({ pinnedSource: "youtube", youtubePlaylistUrl: url });
    return;
  }

  await patchDoc({ pinnedSource: source });
}

/**
 * Yayındaki listeyi repodaki yedek dosyaya kopyalar.
 *
 * Yedeğin var olmasının tek yolu buydu ve yalnızca komut satırından
 * yapılabiliyordu. Dosya sistemi yazılabilir değilse (Vercel gibi) `writeToFile`
 * zaten `storeReadOnly` fırlatır.
 */
export async function copyLiveToBackup(): Promise<number> {
  const { doc } = await readPlaylist();
  if (doc.tracks.length === 0) throw new Error("livePlaylistEmpty");

  const file = await readFromFile();

  // Depo Redis ise dosya saf bir yedektir ve kaynak seçimi taşımamalı — aksi
  // hâlde yedeğe düşen yayın oradan tekrar YouTube'a yönlenirdi.
  //
  // Depo dosyanın kendisiyse durum tersine döner: ayarlar da o dosyada duruyor,
  // temizlemek kullanıcının kaynak seçimini sessizce silmek olur.
  const config =
    storeKind === "file"
      ? { pinnedSource: doc.pinnedSource, youtubePlaylistUrl: doc.youtubePlaylistUrl }
      : { pinnedSource: undefined, youtubePlaylistUrl: undefined };

  await writeToFile({
    ...file,
    name: doc.name,
    tagline: doc.tagline,
    shareTagline: doc.shareTagline,
    epoch: doc.epoch,
    tracks: doc.tracks,
    updatedAt: new Date().toISOString(),
    ...config,
  });

  return doc.tracks.length;
}
