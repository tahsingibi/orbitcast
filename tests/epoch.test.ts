import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rebaseEpoch, resolveRadioState, type Timeline, type Track } from "../src/lib/radio.ts";

/**
 * Liste değiştiğinde yayının yerinde kalması.
 *
 * Buradaki asıl iddia sezgiye aykırı olduğu için testle sabitleniyor:
 * epoch'a dokunmamak yayını sabit tutmaz, kaydırır. Konum
 * `(now - epoch) mod toplamSüre` olduğundan toplam süre değişince modulo
 * başka bir yere düşer ve sapma her turda birikir.
 */

const track = (videoId: string, durationSec: number): Track => ({
  videoId,
  title: videoId,
  artist: "sanatçı",
  durationSec,
  thumbnail: "",
  url: "",
});

const timeline = (tracks: Track[], epochMs: number): Timeline => ({
  epochMs,
  tracks,
  totalDurationSec: tracks.reduce((sum, t) => sum + t.durationSec, 0),
});

const A = track("a", 100);
const B = track("b", 100);
const C = track("c", 100);
const D = track("d", 60);

// 350 saniye geçmiş: bir tur (300s) tamamlanmış, ikinci turun 50. saniyesinde.
const NOW = 350_000;
const before = timeline([A, B, C], 0);

describe("rebaseEpoch", () => {
  it("epoch'a dokunulmazsa liste uzayınca yayın kayar", () => {
    const wasPlaying = resolveRadioState(before, NOW);
    assert.equal(wasPlaying.track.videoId, "a");
    assert.equal(wasPlaying.offsetSec, 50);

    // Aynı epoch, uzamış liste: modulo artık başka yere düşüyor.
    const drifted = resolveRadioState(timeline([A, B, C, D], 0), NOW);
    assert.equal(drifted.track.videoId, "d");
  });

  it("sona parça eklenince çalan parçayı ve saniyesini korur", () => {
    const after = [A, B, C, D];
    const epochMs = rebaseEpoch(before, after, NOW);
    assert.ok(epochMs !== null);

    const state = resolveRadioState(timeline(after, epochMs), NOW);
    assert.equal(state.track.videoId, "a");
    assert.equal(state.offsetSec, 50);
  });

  it("sıralama değişse de konumu korur", () => {
    // Çalan parça listenin sonuna taşındı.
    const after = [B, C, A];
    const epochMs = rebaseEpoch(before, after, NOW);
    assert.ok(epochMs !== null);

    const state = resolveRadioState(timeline(after, epochMs), NOW);
    assert.equal(state.track.videoId, "a");
    assert.equal(state.offsetSec, 50);
  });

  it("araya parça sokulunca da konumu korur", () => {
    const after = [D, A, B, C];
    const epochMs = rebaseEpoch(before, after, NOW);
    assert.ok(epochMs !== null);

    const state = resolveRadioState(timeline(after, epochMs), NOW);
    assert.equal(state.track.videoId, "a");
    assert.equal(state.offsetSec, 50);
  });

  it("çalan parça listeden çıkarıldıysa korunacak konum yoktur", () => {
    assert.equal(rebaseEpoch(before, [B, C], NOW), null);
  });

  it("boş listelerde null döner", () => {
    assert.equal(rebaseEpoch(before, [], NOW), null);
    assert.equal(rebaseEpoch(timeline([], 0), [A], NOW), null);
  });
});
