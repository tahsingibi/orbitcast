/**
 * Radyonun tek doğruluk kaynağı: saf matematik.
 *
 * Sunucu müzik yayınlamaz. Herkes aynı üç girdiden — playlist, sabit bir
 * başlangıç anı (epoch) ve o anki zaman — aynı sonucu hesaplar:
 *
 *   elapsed = (now - epoch) mod toplamSüre
 *
 * Modulo sayesinde liste bittiğinde başa döner; loop için ekstra mantık yok.
 */

/**
 * Parçayı hangi motorun çalacağı.
 *
 *   youtube — gömülü IFrame oynatıcı; ses YouTube'un CDN'inden gelir.
 *   audio   — repodaki bir dosya; ses sizin sunucunuzdan gelir.
 */
export type TrackKind = "youtube" | "audio";

export type Track = {
  /** Alan yoksa "youtube" varsayılır; eski kayıtlar bu yüzden bozulmaz. */
  kind?: TrackKind;
  /**
   * Parçanın kararlı kimliği. YouTube parçalarında video kimliği, yerel
   * dosyalarda dosya adından türetilen slug. Liste anahtarı ve paylaşım
   * adresi (`/p/<id>`) bunun üzerinden kurulur.
   */
  videoId: string;
  /** kind === "audio" iken çalınacak dosyanın adresi (ör. /audio/parca.mp3). */
  src?: string;
  title: string;
  artist: string;
  /** Senkronizasyonun dayandığı alan; scripts/sync-playlist.mjs doldurur. */
  durationSec: number;
  thumbnail: string;
  url: string;
};

/** Eksik `kind` alanını varsayılana bağlar. */
export function trackKind(track: Track): TrackKind {
  return track.kind === "audio" ? "audio" : "youtube";
}

export type Station = {
  name: string;
  tagline: string;
  /** Paylaşım kartlarında görünen alt metin. */
  shareTagline: string;
  /** Yayının kavramsal başlangıcı (epoch), ms cinsinden. */
  epochMs: number;
  tracks: Track[];
  totalDurationSec: number;
  /**
   * Playlist'in sürümü (son güncelleme anı). İstemci bunu izleyerek
   * sayfayı yenilemeden yeni listeye geçer.
   */
  version: string;
  /** Yayının hangi kaynaktan çıktığı; arayüzde rozet olarak gösterilir. */
  source: PlaylistSource;
};

/**
 * Yayın listesinin geldiği yer.
 *
 *   redis    — Upstash Redis'ten; asıl kaynak, panelden düzenlenebilir.
 *   file     — data/playlist.json asıl kaynak; panelden düzenlenebilir.
 *   youtube  — Doğrudan bir YouTube playlist'i; listeyi YouTube'da yönetirsiniz,
 *              panel salt okunur.
 *   pinned   — Redis var ama yönetici elle yedek listeye geçmiş; salt okunur.
 *   fallback — Asıl kaynağa ulaşılamıyor; yedek liste devrede, salt okunur.
 */
export type PlaylistSource = "redis" | "file" | "youtube" | "pinned" | "fallback";

/**
 * Liste panelden değiştirilebilir mi?
 *
 * `youtube` bilinçli olarak dışarıda: yayın canlı ve asıl kaynağından çıkıyor
 * ama listenin sahibi YouTube, panel değil.
 */
export function isEditableSource(source: PlaylistSource): boolean {
  return source === "redis" || source === "file";
}

/** Yayın, olması gereken kaynaktan mı çıkıyor? (yedeğe düşmüş değil) */
export function isPrimarySource(source: PlaylistSource): boolean {
  return source === "redis" || source === "file" || source === "youtube";
}

export type RadioState = {
  /** Playlist içindeki sıra. */
  index: number;
  track: Track;
  /** Parçanın kaçıncı saniyesindeyiz. */
  offsetSec: number;
  /** Parçanın bitmesine kalan saniye. */
  remainingSec: number;
  nextTrack: Track;
  /** Yayın başladığından beri kaçıncı tur. Yalnızca bilgi amaçlı. */
  cycle: number;
};

