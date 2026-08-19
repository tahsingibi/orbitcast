import type { Track } from "./radio.ts";

/**
 * Listeyi karıştırır ve aynı sanatçıyı arka arkaya koymamaya çalışır.
 *
 * Düz Fisher–Yates yetmiyor: bir sanatçıdan 12 parça olan 120'lik bir listede
 * rastgele sıralama o parçaların ikişer üçer kümelenmesini neredeyse garanti
 * ediyor. Kulakta "aynı adam çalıyor" hissi bundan doğuyor — radyoyu bozan da
 * tekrarın kendisi değil, bu kümelenme.
 *
 * Bu yüzden karıştırma iki aşamalı:
 *
 *   1. Her sanatçının parçaları kendi içinde karıştırılır (aynı sanatçının
 *      şarkıları hep aynı sırayla gelmesin).
 *   2. Sıra kurulurken her adımda **en çok parçası kalan** sanatçı seçilir,
 *      bir önceki sanatçı hariç. Kalabalık sanatçıyı öne almak onu listeye
 *      yaymanın tek yolu: sona bırakılırsa kaçınılmaz olarak art arda gelir.
 *
 * Tam ayrışma her zaman mümkün değil — 3 parçalık listenin 2'si aynı
 * sanatçıysa bir yerde yan yana gelmek zorundalar. Böyle durumlarda ihlal
 * sayısı matematiksel olarak mümkün olan en aza iniyor.
 */

/** Test edilebilirlik için dışarıdan verilebilen rastgelelik kaynağı. */
export type Random = () => number;

function shuffleInPlace<T>(items: T[], random: Random): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Sanatçı adını gruplama anahtarına indirger. */
function artistKey(track: Track): string {
  return track.artist.trim().toLocaleLowerCase("tr");
}

export function shuffleTracks(tracks: Track[], random: Random = Math.random): Track[] {
  if (tracks.length < 3) return shuffleInPlace([...tracks], random);

  const groups = new Map<string, Track[]>();
  for (const track of tracks) {
    const key = artistKey(track);
    const group = groups.get(key);
    if (group) group.push(track);
    else groups.set(key, [track]);
  }

  // Her grup kendi içinde karışsın; sonra grupları da karıştırıyoruz ki
  // eşit sayıda parçası olan sanatçılar her seferinde aynı sırayla gelmesin.
  const buckets = shuffleInPlace(
    [...groups.entries()].map(([key, items]) => ({
      key,
      items: shuffleInPlace([...items], random),
    })),
    random,
  );

  const out: Track[] = [];
  let previous = "";

  while (out.length < tracks.length) {
    // En çok parçası kalan, önceki sanatçı olmayan grup.
    let pick = -1;
    for (let i = 0; i < buckets.length; i += 1) {
      const bucket = buckets[i];
      if (bucket.items.length === 0 || bucket.key === previous) continue;
      if (pick === -1 || bucket.items.length > buckets[pick].items.length) pick = i;
    }

    // Yalnızca önceki sanatçı kaldı: ayrışma imkânsız, kalanları ekliyoruz.
    if (pick === -1) {
      for (const bucket of buckets) out.push(...bucket.items.splice(0));
      break;
    }

    out.push(buckets[pick].items.shift()!);
    previous = buckets[pick].key;
  }

  return out;
}

/** Yan yana aynı sanatçının bulunduğu yer sayısı. Panelde bilgi olarak gösterilir. */
export function adjacentArtistRuns(tracks: Track[]): number {
  let count = 0;
  for (let i = 1; i < tracks.length; i += 1) {
    if (artistKey(tracks[i]) === artistKey(tracks[i - 1])) count += 1;
  }
  return count;
}
