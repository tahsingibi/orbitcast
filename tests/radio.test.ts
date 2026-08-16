import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatClock,
  isEditableSource,
  stationTitle,
  isPrimarySource,
  trackKind,
  resolveQueue,
  resolveRadioState,
  type Station,
  type Track,
} from "../src/lib/radio.ts";

/**
 * Yayının kalbi bu iki saf fonksiyon. Ağ, zamanlayıcı veya tarayıcı gerektirmeden
 * test edilebiliyorlar — senkronizasyon iddiasının doğrulanabildiği yer burası.
 */

const EPOCH = Date.UTC(2026, 0, 1);

function track(id: string, durationSec: number): Track {
  return {
    videoId: id,
    title: `Şarkı ${id}`,
    artist: `Sanatçı ${id}`,
    durationSec,
    thumbnail: "",
    url: "",
  };
}

/** Süreleri verilen bir istasyon kurar. */
function station(durations: number[]): Station {
  const tracks = durations.map((d, i) => track(String(i), d));
  return {
    name: "Test",
    tagline: "",
    shareTagline: "",
    epochMs: EPOCH,
    tracks,
    totalDurationSec: durations.reduce((a, b) => a + b, 0),
    version: "v1",
    source: "file",
  };
}

/** epoch + saniye */
const at = (seconds: number) => EPOCH + seconds * 1000;

describe("resolveRadioState", () => {
  const st = station([60, 30, 90]); // toplam 180

  it("epoch anında ilk parçanın başındadır", () => {
    const state = resolveRadioState(st, at(0));
    assert.equal(state.index, 0);
    assert.equal(state.offsetSec, 0);
    assert.equal(state.remainingSec, 60);
    assert.equal(state.nextTrack.videoId, "1");
  });

  it("parçanın ortasında doğru offset verir", () => {
    const state = resolveRadioState(st, at(45));
    assert.equal(state.index, 0);
    assert.equal(state.offsetSec, 45);
    assert.equal(state.remainingSec, 15);
  });

  it("parça sınırında bir sonrakine geçer", () => {
    const before = resolveRadioState(st, at(59.999));
    const after = resolveRadioState(st, at(60));
    assert.equal(before.index, 0);
    assert.equal(after.index, 1);
    assert.equal(after.offsetSec, 0);
  });

  it("son parçadan sonra başa döner (sonsuz loop)", () => {
    const first = resolveRadioState(st, at(10));
    const looped = resolveRadioState(st, at(180 + 10));
    assert.equal(looped.index, first.index);
    assert.equal(looped.offsetSec, first.offsetSec);
  });

  it("tur sayısını (cycle) sayar", () => {
    assert.equal(resolveRadioState(st, at(10)).cycle, 0);
    assert.equal(resolveRadioState(st, at(190)).cycle, 1);
    assert.equal(resolveRadioState(st, at(3 * 180 + 5)).cycle, 3);
  });

  it("epoch gelecekteyken de negatife düşmez", () => {
    // 30 saniye epoch'tan ÖNCE: modulo negatif olmamalı.
    const state = resolveRadioState(st, at(-30));
    assert.ok(state.offsetSec >= 0, "offset negatif olmamalı");
    assert.ok(state.index >= 0 && state.index < st.tracks.length);
    // 180 - 30 = 150 -> üçüncü parçanın (60+30=90 sonrası) 60. saniyesi
    assert.equal(state.index, 2);
    assert.equal(state.offsetSec, 60);
  });

  it("offset + kalan her zaman parça süresine eşittir", () => {
    for (const seconds of [0, 1, 59, 60, 61, 89, 90, 179, 180, 1234.5]) {
      const state = resolveRadioState(st, at(seconds));
      assert.equal(
        state.offsetSec + state.remainingSec,
        state.track.durationSec,
        `t=${seconds}`,
      );
    }
  });

  it("son parçada nextTrack başa sarar", () => {
    const state = resolveRadioState(st, at(100)); // üçüncü parça
    assert.equal(state.index, 2);
    assert.equal(state.nextTrack.videoId, "0");
  });

  it("tek parçalık listede hep aynı parçadadır", () => {
    const solo = station([120]);
    const state = resolveRadioState(solo, at(300));
    assert.equal(state.index, 0);
    assert.equal(state.nextTrack.videoId, "0");
  });

  it("aynı ana bakan iki istemci aynı sonucu alır", () => {
    // Senkronun tek iddiası bu: girdi aynıysa çıktı aynıdır.
    const moment = at(1234.567);
    const a = resolveRadioState(st, moment);
    const b = resolveRadioState(station([60, 30, 90]), moment);
    assert.deepEqual({ index: a.index, offset: a.offsetSec }, {
      index: b.index,
      offset: b.offsetSec,
    });
  });
});

