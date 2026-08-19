import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, describe, it } from "node:test";

import { contentTypeFor, resolveStorageKind } from "../src/lib/storage/index.ts";
import { createR2Storage, hasR2Env, normalizePublicUrl } from "../src/lib/storage/r2.ts";

/**
 * Deponun sözleşmesi: yükleme gizli S3 ucuna imzalı gider, dönen adres ise
 * public custom domain'i gösterir. İkisinin karışması sessiz bir hata olurdu —
 * anahtarlar sızmasa bile oynatıcı çalışmayan adresler alırdı.
 */

const R2_ENV = {
  R2_ACCOUNT_ID: "hesap123",
  R2_BUCKET: "radyo",
  R2_ACCESS_KEY_ID: "AKIDEXAMPLE",
  R2_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  R2_PUBLIC_URL: "https://cdn.example.com",
};

const TOUCHED = [...Object.keys(R2_ENV), "AUDIO_STORAGE"];
const original = new Map(TOUCHED.map((key) => [key, process.env[key]]));

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const [key, value] of original) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete (globalThis as { __fetch?: unknown }).__fetch;
});

describe("resolveStorageKind", () => {
  it("ayar ve anahtar yokken yerel depoya düşer", () => {
    setEnv({ AUDIO_STORAGE: undefined, ...Object.fromEntries(TOUCHED.map((k) => [k, undefined])) });
    assert.equal(resolveStorageKind(), "local");
  });

  it("beş anahtarın tamamı doluysa R2'ye geçer", () => {
    setEnv({ AUDIO_STORAGE: undefined, ...R2_ENV });
    assert.equal(resolveStorageKind(), "r2");
  });

  it("anahtarlar eksikse R2'ye geçmez — yarım yapılandırma yayını kesmesin", () => {
    setEnv({ AUDIO_STORAGE: undefined, ...R2_ENV, R2_SECRET_ACCESS_KEY: "" });
    assert.equal(hasR2Env(), false);
    assert.equal(resolveStorageKind(), "local");
  });

  it("açık ayar anahtarların önüne geçer", () => {
    setEnv({ ...R2_ENV, AUDIO_STORAGE: "local" });
    assert.equal(resolveStorageKind(), "local");
  });
});

describe("R2 deposu", () => {
  it("yüklemeyi imzalı S3 ucuna yapar, public adresi döndürür", async () => {
    setEnv(R2_ENV);

    type Captured = { url: string; headers: Record<string, string> };
    let seen: Captured | undefined;
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: URL, init: RequestInit) => {
      seen = { url: String(input), headers: init.headers as Record<string, string> };
      return new Response("", { status: 200 });
    }) as typeof fetch;

    try {
      const storage = createR2Storage();
      const body = new TextEncoder().encode("ses verisi");
      const url = await storage.put({ key: "parca.mp3", body, contentType: "audio/mpeg" });

      // Dönen adres oynatıcıya gidiyor: gizli uç değil, custom domain olmalı.
      assert.equal(url, "https://cdn.example.com/parca.mp3");

      // Atama geri çağrının içinde olduğu için tip daraltmasını elle kırıyoruz.
      const captured = seen as Captured | undefined;
      assert.ok(captured, "fetch hiç çağrılmadı");
      assert.equal(captured.url, "https://hesap123.r2.cloudflarestorage.com/radyo/parca.mp3");
      assert.equal(captured.headers["content-type"], "audio/mpeg");
      assert.equal(
        captured.headers["x-amz-content-sha256"],
        createHash("sha256").update(body).digest("hex"),
      );
      assert.match(
        captured.headers.Authorization,
        /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=[^,]+, Signature=[0-9a-f]{64}$/,
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("public adresin sonundaki eğik çizgi adresi bozmaz", async () => {
    setEnv({ ...R2_ENV, R2_PUBLIC_URL: "https://cdn.example.com/" });

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("", { status: 200 })) as typeof fetch;

    try {
      const storage = createR2Storage();
      const url = await storage.put({
        key: "covers/parca.jpg",
        body: new Uint8Array([1, 2, 3]),
        contentType: "image/jpeg",
      });
      assert.equal(url, "https://cdn.example.com/covers/parca.jpg");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("R2 hata dönerse sebebi mesajda taşır", async () => {
    setEnv(R2_ENV);

    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("<Error><Code>SignatureDoesNotMatch</Code></Error>", {
        status: 403,
      })) as typeof fetch;

    try {
      const storage = createR2Storage();
      await assert.rejects(
        storage.put({
          key: "x.mp3",
          body: new Uint8Array([0]),
          contentType: "audio/mpeg",
        }),
        /R2_PUT_FAILED 403[\s\S]*SignatureDoesNotMatch/,
      );
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("eksik anahtarla kurulmaz", () => {
    setEnv({ ...R2_ENV, R2_BUCKET: "" });
    assert.throws(() => createR2Storage(), /R2_ENV_MISSING.*R2_BUCKET/);
  });
});

describe("normalizePublicUrl", () => {
  it("şema yazılmadıysa https varsayar — göreli adres üretilmesin", () => {
    assert.equal(normalizePublicUrl("cdn.orbitcast.example"), "https://cdn.orbitcast.example");
  });

  it("var olan şemayı korur", () => {
    assert.equal(normalizePublicUrl("http://cdn.example.com"), "http://cdn.example.com");
    assert.equal(normalizePublicUrl("https://cdn.example.com"), "https://cdn.example.com");
  });

  it("sondaki eğik çizgileri ve boşlukları atar", () => {
    assert.equal(normalizePublicUrl("  https://cdn.example.com//  "), "https://cdn.example.com");
  });
});

describe("contentTypeFor", () => {
  it("ses ve kapak uzantılarını tanır", () => {
    assert.equal(contentTypeFor("parca.mp3"), "audio/mpeg");
    assert.equal(contentTypeFor("parca.M4A"), "audio/mp4");
    assert.equal(contentTypeFor("parca.flac"), "audio/flac");
    assert.equal(contentTypeFor("covers/kapak.jpg"), "image/jpeg");
    assert.equal(contentTypeFor("covers/kapak.png"), "image/png");
  });

  it("bilinmeyen uzantıda genel tipe düşer", () => {
    assert.equal(contentTypeFor("dosya.xyz"), "application/octet-stream");
  });
});
