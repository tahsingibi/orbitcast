import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeFolderPath } from "../src/lib/audio-meta.ts";

/**
 * Finder'dan sürükle-bırak en doğal kullanım ve tam da o yol ham hâlde
 * geçersiz geliyor: kabuk yolu kaçırıp tırnaklıyor. Tırnaklı yol göreli
 * sayılıp çalışma dizinine ekleniyordu, hata da "klasör bulunamadı" oluyordu.
 */

const HOME = process.env.HOME ?? "~";

describe("normalizeFolderPath", () => {
  it("tek tırnağı soyar (iTerm sürükle-bırak)", () => {
    assert.equal(normalizeFolderPath("'/Users/x/orbit mp3'"), "/Users/x/orbit mp3");
  });

  it("çift tırnağı soyar", () => {
    assert.equal(normalizeFolderPath('"/Users/x/orbitmp3"'), "/Users/x/orbitmp3");
  });

  it("ters bölülü boşluğu çözer (Terminal.app sürükle-bırak)", () => {
    assert.equal(normalizeFolderPath("/Users/x/orbit\\ mp3"), "/Users/x/orbit mp3");
  });

  it("parantez gibi diğer kabuk kaçışlarını da çözer", () => {
    assert.equal(normalizeFolderPath("/Users/x/muzik\\ \\(2026\\)"), "/Users/x/muzik (2026)");
  });

  it("tırnak içindeki ters bölüyü kaçış saymaz — orada gerçek karakterdir", () => {
    assert.equal(normalizeFolderPath("'/Users/x/a\\b'"), "/Users/x/a\\b");
  });

  it("baştaki ve sondaki boşlukları atar", () => {
    assert.equal(normalizeFolderPath("  /Users/x/orbitmp3  "), "/Users/x/orbitmp3");
  });

  it("~ ve ~/ genişletir", () => {
    assert.equal(normalizeFolderPath("~"), HOME);
    assert.equal(normalizeFolderPath("~/Desktop/orbit"), `${HOME}/Desktop/orbit`);
  });

  it("tırnak içindeki ~ de genişler — sürüklenen ev dizini böyle geliyor", () => {
    assert.equal(normalizeFolderPath("'~/Desktop/orbit'"), `${HOME}/Desktop/orbit`);
  });

  it("düz yolu olduğu gibi bırakır", () => {
    assert.equal(normalizeFolderPath("/Users/x/orbitmp3"), "/Users/x/orbitmp3");
  });

  it("dosya adındaki tırnağı yanlışlıkla soymaz", () => {
    // Yalnızca *eşleşen* baş/son tırnağı soyuyoruz.
    assert.equal(normalizeFolderPath("/Users/x/it's music"), "/Users/x/it's music");
  });
});