describe("resolveQueue", () => {
  it("geçmiş ve gelecekte aynı parça iki kez görünmez", () => {
    for (const count of [1, 2, 3, 5, 8, 12, 30]) {
      const st = station(Array.from({ length: count }, () => 60));
      const state = resolveRadioState(st, at(90));
      const { past, future } = resolveQueue(st, state, 4, 5);

      const shown = [...past.map((e) => e.index), state.index, ...future.map((e) => e.index)];
      assert.equal(
        shown.length,
        new Set(shown).size,
        `${count} parçalık listede tekrar var: ${shown.join(",")}`,
      );
    }
  });

  it("tek parçalık listede pencere boştur", () => {
    const st = station([60]);
    const { past, future } = resolveQueue(st, resolveRadioState(st, at(10)), 4, 5);
    assert.equal(past.length, 0);
    assert.equal(future.length, 0);
  });

  it("yer kısıtlıyken sıradakilere öncelik verir ama geçmişi tamamen yutmaz", () => {
    const st = station([60, 60, 60, 60, 60]); // 5 parça -> 4 slot
    const { past, future } = resolveQueue(st, resolveRadioState(st, at(10)), 4, 5);
    assert.ok(future.length > past.length, "sıradakiler daha fazla olmalı");
    assert.ok(past.length >= 1, "en az bir geçmiş satırı kalmalı");
    assert.equal(past.length + future.length, 4);
  });

  it("ilk sıradaki parça tam olarak 'kalan süre' sonra başlar", () => {
    const st = station([60, 30, 90]);
    const state = resolveRadioState(st, at(20));
    const { future } = resolveQueue(st, state, 4, 5);
    assert.equal(future[0].secondsAway, state.remainingSec);
  });

  it("gelecek zamanları süreler kadar birikir", () => {
    const st = station([60, 30, 90]);
    const state = resolveRadioState(st, at(20)); // kalan 40
    const { future } = resolveQueue(st, state, 0, 2);
    assert.equal(future[0].secondsAway, 40); // 2. parça
    assert.equal(future[1].secondsAway, 40 + 30); // 3. parça
  });

  it("geçmiş zamanları bir önceki parçanın süresi kadar geriye gider", () => {
    const st = station([60, 30, 90]);
    const state = resolveRadioState(st, at(70)); // 2. parçanın 10. saniyesi
    const { past } = resolveQueue(st, state, 2, 0);
    assert.equal(past[0].secondsAway, 10 + 60); // 1. parça bu kadar önce başladı
    assert.equal(past[1].secondsAway, 10 + 60 + 90); // 3. parça (bir önceki tur)
  });
});

describe("formatClock", () => {
  it("dakika:saniye biçiminde yazar", () => {
    assert.equal(formatClock(0), "0:00");
    assert.equal(formatClock(9), "0:09");
    assert.equal(formatClock(61), "1:01");
    assert.equal(formatClock(600), "10:00");
  });

  it("ondalık saniyeyi aşağı yuvarlar ve negatifi sıfırlar", () => {
    assert.equal(formatClock(59.9), "0:59");
    assert.equal(formatClock(-5), "0:00");
  });
});

describe("stationTitle", () => {
  it("ad ve sloganı ayraçla birleştirir", () => {
    assert.equal(stationTitle("RADIO", "kesintisiz yayın"), "RADIO — kesintisiz yayın");
  });

  it("slogan boşken ayracı da düşürür", () => {
    // Şablon boş sloganla geliyor; aksi hâlde sekmede "RADIO —" yazardı.
    assert.equal(stationTitle("RADIO", ""), "RADIO");
    assert.equal(stationTitle("RADIO", "   "), "RADIO");
  });
});

describe("trackKind", () => {
  it("kind yoksa youtube varsayar (eski kayıtlar bozulmasın)", () => {
    assert.equal(trackKind({ videoId: "a" } as never), "youtube");
  });

  it("yerel dosyaları audio olarak tanır", () => {
    assert.equal(trackKind({ videoId: "a", kind: "audio" } as never), "audio");
  });
});

describe("isPrimarySource", () => {
  it("yayın asıl kaynağından çıkıyorsa true", () => {
    assert.equal(isPrimarySource("redis"), true);
    assert.equal(isPrimarySource("file"), true);
    // YouTube listesi düzenlenebilir değil ama yayın yine asıl kaynağından.
    assert.equal(isPrimarySource("youtube"), true);
  });

  it("yedeğe düşülmüşse false", () => {
    assert.equal(isPrimarySource("pinned"), false);
    assert.equal(isPrimarySource("fallback"), false);
  });
});

describe("isEditableSource", () => {
  it("yalnızca düzenlenebilir kaynakları canlı sayar", () => {
    assert.equal(isEditableSource("redis"), true);
    assert.equal(isEditableSource("file"), true);
    assert.equal(isEditableSource("pinned"), false);
    assert.equal(isEditableSource("fallback"), false);
    // Liste YouTube'da yönetiliyor; panel yazamaz.
    assert.equal(isEditableSource("youtube"), false);
  });
});
