import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeTrackInput } from "../src/lib/track-input.ts";

/**
 * Panelden gelen gövde sanitize ediliyor, ama sanitizasyon "tanımadığım alanı
 * at" olamaz: `kind` ve `src` düşünce yerel parça sessizce YouTube parçasına
 * dönüşüyordu. Kaydetmek yayını bozuyordu ve sebebi kaydeden kişiye hiç
 * görünmüyordu — bu yüzden davranış teste bağlanıyor.
 */

const audio = {
  kind: "audio" as const,
  videoId: "ceza-suspus",
  src: "https://cdn.example.com/ceza-suspus.mp3",
  title: "Suspus",
  artist: "Ceza",
  durationSec: 214,
  thumbnail: "https://cdn.example.com/covers/ceza-suspus.jpg",
  url: "",
};

const youtube = {
  videoId: "WUfV1lj_kQY",
  title: "Parmak Uçları",
  artist: "Saian",
  durationSec: 182,
  thumbnail: "",
  url: "",
};

describe("normalizeTrackInput · yerel parça", () => {
  it("kind ve src alanlarını korur", () => {
    const out = normalizeTrackInput(audio);
    assert.equal(out?.kind, "audio");
    assert.equal(out?.src, audio.src);
  });

  it("kapağı uydurmaz — yerel kimlik bir video id'si değil", () => {
    const out = normalizeTrackInput({ ...audio, thumbnail: "" });
    assert.equal(out?.thumbnail, "");
  });

  it("adres yoksa paylaşım sayfasına bağlar, YouTube'a değil", () => {
    const out = normalizeTrackInput({ ...audio, url: "" });
    assert.equal(out?.url, "/p/ceza-suspus");
  });

  it("sesi olmayan audio parçayı reddeder — yayında sessizlik olurdu", () => {
    assert.equal(normalizeTrackInput({ ...audio, src: "" }), null);
    assert.equal(normalizeTrackInput({ ...audio, src: "   " }), null);
  });
});

describe("normalizeTrackInput · YouTube parçası", () => {
  it("kapak yoksa ytimg adresini kurar", () => {
    const out = normalizeTrackInput(youtube);
    assert.equal(out?.thumbnail, "https://i.ytimg.com/vi/WUfV1lj_kQY/hqdefault.jpg");
  });

  it("adres yoksa izleme adresini kurar", () => {
    const out = normalizeTrackInput(youtube);
    assert.equal(out?.url, "https://www.youtube.com/watch?v=WUfV1lj_kQY");
  });

  it("kind alanı taşımaz — varsayılan zaten youtube", () => {
    assert.equal(normalizeTrackInput(youtube)?.kind, undefined);
  });
});

describe("normalizeTrackInput · geçersiz girdi", () => {
  it("kimliksiz veya süresiz kaydı reddeder", () => {
    assert.equal(normalizeTrackInput({ ...youtube, videoId: "" }), null);
    assert.equal(normalizeTrackInput({ ...youtube, durationSec: 0 }), null);
    assert.equal(normalizeTrackInput({ ...youtube, durationSec: -5 }), null);
    assert.equal(normalizeTrackInput({ ...youtube, durationSec: "abc" }), null);
  });

  it("nesne olmayan girdiyi reddeder", () => {
    assert.equal(normalizeTrackInput(null), null);
    assert.equal(normalizeTrackInput("parça"), null);
    assert.equal(normalizeTrackInput(undefined), null);
  });

  it("boş başlık ve sanatçıyı yedeğe bağlar", () => {
    const out = normalizeTrackInput({ ...youtube, title: "  ", artist: "" });
    assert.equal(out?.title, "Bilinmeyen parça");
    assert.equal(out?.artist, "Bilinmeyen sanatçı");
  });

  it("süreyi tam sayıya yuvarlar — senkron buna dayanıyor", () => {
    assert.equal(normalizeTrackInput({ ...youtube, durationSec: 182.6 })?.durationSec, 183);
  });
});

describe("gidiş-dönüş", () => {
  it("normalize edilmiş parça ikinci geçişte değişmez", () => {
    const once = normalizeTrackInput(audio);
    assert.deepEqual(normalizeTrackInput(once), once);
  });

  it("kaydetmek yerel parçayı YouTube parçasına çevirmez", () => {
    let track: unknown = audio;
    for (let i = 0; i < 5; i += 1) track = normalizeTrackInput(track);
    assert.equal((track as { kind?: string }).kind, "audio");
    assert.equal((track as { src?: string }).src, audio.src);
  });
});
