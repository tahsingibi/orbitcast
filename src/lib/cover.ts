/**
 * Kapak görsellerini kendi depona taşır.
 *
 * Neden gerekli: yerel dosyalardan yayın yaptığında sesler senin deponda ama
 * kapaklar YouTube'un CDN'inde kalıyor (`i.ytimg.com/...`). Bu üç şeyi
 * bozuyor — yayın hâlâ YouTube'a bağımlı kalıyor, video silinirse kapak
 * kayboluyor ve `next/image` yapılandırmasında ayrı bir izin gerekiyor.
 *
 * Buradaki iş tek cümle: adresi al, görseli indir, depoya koy, yeni adresi
 * döndür. Böylece "kendi radyon" gerçekten kendi radyon oluyor.
 */

import type { Track } from "./radio.ts";
import { contentTypeFor, isStoredUrl, type AudioStorage } from "./storage/index.ts";
import { extractVideoId } from "./youtube-metadata.ts";

/** Fazlası kapak değil, kazadır. */
const MAX_COVER_BYTES = 8 * 1024 * 1024;

/**
 * YouTube kapakları, kaliteden düşüğe.
 *
 * `maxresdefault` ve `sddefault` her videoda bulunmuyor; olmayanlar 404
 * döndüğü için sırayla deneyip ilk tutanı alıyoruz. `hqdefault` neredeyse her
 * zaman var, o yüzden en sonda güvenli liman olarak duruyor.
 */
export function youtubeThumbnailCandidates(videoId: string): string[] {
  return ["maxresdefault", "sddefault", "hqdefault"].map(
    (quality) => `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`,
  );
}

/**
 * Kullanıcının verdiği adresi denenecek kapak adreslerine çevirir.
 *
 * YouTube linki verildiyse kalite merdiveni kuruluyor; başka her şey doğrudan
 * görsel adresi sayılıyor. Böylece panelde tek bir alan hem "şu videonun
 * kapağını al" hem "şu görseli kullan" için yetiyor.
 */
export function coverCandidates(input: string): string[] {
  const value = input.trim();
  if (!value) return [];

  const videoId = extractVideoId(value);
  if (videoId) return youtubeThumbnailCandidates(videoId);

  return /^https?:\/\//i.test(value) ? [value] : [];
}

export type FetchedCover = { data: Uint8Array; extension: string };

/**
 * İlk çalışan adresten görseli indirir.
 *
 * İçerik tipi doğrulanıyor: 404 sayfaları ve HTML hata çıktıları da 200
 * dönebiliyor, kontrol edilmezse depoya kapak diye bir metin dosyası girer.
 */
export async function fetchCover(candidates: string[]): Promise<FetchedCover | null> {
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;

      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!type.startsWith("image/")) continue;

      const data = new Uint8Array(await res.arrayBuffer());
      if (data.length === 0 || data.length > MAX_COVER_BYTES) continue;

      return { data, extension: type.includes("png") ? ".png" : ".jpg" };
    } catch {
      // Ağ hatası: sıradaki adayı dene.
    }
  }

  return null;
}

/**
 * Kapağı indirip depoya koyar ve yeni adresini döndürür.
 *
 * Başarısızlıkta `null` dönüyor, hata fırlatmıyor: kapak yayının çalışması
 * için gerekli değil, eksikse parça yedek görselle görünür. Bir kapak yüzünden
 * içe aktarmayı durdurmak orantısız olurdu.
 */
export async function ingestCover(options: {
  source: string;
  /** Parçanın kimliği; depodaki dosya adı bundan türüyor. */
  id: string;
  storage: AudioStorage;
}): Promise<string | null> {
  const candidates = coverCandidates(options.source);
  if (candidates.length === 0) return null;

  const cover = await fetchCover(candidates);
  if (!cover) return null;

  const key = `covers/${options.id}${cover.extension}`;
  try {
    return await options.storage.put({
      key,
      body: cover.data,
      contentType: contentTypeFor(key),
    });
  } catch {
    return null;
  }
}

/** Bir parçanın kapağı hangi durumda. */
export type CoverState = "stored" | "external" | "missing";

/**
 * Kapak nerede duruyor?
 *
 * `external` en sinsi hâl: parça çalışıyor ve kapak görünüyor, ama görsel
 * başkasının sunucusunda. Sorun ancak o sunucu adresi değiştirdiğinde ya da
 * video silindiğinde ortaya çıkıyor.
 */
export function coverState(track: Track, storage: AudioStorage): CoverState {
  if (!track.thumbnail) return "missing";
  return isStoredUrl(track.thumbnail, storage) ? "stored" : "external";
}

export type CoverSyncResult = {
  tracks: Track[];
  ingested: number;
  failed: { track: Track; reason: string }[];
  skipped: number;
};

/**
 * Listedeki kapakları depoya taşır.
 *
 * Kaynak sırası önemli: parçanın mevcut (dış) kapağı varsa o kullanılıyor,
 * yoksa `fallback` ile parça başına bir aday üretiliyor — `radio:covers` bunu
 * bir YouTube listesiyle eşleştirerek dolduruyor.
 *
 * Yalnızca `kind: "audio"` parçalar işleniyor. YouTube parçalarının kapağını
 * içeri almanın anlamı yok: sesleri zaten YouTube'dan geliyor, kapağı
 * kopyalamak bağımlılığı azaltmaz, yalnızca depo şişirir.
 */
export async function syncCovers(options: {
  tracks: Track[];
  storage: AudioStorage;
  /** Kapağı olmayan parçalar için aday adres üretir. */
  fallback?: (track: Track) => string | undefined;
  onProgress?: (done: number, total: number, track: Track) => void;
}): Promise<CoverSyncResult> {
  const { tracks, storage, fallback, onProgress } = options;

  const targets = tracks.filter(
    (track) => track.kind === "audio" && coverState(track, storage) !== "stored",
  );

  const replacements = new Map<Track, string>();
  const failed: CoverSyncResult["failed"] = [];
  let done = 0;

  for (const track of targets) {
    onProgress?.(++done, targets.length, track);

    const source = track.thumbnail || fallback?.(track) || "";
    if (!source) {
      failed.push({ track, reason: "kaynak yok" });
      continue;
    }

    const url = await ingestCover({ source, id: track.videoId, storage });
    if (url) replacements.set(track, url);
    else failed.push({ track, reason: "indirilemedi" });
  }

  return {
    tracks: tracks.map((track) =>
      replacements.has(track) ? { ...track, thumbnail: replacements.get(track)! } : track,
    ),
    ingested: replacements.size,
    failed,
    skipped: tracks.length - targets.length,
  };
}
