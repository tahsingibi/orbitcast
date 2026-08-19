import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { applyEnv, cleanPastedValue } from "../scripts/lib/env.mjs";
import { readAudioFile } from "../src/lib/mp3.mjs";
import { slugify } from "../scripts/lib/audio-import.mjs";
import { broadcastSource, orderDoc } from "../scripts/lib/store.mjs";

/**
 * Kaynak katmanının kırılgan parçaları.
 *
 * Üçü de kullanıcının dosyalarına dokunuyor: biri `.env.local` dosyasını
 * düzenliyor, biri senkronizasyonun dayandığı süreyi okuyor, biri playlist
 * kaydının biçimini belirliyor. Sessizce bozulmalarını istemiyoruz.
 */

const FIXTURE = path.join(import.meta.dirname, "fixtures", "tone.mp3");

describe("applyEnv", () => {
  it("var olan satırı yerinde günceller", () => {
    const out = applyEnv("A=1\nB=2\n", { B: "yeni" });
    assert.equal(out, "A=1\nB=yeni\n");
  });

  it("olmayan değişkeni sona ekler", () => {
    assert.equal(applyEnv("A=1\n", { C: "3" }), "A=1\nC=3\n");
  });

  it("yorumlara ve sıraya dokunmaz", () => {
    const before = "# yorum\nA=1\n\n# başka\nB=2\n";
    assert.equal(applyEnv(before, { A: "9" }), "# yorum\nA=9\n\n# başka\nB=2\n");
  });

  it("boş dosyada da çalışır", () => {
    assert.equal(applyEnv("", { A: "1" }), "A=1\n");
  });

  it("undefined değeri yok sayar", () => {
    assert.equal(applyEnv("A=1\n", { A: undefined }), "A=1\n");
  });

  it("benzer adlı değişkeni yanlışlıkla ezmez", () => {
    // "A" yazarken "ADMIN_PASSWORD" satırına dokunmamalı.
    const out = applyEnv("ADMIN_PASSWORD=gizli\n", { A: "1" });
    assert.equal(out, "ADMIN_PASSWORD=gizli\nA=1\n");
  });
});

describe("cleanPastedValue", () => {
  it("Upstash panelinden kopyalanan satırı değere indirger", () => {
    // Panel bilgileri `ANAHTAR="değer"` biçiminde kopyalatıyor; blok olduğu
    // gibi yapıştırıldığında satırın tamamı token sanılıyordu.
    assert.equal(
      cleanPastedValue('UPSTASH_REDIS_REST_URL="https://x.upstash.io"'),
      "https://x.upstash.io",
    );
    assert.equal(cleanPastedValue("UPSTASH_REDIS_REST_TOKEN=gQtoken"), "gQtoken");
  });

  it("base64 dolgusunu ön ek sanmaz", () => {
    // "AXXXAAIncDE=" bir token; sondaki `=` yüzünden boşaltılmamalı.
    assert.equal(cleanPastedValue("AXXXAAIncDE="), "AXXXAAIncDE=");
    assert.equal(cleanPastedValue("Aa1_bB2=="), "Aa1_bB2==");
  });

  it("tırnakları ve boşlukları kırpar", () => {
    assert.equal(cleanPastedValue('  "değer"  '), "değer");
    assert.equal(cleanPastedValue("  https://x.upstash.io  "), "https://x.upstash.io");
  });

  it("boş girdide boş döner", () => {
    assert.equal(cleanPastedValue(""), "");
    assert.equal(cleanPastedValue("   "), "");
  });
});

