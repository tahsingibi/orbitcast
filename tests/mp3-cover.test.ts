import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readAudioBuffer } from "../src/lib/mp3.mjs";

/**
 * Gömülü kapağın *gerçek* biçimini tanıma.
 *
 * Etikete güvenmek sessiz bir hataydı: yt-dlp ile indirilen dosyalarda
 * YouTube'un webp kapağı `image/jpeg` diye bildiriliyor. Yanlış tanı depoya
 * yanlış uzantı ve yanlış `Content-Type` ile gidiyor — dosya webp, sunucu
 * "jpeg" diyor. Bayt imzası bunu kesin çözüyor.
 */

/** ID3v2.3 syncsafe boyut alanı. */
function syncsafe(size: number): Buffer {
  return Buffer.from([
    (size >> 21) & 0x7f,
    (size >> 14) & 0x7f,
    (size >> 7) & 0x7f,
    size & 0x7f,
  ]);
}

/** Verilen gövdeyi APIC olarak taşıyan, en küçük geçerli MP3'ü kurar. */
function mp3WithCover(declaredMime: string, image: Buffer): Uint8Array {
  const apic = Buffer.concat([
    Buffer.from([0x00]), // metin kodlaması: latin1
    Buffer.from(declaredMime, "latin1"),
    Buffer.from([0x00]), // MIME sonlandırıcı
    Buffer.from([0x03]), // resim türü: ön kapak
    Buffer.from([0x00]), // boş açıklama
    image,
  ]);

  const frame = Buffer.concat([
    Buffer.from("APIC", "latin1"),
    (() => {
      const b = Buffer.alloc(4);
      b.writeUInt32BE(apic.length);
      return b;
    })(),
    Buffer.from([0x00, 0x00]), // bayraklar
    apic,
  ]);

  const header = Buffer.concat([
    Buffer.from("ID3", "latin1"),
    Buffer.from([0x03, 0x00, 0x00]), // v2.3, revizyon 0, bayraksız
    syncsafe(frame.length),
  ]);

  // Etiketten sonra süre hesabı için tek bir MPEG kare başlığı yeter;
  // bu test yalnızca kapakla ilgilendiği için gövde önemsiz.
  const audio = Buffer.alloc(2048);
  audio[0] = 0xff;
  audio[1] = 0xfb;
  audio[2] = 0x90;
  audio[3] = 0x00;

  return new Uint8Array(Buffer.concat([header, frame, audio]));
}

/** 100 baytlık eşiği aşan sahte görsel gövdeleri. */
const pad = (head: number[]) => Buffer.concat([Buffer.from(head), Buffer.alloc(200)]);

const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "latin1"),
  Buffer.alloc(200),
]);

describe("gömülü kapak biçimi", () => {
  it("jpeg'i tanır", () => {
    const meta = readAudioBuffer(mp3WithCover("image/jpeg", JPEG));
    assert.equal(meta.picture?.mime, "image/jpeg");
  });

  it("png'yi tanır", () => {
    const meta = readAudioBuffer(mp3WithCover("image/png", PNG));
    assert.equal(meta.picture?.mime, "image/png");
  });

  it("jpeg diye bildirilen webp'i baytlarından yakalar", () => {
    const meta = readAudioBuffer(mp3WithCover("image/jpeg", WEBP));
    assert.equal(meta.picture?.mime, "image/webp");
  });

  it("png diye bildirilen jpeg'i de düzeltir", () => {
    const meta = readAudioBuffer(mp3WithCover("image/png", JPEG));
    assert.equal(meta.picture?.mime, "image/jpeg");
  });

  it("tanınmayan gövdede bildirilen tipe düşer", () => {
    const meta = readAudioBuffer(mp3WithCover("image/png", pad([0x00, 0x01, 0x02])));
    assert.equal(meta.picture?.mime, "image/png");
  });

  it("kapak gövdesini bozmadan taşır", () => {
    const meta = readAudioBuffer(mp3WithCover("image/jpeg", JPEG));
    assert.deepEqual(Buffer.from(meta.picture!.data.subarray(0, 4)), JPEG.subarray(0, 4));
  });
});
