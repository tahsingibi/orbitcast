import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Track } from "../src/lib/radio.ts";
import { adjacentArtistRuns, shuffleTracks } from "../src/lib/shuffle.ts";

/**
 * Karıştırmanın işi rastgelelik değil, *dağıtma*. Düz bir Fisher–Yates de
 * testten geçerdi; buradaki asıl iddia aynı sanatçının kümelenmemesi.
 */

const track = (artist: string, n: number): Track => ({
  kind: "audio",
  videoId: `${artist}-${n}`,
  src: `https://cdn.example.com/${artist}-${n}.mp3`,
  title: `${artist} ${n}`,
  artist,
  durationSec: 200,
  thumbnail: "",
  url: "",
});

const build = (spec: Record<string, number>): Track[] =>
  Object.entries(spec).flatMap(([artist, count]) =>
    Array.from({ length: count }, (_, i) => track(artist, i)),
  );

/** Deterministik sözde-rastgelelik: testler tekrarlanabilir olsun. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("shuffleTracks", () => {
  it("hiçbir parçayı kaybetmez ve çoğaltmaz", () => {
    const input = build({ ceza: 12, sagopa: 8, saian: 5, allame: 3 });
    const out = shuffleTracks(input, seeded(1));

    assert.equal(out.length, input.length);
    assert.deepEqual(
      out.map((t) => t.videoId).sort(),
      input.map((t) => t.videoId).sort(),
    );
  });

  it("girdiyi değiştirmez", () => {
    const input = build({ ceza: 4, sagopa: 4 });
    const before = input.map((t) => t.videoId);
    shuffleTracks(input, seeded(2));
    assert.deepEqual(input.map((t) => t.videoId), before);
  });

  it("dağıtılabilir listede aynı sanatçıyı hiç yan yana koymaz", () => {
    const input = build({ ceza: 12, sagopa: 8, saian: 5, allame: 3, ceg: 2 });
    for (let seed = 1; seed <= 25; seed += 1) {
      const out = shuffleTracks(input, seeded(seed));
      assert.equal(adjacentArtistRuns(out), 0, `seed ${seed} kümelenme üretti`);
    }
  });

  it("çoğunluk sanatçıda ihlali kaçınılmaz asgariye indirir", () => {
    // 7 parçanın 5'i aynı sanatçı: en iyi ihtimalle 5-1-... deseni kalır.
    const input = build({ ceza: 5, sagopa: 1, saian: 1 });
    const out = shuffleTracks(input, seeded(7));
    // Alt sınır: ceil((5 - (7 - 5 + 1)) ) = 2
    assert.ok(adjacentArtistRuns(out) <= 2, `beklenenden fazla: ${adjacentArtistRuns(out)}`);
  });

  it("tek sanatçılı listede çuvallamaz", () => {
    const input = build({ ceza: 5 });
    const out = shuffleTracks(input, seeded(3));
    assert.equal(out.length, 5);
    assert.equal(adjacentArtistRuns(out), 4);
  });

  it("sanatçı adını büyük/küçük harf ve boşluktan bağımsız gruplar", () => {
    const input = [track("Ceza", 1), { ...track("ceza ", 2) }, track("Sagopa", 3)];
    const out = shuffleTracks(input, seeded(9));
    assert.equal(adjacentArtistRuns(out), 0);
  });

  it("sıralamayı gerçekten değiştirir", () => {
    const input = build({ ceza: 6, sagopa: 6, saian: 6 });
    const out = shuffleTracks(input, seeded(4));
    assert.notDeepEqual(out.map((t) => t.videoId), input.map((t) => t.videoId));
  });

  it("kısa listelerde de çalışır", () => {
    assert.deepEqual(shuffleTracks([], seeded(1)), []);
    assert.equal(shuffleTracks([track("a", 1)], seeded(1)).length, 1);
    assert.equal(shuffleTracks(build({ a: 1, b: 1 }), seeded(1)).length, 2);
  });
});

describe("adjacentArtistRuns", () => {
  it("yan yana tekrarları sayar", () => {
    assert.equal(adjacentArtistRuns([track("a", 1), track("a", 2), track("b", 3)]), 1);
    assert.equal(adjacentArtistRuns([track("a", 1), track("b", 2), track("a", 3)]), 0);
    assert.equal(adjacentArtistRuns([]), 0);
  });
});
