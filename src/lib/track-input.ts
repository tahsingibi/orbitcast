import { trackKind, type Track } from "./radio.ts";

/**
 * Panelden gelen ham parça verisini güvenli bir `Track`'e indirger.
 *
 * Burası bir *sanitizasyon* sınırı: gövde istemciden geliyor, alanların
 * varlığına da tipine de güvenilmiyor. Ama sanitize etmek "tanımadığım alanı
 * at" demek değil — parçanın türü (`kind`) ve ses adresi (`src`) düşerse
 * yerel bir parça sessizce YouTube parçasına dönüşür: `trackKind` varsayılana
 * düşer, oynatıcı gömülü player'ı açmaya çalışır ve `videoId` bir dosya
 * slug'ı olduğu için yükleme başarısız olur.
 *
 * Uydurulan alanlar da türe bağlı: bir YouTube parçasının kapağı yoksa
 * `i.ytimg.com` adresi kurulabilir, ama yerel bir parça için o adres
 * anlamsızdır — kimliği bir video değil, dosya adıdır.
 */
export function normalizeTrackInput(raw: unknown): Track | null {
  if (!raw || typeof raw !== "object") return null;

  const input = raw as Partial<Track>;
  const videoId = String(input.videoId ?? "").trim();
  const durationSec = Math.round(Number(input.durationSec));

  if (!videoId || !(durationSec > 0)) return null;

  const kind = trackKind(input as Track);
  const src = String(input.src ?? "").trim();

  // Sesi olmayan bir "audio" parça çalınamaz; listeye alınırsa yayında
  // sessizlik olur. Reddetmek, sessizce YouTube'a çevirmekten iyi.
  if (kind === "audio" && !src) return null;

  const base = {
    videoId,
    title: String(input.title ?? "").trim() || "Bilinmeyen parça",
    artist: String(input.artist ?? "").trim() || "Bilinmeyen sanatçı",
    durationSec,
    thumbnail: String(input.thumbnail ?? "").trim(),
  };

  return kind === "audio"
    ? {
        ...base,
        kind: "audio",
        src,
        // Yerel parçanın dışarıda adresi yok; paylaşım sayfasına bakar.
        url: String(input.url ?? "").trim() || `/p/${videoId}`,
      }
    : {
        ...base,
        thumbnail: base.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        url: String(input.url ?? "").trim() || `https://www.youtube.com/watch?v=${videoId}`,
      };
}
