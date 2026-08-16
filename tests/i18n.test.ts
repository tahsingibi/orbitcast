import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { en } from "../src/lib/i18n/dictionaries/en.ts";
import { tr } from "../src/lib/i18n/dictionaries/tr.ts";
import { format } from "../src/lib/i18n/format.ts";

/**
 * Sözlüklerin *şekli* TypeScript tarafından zaten garanti ediliyor (eksik
 * anahtar derleme hatası verir). Buradaki testler tipin yakalayamadığı iki şeyi
 * kovalıyor: yer tutucu uyuşmazlığı ve boş çeviri.
 */

type Bag = Record<string, Record<string, string>>;

const dictionaries: Record<string, Bag> = {
  tr: tr as unknown as Bag,
  en: en as unknown as Bag,
};

function tokensOf(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

describe("format", () => {
  it("yer tutucuları doldurur", () => {
    assert.equal(format("Merhaba {name}", { name: "Dünya" }), "Merhaba Dünya");
  });

  it("aynı yer tutucuyu birden çok kez doldurur", () => {
    assert.equal(format("{a}-{a}", { a: "x" }), "x-x");
  });

  it("sayıları metne çevirir", () => {
    assert.equal(format("{n} dk", { n: 5 }), "5 dk");
  });

  it("karşılığı olmayan yer tutucuyu olduğu gibi bırakır", () => {
    assert.equal(format("{a} {b}", { a: "1" }), "1 {b}");
  });

  it("yer tutucu yoksa metni değiştirmez", () => {
    assert.equal(format("düz metin", { a: "1" }), "düz metin");
  });
});

describe("sözlükler", () => {
  it("her dilde aynı anahtarlar var", () => {
    for (const area of Object.keys(dictionaries.tr)) {
      assert.deepEqual(
        Object.keys(dictionaries.en[area] ?? {}).sort(),
        Object.keys(dictionaries.tr[area]).sort(),
        `"${area}" alanının anahtarları eşleşmiyor`,
      );
    }
  });

  it("aynı anahtar her dilde aynı yer tutucuları kullanır", () => {
    // En sinsi çeviri hatası bu: metin doğru ama {station} yerine {name}
    // yazılmışsa arayüzde ham yer tutucu görünür.
    for (const [area, entries] of Object.entries(dictionaries.tr)) {
      for (const [key, turkish] of Object.entries(entries)) {
        const english = dictionaries.en[area][key];
        assert.deepEqual(
          tokensOf(english),
          tokensOf(turkish),
          `${area}.${key} yer tutucuları farklı`,
        );
      }
    }
  });

  it("hiçbir çeviri boş değil", () => {
    for (const [locale, bag] of Object.entries(dictionaries)) {
      for (const [area, entries] of Object.entries(bag)) {
        for (const [key, value] of Object.entries(entries)) {
          assert.equal(typeof value, "string", `${locale}.${area}.${key} metin değil`);
          assert.ok(value.trim().length > 0, `${locale}.${area}.${key} boş`);
        }
      }
    }
  });

  it("değerler fonksiyon değil (sunucudan istemciye geçebilmeli)", () => {
    // React fonksiyonları sunucu/istemci sınırından geçirmiyor; sözlük prop
    // olarak taşındığı için bu kural bozulursa sayfa komple render edilemiyor.
    for (const [locale, bag] of Object.entries(dictionaries)) {
      for (const [area, entries] of Object.entries(bag)) {
        for (const [key, value] of Object.entries(entries)) {
          assert.notEqual(
            typeof value,
            "function",
            `${locale}.${area}.${key} fonksiyon — düz metin olmalı`,
          );
        }
      }
    }
  });
});
