import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  coverCandidates,
  coverState,
  fetchCover,
  syncCovers,
  youtubeThumbnailCandidates,
} from "../src/lib/cover.ts";
import type { Track } from "../src/lib/radio.ts";
import type { AudioStorage } from "../src/lib/storage/index.ts";

/**
 * Kapak taşımanın iddiası: yayın kendi deposunda tamamlansın. Sessizce
 * başarısız olması kabul edilebilir (parça yedek görselle çalar), sessizce
 * *yanlış* şey kaydetmesi değil — 404 sayfaları da 200 dönebiliyor.
 */

const track = (over: Partial<Track> = {}): Track => ({
  kind: "audio",
  videoId: "parca",
  src: "https://cdn.example.com/parca.mp3",
  title: "Parça",
  artist: "Sanatçı",
  durationSec: 200,
  thumbnail: "",
  url: "",
  ...over,
});

/** Yüklenenleri kaydeden sahte depo. */
function fakeStorage(): AudioStorage & { puts: string[] } {
  const puts: string[] = [];
  return {
    kind: "r2",
    publicBase: "https://cdn.example.com/",
    puts,
    async put({ key }) {
      puts.push(key);
      return `https://cdn.example.com/${key}`;
    },
  };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const imageResponse = (bytes = [1, 2, 3], type = "image/jpeg") =>
  new Response(new Uint8Array(bytes), { status: 200, headers: { "content-type": type } });

describe("youtubeThumbnailCandidates", () => {
  it("kaliteden düşüğe sıralar", () => {
    const list = youtubeThumbnailCandidates("abc123");
    assert.equal(list.length, 3);
    assert.match(list[0], /maxresdefault/);
    assert.match(list[2], /hqdefault/);
    assert.ok(list.every((u) => u.includes("abc123")));
  });
});

describe("coverCandidates", () => {
  it("YouTube linkinden kalite merdiveni kurar", () => {
    const list = coverCandidates("https://www.youtube.com/watch?v=WUfV1lj_kQY");
    assert.equal(list.length, 3);
    assert.ok(list[0].includes("WUfV1lj_kQY"));
  });

  it("düz görsel adresini olduğu gibi alır", () => {
    assert.deepEqual(coverCandidates("https://site.com/kapak.png"), [
      "https://site.com/kapak.png",
    ]);
  });

  it("boş ve adres olmayan girdide aday üretmez", () => {
    assert.deepEqual(coverCandidates("   "), []);
    assert.deepEqual(coverCandidates("sadece metin"), []);
  });
});

describe("fetchCover", () => {
  it("ilk çalışan adayı alır ve sonrakileri denemez", async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (url: string) => {
      seen.push(String(url));
      return String(url).includes("maxres")
        ? new Response("", { status: 404 })
        : imageResponse();
    }) as typeof fetch;

    const result = await fetchCover(youtubeThumbnailCandidates("abc"));
    assert.ok(result);
    assert.equal(result.extension, ".jpg");
    assert.equal(seen.length, 2, "hqdefault'a kadar inmemeliydi");
  });

  it("görsel olmayan 200 yanıtını reddeder — 404 sayfaları da 200 dönebiliyor", async () => {
    globalThis.fetch = (async () =>
      new Response("<html>bulunamadı</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as typeof fetch;

    assert.equal(await fetchCover(["https://site.com/x.jpg"]), null);
  });

  it("boş gövdeyi reddeder", async () => {
    globalThis.fetch = (async () => imageResponse([])) as typeof fetch;
    assert.equal(await fetchCover(["https://site.com/x.jpg"]), null);
  });

  it("png'yi uzantısıyla ayırt eder", async () => {
    globalThis.fetch = (async () => imageResponse([1], "image/png")) as typeof fetch;
    const result = await fetchCover(["https://site.com/x"]);
    assert.equal(result?.extension, ".png");
  });

  it("ağ hatasında sıradaki adaya geçer", async () => {
    let call = 0;
    globalThis.fetch = (async () => {
      call += 1;
      if (call === 1) throw new Error("ağ koptu");
      return imageResponse();
    }) as typeof fetch;

    assert.ok(await fetchCover(["https://a.com/1.jpg", "https://b.com/2.jpg"]));
  });
});

describe("coverState", () => {
  const storage = fakeStorage();

  it("kapaksızı missing sayar", () => {
    assert.equal(coverState(track(), storage), "missing");
  });

  it("kendi deposundakini stored sayar", () => {
    assert.equal(
      coverState(track({ thumbnail: "https://cdn.example.com/covers/parca.jpg" }), storage),
      "stored",
    );
  });

  it("dışarıda barınanı external sayar", () => {
    assert.equal(
      coverState(track({ thumbnail: "https://i.ytimg.com/vi/abc/hqdefault.jpg" }), storage),
      "external",
    );
  });
});

describe("syncCovers", () => {
  it("dış kapağı depoya alır ve adresi günceller", async () => {
    globalThis.fetch = (async () => imageResponse()) as typeof fetch;
    const storage = fakeStorage();

    const result = await syncCovers({
      tracks: [track({ thumbnail: "https://i.ytimg.com/vi/abc/hqdefault.jpg" })],
      storage,
    });

    assert.equal(result.ingested, 1);
    assert.equal(result.tracks[0].thumbnail, "https://cdn.example.com/covers/parca.jpg");
    assert.deepEqual(storage.puts, ["covers/parca.jpg"]);
  });

  it("zaten depoda olanı tekrar indirmez", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return imageResponse();
    }) as typeof fetch;
    const storage = fakeStorage();

    const result = await syncCovers({
      tracks: [track({ thumbnail: "https://cdn.example.com/covers/parca.jpg" })],
      storage,
    });

    assert.equal(calls, 0);
    assert.equal(result.ingested, 0);
    assert.equal(result.skipped, 1);
  });

  it("YouTube parçalarına dokunmaz — sesleri zaten YouTube'dan geliyor", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return imageResponse();
    }) as typeof fetch;

    const result = await syncCovers({
      tracks: [
        {
          videoId: "yt1",
          title: "y",
          artist: "a",
          durationSec: 100,
          thumbnail: "https://i.ytimg.com/vi/yt1/hqdefault.jpg",
          url: "",
        },
      ],
      storage: fakeStorage(),
    });

    assert.equal(calls, 0);
    assert.equal(result.ingested, 0);
  });

  it("kapağı olmayanlar için fallback kaynağı kullanır", async () => {
    globalThis.fetch = (async () => imageResponse()) as typeof fetch;
    const storage = fakeStorage();

    const target = track();
    const result = await syncCovers({
      tracks: [target],
      storage,
      fallback: () => "https://www.youtube.com/watch?v=WUfV1lj_kQY",
    });

    assert.equal(result.ingested, 1);
    assert.equal(result.tracks[0].thumbnail, "https://cdn.example.com/covers/parca.jpg");
  });

  it("indirilemeyen kapak listeyi bozmaz, raporlanır", async () => {
    globalThis.fetch = (async () => new Response("", { status: 404 })) as typeof fetch;

    const result = await syncCovers({
      tracks: [track({ thumbnail: "https://i.ytimg.com/vi/abc/hqdefault.jpg" })],
      storage: fakeStorage(),
    });

    assert.equal(result.ingested, 0);
    assert.equal(result.failed.length, 1);
    assert.equal(result.tracks[0].thumbnail, "https://i.ytimg.com/vi/abc/hqdefault.jpg");
  });

  it("kaynağı olmayan kapaksız parçayı sebebiyle raporlar", async () => {
    const result = await syncCovers({ tracks: [track()], storage: fakeStorage() });
    assert.equal(result.failed[0].reason, "kaynak yok");
  });
});
