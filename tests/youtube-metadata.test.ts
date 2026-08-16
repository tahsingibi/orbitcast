import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractVideoId } from "../src/lib/youtube-metadata.ts";
import { playerErrorKey } from "../src/lib/youtube.ts";

/**
 * Link çözümleme ağ gerektirmeyen saf bir fonksiyon; playlist'e parça eklemenin
 * ilk adımı olduğu için burada kırılırsa panel hiçbir linki kabul etmez.
 */

describe("extractVideoId", () => {
  const ID = "dQw4w9WgXcQ";

  it("desteklenen tüm link biçimlerini çözer", () => {
    const forms = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}`,
      `http://www.youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?t=42`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube.com/v/${ID}`,
      ID,
    ];

    for (const form of forms) {
      assert.equal(extractVideoId(form), ID, form);
    }
  });

  it("baştaki ve sondaki boşlukları yok sayar", () => {
    assert.equal(extractVideoId(`  https://youtu.be/${ID}  `), ID);
    assert.equal(extractVideoId(`  ${ID} `), ID);
  });

  it("ek parametreler id'yi bozmaz", () => {
    assert.equal(extractVideoId(`https://www.youtube.com/watch?v=${ID}&list=PL123&index=2`), ID);
    assert.equal(extractVideoId(`https://www.youtube.com/watch?app=desktop&v=${ID}`), ID);
  });

  it("YouTube olmayan ve geçersiz girdilerde null döner", () => {
    const invalid = [
      "",
      "   ",
      "merhaba",
      "https://vimeo.com/123456",
      "https://example.com/watch?v=" + ID,
      "https://www.youtube.com/",
      "https://www.youtube.com/results?search_query=test",
      "https://notyoutube.com/watch?v=" + ID,
    ];

    for (const value of invalid) {
      assert.equal(extractVideoId(value), null, value);
    }
  });

  it("youtube.com'a benzeyen alan adlarına kanmaz", () => {
    // "evil-youtube.com" .endsWith("youtube.com") kontrolünü geçmemeli.
    assert.equal(extractVideoId(`https://evilyoutube.com/watch?v=${ID}`), null);
  });
});

describe("playerErrorKey", () => {
  it("YouTube hata kodlarını sözlük anahtarına çevirir", () => {
    assert.equal(playerErrorKey(2), "playerInvalidId");
    assert.equal(playerErrorKey(5), "playerUnsupported");
    assert.equal(playerErrorKey(100), "playerRemoved");
    assert.equal(playerErrorKey(101), "playerNotEmbeddable");
    assert.equal(playerErrorKey(150), "playerNotEmbeddable");
  });

  it("bilinmeyen kodda genel mesaja düşer", () => {
    assert.equal(playerErrorKey(999), "playerGeneric");
    assert.equal(playerErrorKey(0), "playerGeneric");
  });
});
