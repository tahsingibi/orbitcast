import "server-only";

import { readPlaylist, type PlaylistDoc } from "./playlist-store";
import {
  FALLBACK_COVER,
  isPrimarySource,
  trackKind,
  type PlaylistSource,
  type Station,
  type Track,
} from "./radio";

/**
 * Depodaki playlist'i yayına hazır bir Station'a dönüştürür.
 *
 * Her istekte veri deposuna gitmemek için kısa ömürlü bir bellek önbelleği
 * kullanılır. TTL bilinçli olarak küçük: admin panelinden yapılan değişiklik
 * en geç bu süre kadar sonra tüm dinleyicilere ulaşır.
 */

/**
 * Asıl kaynaktayken tazelik önemli — ama sonsuz değil.
 *
 * 60 saniye bilinçli bir denge: Upstash'in ücretsiz komut bütçesini dinleyici
 * sayacıyla paylaşıyoruz ve okumalar instance başına ayda ~173.000'den
 * ~43.000'e iniyor. Bedeli, panelden yapılan bir değişikliğin dinleyicilere
 * en geç bir dakikada ulaşması.
 */
const CACHE_TTL_MS = 60_000;
/**
 * Yedek listede içerik zaten değişmez; uzun TTL hem gereksiz okumayı hem de
 * Redis kotası tükendiğinde arka arkaya başarısız isteği engeller.
 */
const FALLBACK_CACHE_TTL_MS = 60_000;

let cache: { station: Station; at: number } | null = null;

/**
 * Süresi olmayan parçalar senkronu bozacağı için sessizce elenir; çalınamaz
 * olanlar da öyle (kaynağı belirsiz yerel dosya, kimliksiz video).
 */
function toStation(doc: PlaylistDoc, source: PlaylistSource): Station {
  const tracks: Track[] = doc.tracks
    .filter((t) => t.videoId && t.durationSec > 0)
    .filter((t) => (trackKind(t) === "audio" ? Boolean(t.src) : true))
    .map((t) => {
      const kind = trackKind(t);
      const base = {
        kind,
        videoId: t.videoId,
        title: t.title || "Bilinmeyen parça",
        artist: t.artist || "Bilinmeyen sanatçı",
        durationSec: Math.round(t.durationSec),
      };

      return kind === "audio"
        ? {
            ...base,
            src: t.src,
            thumbnail: t.thumbnail || FALLBACK_COVER,
            // Yerel parçanın dışarıda bir adresi yok; paylaşım sayfasına bakar.
            url: t.url || `/p/${t.videoId}`,
          }
        : {
            ...base,
            thumbnail: t.thumbnail || `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`,
            url: t.url || `https://www.youtube.com/watch?v=${t.videoId}`,
          };
    });

  const epochMs = Date.parse(doc.epoch);

  return {
    name: doc.name,
    tagline: doc.tagline,
    shareTagline: doc.shareTagline,
    epochMs: Number.isNaN(epochMs) ? 0 : epochMs,
    tracks,
    totalDurationSec: tracks.reduce((sum, t) => sum + t.durationSec, 0),
    version: doc.updatedAt,
    source,
  };
}

export async function getStation(): Promise<Station> {
  if (cache) {
    const ttl = isPrimarySource(cache.station.source) ? CACHE_TTL_MS : FALLBACK_CACHE_TTL_MS;
    if (Date.now() - cache.at < ttl) return cache.station;
  }

  const read = await readPlaylist();
  const station = toStation(read.doc, read.source);
  cache = { station, at: Date.now() };
  return station;
}

/** Admin bir değişiklik kaydettiğinde bu örneğin önbelleğini düşürür. */
export function invalidateStationCache(): void {
  cache = null;
}

/** Playlist boşsa yayın yapılamaz; sayfalar bunu ayrı bir durum olarak gösterir. */
export function isBroadcastable(station: Station): boolean {
  return station.tracks.length > 0 && station.totalDurationSec > 0;
}