/** Verilen ana karşılık gelen yayın konumunu döndürür. */
export function resolveRadioState(station: Station, nowMs: number): RadioState {
  const totalMs = station.totalDurationSec * 1000;
  const sinceEpochMs = nowMs - station.epochMs;

  // Epoch gelecekteyse bile negatife düşmeyen modulo.
  const elapsedMs = ((sinceEpochMs % totalMs) + totalMs) % totalMs;
  const cycle = Math.floor(sinceEpochMs / totalMs);

  let cursorMs = elapsedMs;
  for (let index = 0; index < station.tracks.length; index += 1) {
    const track = station.tracks[index];
    const trackMs = track.durationSec * 1000;

    if (cursorMs < trackMs) {
      const offsetSec = cursorMs / 1000;
      return {
        index,
        track,
        offsetSec,
        remainingSec: track.durationSec - offsetSec,
        nextTrack: station.tracks[(index + 1) % station.tracks.length],
        cycle,
      };
    }
    cursorMs -= trackMs;
  }

  // Kayan nokta artıklarına karşı güvenlik ağı: son parçanın sonu.
  const index = station.tracks.length - 1;
  const track = station.tracks[index];
  return {
    index,
    track,
    offsetSec: track.durationSec,
    remainingSec: 0,
    nextTrack: station.tracks[0],
    cycle,
  };
}

/** Yayın akışında bir parça: sırası ve "şimdi"ye olan zaman uzaklığı. */
export type QueueEntry = {
  index: number;
  track: Track;
  /**
   * Parçanın başlangıcının şimdiye uzaklığı, saniye.
   * Geçmiş için "kaç saniye önce başladı", gelecek için "kaç saniye sonra başlayacak".
   */
  secondsAway: number;
};

/**
 * O anki konumdan geriye ve ileriye doğru yayın akışını çıkarır.
 *
 * Hiçbir yerde geçmiş kaydı tutulmaz — liste ve süreler bilindiği için
 * "az önce ne çaldı" da "sırada ne var" kadar hesaplanabilir bir sorudur.
 * Kısa listelerde aynı parçanın iki kez görünmemesi için pencere daraltılır.
 */
export function resolveQueue(
  station: Station,
  state: RadioState,
  pastCount: number,
  futureCount: number,
): { past: QueueEntry[]; future: QueueEntry[] } {
  const total = station.tracks.length;
  const past: QueueEntry[] = [];
  const future: QueueEntry[] = [];
  if (total <= 1) return { past, future };

  // Mevcut parça hariç en fazla (total - 1) farklı parça gösterilebilir; aksi
  // hâlde liste döndüğü için aynı parça hem geçmişte hem gelecekte görünürdü.
  //
  // Yer kısıtlıysa pay öncelikle sıradakilere verilir (radyoda "ne gelecek"
  // "ne çaldı"dan daha çok ilgilendirir), ama en az bir geçmiş satırı korunur.
  const room = total - 1;
  const share = Math.ceil((room * futureCount) / (pastCount + futureCount));

  let futureLimit = Math.min(futureCount, Math.max(1, share));
  // Geçmiş satırı isteniyorsa ona en az bir slot ayır; istenmiyorsa yer harcama.
  if (room >= 2 && pastCount > 0) futureLimit = Math.min(futureLimit, room - 1);

  const pastLimit = Math.min(pastCount, room - futureLimit);

  // Geçmiş: mevcut parça `offsetSec` önce başladı; her adımda bir önceki
  // parçanın süresi eklenerek o parçanın başlangıcına gidilir.
  let ago = state.offsetSec;
  for (let step = 1; step <= pastLimit; step += 1) {
    const index = ((state.index - step) % total + total) % total;
    const track = station.tracks[index];
    ago += track.durationSec;
    past.push({ index, track, secondsAway: ago });
  }

  // Gelecek: sıradaki parça `remainingSec` sonra başlar.
  let ahead = state.remainingSec;
  for (let step = 1; step <= futureLimit; step += 1) {
    const index = (state.index + step) % total;
    const track = station.tracks[index];
    future.push({ index, track, secondsAway: ahead });
    ahead += track.durationSec;
  }

  return { past, future };
}

/**
 * İstasyonun tam adı: "Ad — slogan".
 *
 * Slogan boşken ayraç da düşer; şablon boş sloganla geldiği için bunu
 * yapmazsak sekme başlığı "RADIO —" olarak kalıyordu.
 */
export function stationTitle(name: string, tagline: string): string {
  const trimmed = tagline.trim();
  return trimmed ? `${name} — ${trimmed}` : name;
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
