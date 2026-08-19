import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  durationScore,
  matchTracks,
  mergeTrack,
  normalizeTitle,
  similarity,
} from "../src/lib/match.ts";
import type { Track } from "../src/lib/radio.ts";

/**
 * Eşleştirmenin işi bir iddiayı taşımak: "bu mp3 ile bu video aynı şarkı".
 * Yanlış eşleşme sessizdir — parça çalar ama kapağı ve adı başka şarkınındır.
 * Bu yüzden hem sinyallerin tek tek davranışı hem de birebir atama garantisi
 * teste bağlanıyor.
 */

const local = (title: string, durationSec: number, artist = "Bilinmeyen sanatçı"): Track => ({
  kind: "audio",
  videoId: title.toLowerCase().replace(/\W+/g, "-"),
  src: `https://cdn.example.com/${title.toLowerCase().replace(/\W+/g, "-")}.mp3`,
  title,
  artist,
  durationSec,
  thumbnail: "",
  url: "",
});

const remote = (title: string, artist: string, durationSec: number, id = "yt-" + title): Track => ({
  videoId: id,
  title,
  artist,
  durationSec,
  thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  url: `https://www.youtube.com/watch?v=${id}`,
});

describe("normalizeTitle", () => {
  it("klip etiketlerini ve parantez içini atar", () => {
    assert.equal(normalizeTitle("Suspus (Official Video)"), "suspus");
    assert.equal(normalizeTitle("Suspus [HD] Lyrics"), "suspus");
  });

  it("sıra numarasını ve feat ekini temizler", () => {
    assert.equal(normalizeTitle("06. Yakana Taktık"), "yakana taktik");
    assert.equal(normalizeTitle("Soyun Kurur feat. Saian"), "soyun kurur saian");
  });

  it("Türkçe karakterleri karşılaştırılabilir hâle getirir", () => {
    assert.equal(normalizeTitle("Şanışer & Ceza"), "saniser ceza");
  });
});

describe("similarity", () => {
  it("aynı metinde 1 döner", () => {
    assert.equal(similarity("ceza suspus", "ceza suspus"), 1);
  });

  it("kelime sırasına duyarsızdır", () => {
    assert.ok(similarity("ceza suspus", "suspus ceza") > 0.7);
  });

  it("alakasız metinlerde düşük kalır", () => {
    assert.ok(similarity("ceza suspus", "sagopa kajmer bir") < 0.4);
  });

  it("boş metinde 0 döner", () => {
    assert.equal(similarity("", "ceza"), 0);
  });
});

describe("durationScore", () => {
  it("2 saniyeye kadar tam puan verir", () => {
    assert.equal(durationScore(200, 200), 1);
    assert.equal(durationScore(200, 202), 1);
  });

  it("15 saniye ve ötesinde sıfırlanır", () => {
    assert.equal(durationScore(200, 215), 0);
    assert.equal(durationScore(200, 400), 0);
  });

  it("arada kademeli düşer", () => {
    const near = durationScore(200, 205);
    const far = durationScore(200, 212);
    assert.ok(near > far && far > 0);
  });
});

describe("matchTracks", () => {
  it("başlık ve süre tutunca kesin eşleşme sayar", () => {
    const result = matchTracks(
      [local("Suspus", 214)],
      [remote("Suspus (Official Video)", "Ceza", 214)],
    );

    assert.equal(result.confident.length, 1);
    assert.equal(result.uncertain.length, 0);
    assert.equal(result.confident[0].remote.artist, "Ceza");
  });

  it("süre tutmayan benzer başlığı kesin saymaz", () => {
    const result = matchTracks(
      [local("Suspus", 214)],
      [remote("Suspus", "Ceza", 400)],
    );

    assert.equal(result.confident.length, 0);
  });

  it("alakasız parçaları eşleştirmez", () => {
    const result = matchTracks(
      [local("Akşamlar", 224)],
      [remote("Bir Nefes Al", "Sagopa", 380)],
    );

    assert.equal(result.confident.length, 0);
    assert.equal(result.uncertain.length, 0);
    assert.equal(result.unmatchedLocal.length, 1);
    assert.equal(result.unmatchedRemote.length, 1);
  });

  it("bir YouTube kaydını iki dosyaya birden bağlamaz", () => {
    // İki dosya da aynı videoya benziyor; yalnızca biri alabilir.
    const result = matchTracks(
      [local("Suspus", 214), local("Suspus", 214)],
      [remote("Suspus", "Ceza", 214)],
    );

    const total = result.confident.length + result.uncertain.length;
    assert.equal(total, 1);
    assert.equal(result.unmatchedLocal.length, 1);
  });

  it("eşleşmeyenleri iki tarafta da raporlar", () => {
    const result = matchTracks(
      [local("Suspus", 214), local("Hiphop Game", 274)],
      [remote("Suspus", "Ceza", 214), remote("Kılıç Günü", "Cumali Efrah", 127)],
    );

    assert.equal(result.confident.length, 1);
    assert.deepEqual(
      result.unmatchedLocal.map((t) => t.title),
      ["Hiphop Game"],
    );
    assert.deepEqual(
      result.unmatchedRemote.map((t) => t.title),
      ["Kılıç Günü"],
    );
  });
});

describe("mergeTrack", () => {
  const one = local("Akşamlar", 224);
  const other = remote("Akşamlar", "Sagopa Kajmer", 226);
  const result = mergeTrack(one, other);

  it("kimliği YouTube'dan alır", () => {
    assert.equal(result.artist, "Sagopa Kajmer");
    assert.equal(result.thumbnail, other.thumbnail);
  });

  it("sesi ve süreyi yerelde bırakır — senkron mp3'e dayanıyor", () => {
    assert.equal(result.src, one.src);
    assert.equal(result.durationSec, 224);
    assert.equal(result.kind, "audio");
  });

  it("kimliği değiştirmez — R2 dosya adı ve paylaşım adresi buna bağlı", () => {
    assert.equal(result.videoId, one.videoId);
  });
});
