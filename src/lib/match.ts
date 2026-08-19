/**
 * Yerel ses dosyalarını YouTube kayıtlarıyla eşleştirir.
 *
 * Amaç: sesi R2'den çalarken başlık, sanatçı ve kapağı YouTube'un temiz
 * verisinden almak. Dosya adları bu bilgiyi taşımıyor — "Akşamlar.mp3"dan
 * sanatçı çıkmıyor, kapak zaten hiç yok.
 *
 * İki sinyal kullanılıyor:
 *
 *   süre    — nesnel ve güçlü. Aynı videodan çıkmış bir mp3 saniyesi saniyesine
 *             tutar. Tek başına yetmez: farklı şarkılar aynı uzunlukta olabilir.
 *   başlık  — ayırt edici ama gürültülü. "(Official Video)", "ft.", sıra
 *             numarası, Türkçe karakterler temizlenmeden karşılaştırılamaz.
 *
 * Bu yüzden ikisi birleştiriliyor: başlık kimliği söyler, süre teyit eder.
 * Eşleştirme birebir — bir dosya yalnızca bir videoya bağlanır.
 */

import type { Track } from "./radio.ts";

/** Bu skorun üstü elle onay istemeden uygulanır. */
export const CONFIDENT_SCORE = 0.75;

/** Bu skorun altı hiç aday sayılmaz. */
export const CANDIDATE_SCORE = 0.35;

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
  é: "e",
};

/**
 * Başlıkları karşılaştırılabilir hâle indirger.
 *
 * Sıra önemli: parantez içi atılmadan önce klip etiketleri temizlenirse
 * "(Official Video)" gibi ifadeler yarım kalır.
 */
export function normalizeTitle(value: string): string {
  return String(value)
    .toLocaleLowerCase("tr")
    .replace(/[çğıöşüâîûé]/g, (ch) => TR_MAP[ch] ?? ch)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(
      /\b(official|video|audio|lyrics?|klip|hd|4k|full|prod|beat|remix|canli|live)\b/g,
      " ",
    )
    .replace(/\b(feat|ft|featuring|with)\b/g, " ")
    .replace(/^\d+[\s.\-_]+/, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Karakter ikilileri üzerinden Dice benzerliği (0..1).
 *
 * Kelime sırasına duyarsız olması işimize geliyor: "Ceza - Suspus" ile
 * "Suspus - Ceza" aynı şarkıdır ama sıralı karşılaştırmada uzak düşerler.
 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const bigrams = (value: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < value.length - 1; i += 1) {
      const gram = value.slice(i, i + 2);
      map.set(gram, (map.get(gram) ?? 0) + 1);
    }
    return map;
  };

  const left = bigrams(a);
  const right = bigrams(b);

  let shared = 0;
  for (const [gram, count] of left) shared += Math.min(count, right.get(gram) ?? 0);

  const total =
    [...left.values()].reduce((sum, n) => sum + n, 0) +
    [...right.values()].reduce((sum, n) => sum + n, 0);

  return total === 0 ? 0 : (2 * shared) / total;
}

/** Süre yakınlığı: 2 saniyeye kadar tam puan, 15 saniyeden sonra sıfır. */
export function durationScore(a: number, b: number): number {
  const diff = Math.abs(a - b);
  if (diff <= 2) return 1;
  if (diff >= 15) return 0;
  return 1 - (diff - 2) / 13;
}

export type MatchCandidate = {
  local: Track;
  remote: Track;
  /** Birleşik skor (0..1). */
  score: number;
  titleScore: number;
  durationScore: number;
};

export type MatchResult = {
  /** Doğrudan uygulanabilir eşleşmeler. */
  confident: MatchCandidate[];
  /** Onay istenecek eşleşmeler. */
  uncertain: MatchCandidate[];
  unmatchedLocal: Track[];
  unmatchedRemote: Track[];
};

/** Karşılaştırmaya girecek metin; dosya adından sanatçı çıkmadıysa başlık yeter. */
function textOf(track: Track): string {
  const artist = track.artist === "Bilinmeyen sanatçı" ? "" : track.artist;
  return normalizeTitle(`${artist} ${track.title}`);
}

/**
 * Yerel parçaları uzak parçalarla eşler.
 *
 * Açgözlü atama: tüm çiftler skora göre sıralanır, en iyisinden başlanarak
 * her iki taraf da "kullanıldı" işaretlenir. Optimal atama (Hungarian)
 * değil ama skorlar birbirinden net ayrıldığı için pratikte aynı sonucu
 * veriyor ve okunması çok daha kolay.
 */
export function matchTracks(local: Track[], remote: Track[]): MatchResult {
  const pairs: MatchCandidate[] = [];

  for (const one of local) {
    for (const other of remote) {
      const titleScore = similarity(textOf(one), textOf(other));
      const durScore = durationScore(one.durationSec, other.durationSec);
      const score = titleScore * 0.65 + durScore * 0.35;
      if (score > CANDIDATE_SCORE) {
        pairs.push({ local: one, remote: other, score, titleScore, durationScore: durScore });
      }
    }
  }

  pairs.sort((a, b) => b.score - a.score);

  // "Kullanıldı" işareti kimliğe değil nesnenin kendisine bakıyor: aynı
  // videoId'ye sahip iki kayıt gelse bile birbirinin yerine geçmesin.
  const usedLocal = new Set<Track>();
  const usedRemote = new Set<Track>();
  const matched: MatchCandidate[] = [];

  for (const pair of pairs) {
    if (usedLocal.has(pair.local) || usedRemote.has(pair.remote)) continue;
    usedLocal.add(pair.local);
    usedRemote.add(pair.remote);
    matched.push(pair);
  }

  return {
    confident: matched.filter((m) => m.score >= CONFIDENT_SCORE),
    uncertain: matched.filter((m) => m.score < CONFIDENT_SCORE),
    unmatchedLocal: local.filter((t) => !usedLocal.has(t)),
    unmatchedRemote: remote.filter((t) => !usedRemote.has(t)),
  };
}

/**
 * Eşleşmiş çifti tek parçaya indirger: ses yerelden, kimlik YouTube'dan.
 *
 * `durationSec` bilinçli olarak **yerel dosyadan** geliyor. Senkronun tamamı
 * bu sayıya dayanıyor ve çalınan şey mp3; YouTube'un süresi birkaç saniye
 * farklı olabilir, o farkı almak yayını her turda kaydırırdı.
 *
 * `videoId` de yerel kalıyor: R2'deki dosya adı ve `/p/<id>` paylaşım adresi
 * buna bağlı, değiştirmek var olan bağlantıları kırardı.
 */
export function mergeTrack(local: Track, remote: Track): Track {
  return {
    ...local,
    title: remote.title || local.title,
    artist: remote.artist || local.artist,
    thumbnail: remote.thumbnail || local.thumbnail,
  };
}