describe("readAudioFile", () => {
  it("süreyi milisaniye hassasiyetinde okur", async () => {
    // Senkronizasyonun tamamı bu değere dayanıyor: yanlışsa yayın kayar.
    const meta = await readAudioFile(FIXTURE);
    assert.ok(
      Math.abs(meta.durationSec - 3.25) < 0.05,
      `beklenen ~3.25 sn, gelen ${meta.durationSec}`,
    );
  });

  it("ID3 etiketlerinden başlık ve sanatçı çıkarır", async () => {
    const meta = await readAudioFile(FIXTURE);
    assert.equal(meta.title, "Sabit Süre");
    assert.equal(meta.artist, "Fixture");
  });

  it("okunamayan dosyada kod fırlatır", async () => {
    await assert.rejects(
      () => readAudioFile(path.join(import.meta.dirname, "fixtures", "yok.mp3")),
      /ENOENT|AUDIO_DURATION_UNREADABLE/,
    );
  });
});

describe("slugify", () => {
  it("Türkçe karakterleri adres güvenli hâle getirir", () => {
    assert.equal(slugify("Şehinşah - Güller&Rhyme"), "sehinsah-guller-rhyme");
    assert.equal(slugify("İZAH"), "izah");
  });

  it("aynı girdi için hep aynı kimliği üretir", () => {
    assert.equal(slugify("Ceza — Suspus"), slugify("Ceza — Suspus"));
  });

  it("hiç harf içermeyen adda da bir kimlik döner", () => {
    assert.equal(slugify("!!!"), "parca");
  });
});

describe("broadcastSource", () => {
  /** Ortam değişkenlerini geçici olarak değiştirir. */
  function withEnv<T>(values: Record<string, string | undefined>, run: () => T): T {
    const before: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(values)) {
      before[key] = process.env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      return run();
    } finally {
      for (const [key, value] of Object.entries(before)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it("panelden yapılan seçim her şeyin önünde gelir", () => {
    // Kaynak değiştirmek için deploy gerekmemesinin dayandığı kural bu.
    withEnv({ RADIO_SOURCE: "file", YOUTUBE_PLAYLIST_URL: undefined }, () => {
      assert.equal(broadcastSource({ pinnedSource: "youtube" }), "youtube");
    });
    withEnv({ RADIO_SOURCE: "youtube", YOUTUBE_PLAYLIST_URL: "https://x" }, () => {
      assert.equal(broadcastSource({ pinnedSource: "file" }), "file");
    });
  });

  it("seçim yoksa RADIO_SOURCE=youtube geçerli olur", () => {
    withEnv({ RADIO_SOURCE: "youtube" }, () => {
      assert.equal(broadcastSource({}), "youtube");
    });
  });

  it("RADIO_SOURCE boşken tek başına playlist adresi yeter", () => {
    withEnv({ RADIO_SOURCE: undefined, YOUTUBE_PLAYLIST_URL: "https://x" }, () => {
      assert.equal(broadcastSource({}), "youtube");
    });
  });

  it("hiçbir işaret yoksa depoya düşer", () => {
    withEnv(
      {
        RADIO_SOURCE: undefined,
        YOUTUBE_PLAYLIST_URL: undefined,
        UPSTASH_REDIS_REST_URL: undefined,
        UPSTASH_REDIS_REST_TOKEN: undefined,
      },
      () => {
        assert.equal(broadcastSource({}), "file");
      },
    );
  });
});

describe("orderDoc", () => {
  it("YouTube parçalarına yerel alanları eklemez", () => {
    const out = orderDoc({
      name: "R",
      tagline: "t",
      shareTagline: "s",
      epoch: "2026-01-01T00:00:00.000Z",
      tracks: [{ videoId: "abc", title: "T", artist: "A", durationSec: 10 }],
    });
    assert.deepEqual(Object.keys(out.tracks[0]), [
      "videoId",
      "title",
      "artist",
      "durationSec",
      "thumbnail",
      "url",
    ]);
  });

  it("yerel parçalarda kind ve src alanlarını korur", () => {
    const out = orderDoc({
      name: "R",
      tagline: "t",
      shareTagline: "s",
      epoch: "2026-01-01T00:00:00.000Z",
      tracks: [
        { kind: "audio", videoId: "parca", src: "/audio/parca.mp3", durationSec: 10 },
      ],
    });
    assert.equal(out.tracks[0].kind, "audio");
    assert.equal(out.tracks[0].src, "/audio/parca.mp3");
  });
});
