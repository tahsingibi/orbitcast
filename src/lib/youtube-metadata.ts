/**
 * Bir YouTube linkinden yayın için gereken metadata'yı çözer.
 *
 * Hatalar metin değil **kod** olarak fırlatılır (INVALID_URL, VIDEO_NOT_FOUND,
 * NO_DURATION, IS_LIVE, DURATION_UNREADABLE, UPSTREAM_ERROR). Bu modül hem
 * uygulama hem de CLI script'i tarafından kullanıldığı için dile bağımlı
 * olmamalı; çeviri, kodu gösteren katmanda yapılır.
 *
 * İki yol var:
 *   1. YOUTUBE_API_KEY tanımlıysa resmî Data API v3 (tek istek, güvenilir).
 *   2. Değilse oEmbed + izleme sayfası (anahtarsız çalışır, yerel geliştirme
 *      için yeterli; sunucu IP'lerinden bot kontrolüne takılabilir).
 *
 * Bu dosya hem Next uygulaması hem de scripts/sync-playlist.mjs tarafından
 * kullanıldığı için yalnızca silinebilir (erasable) TypeScript sözdizimi içerir.
 */

import type { Track } from "./radio";

export type ResolvedTrack = Track & {
  /** Gömülü oynatmaya kapalı videolar yayında sessiz kalır. */
  playableInEmbed: boolean;
  /** Canlı yayınların sabit süresi olmadığı için listeye alınamaz. */
  isLive: boolean;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Desteklenen her YouTube link biçiminden 11 karakterlik video id'sini çıkarır. */
export function extractVideoId(input: string): string | null {
  const value = String(input ?? "").trim();
  if (/^[\w-]{11}$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  // Tam eşleşme veya gerçek alt alan adı. Düz `endsWith` "evilyoutube.com"
  // gibi taklit alan adlarını da kabul ederdi.
  if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return null;

  const v = url.searchParams.get("v");
  if (v) return v;

  const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
  return m ? m[1] : null;
}

/** Bir playlist adresinden liste kimliğini çıkarır. */
export function extractPlaylistId(input: string): string | null {
  const value = String(input ?? "").trim();
  // Çıplak liste kimliği: PL…, UU…, OLAK5uy_… gibi
  if (/^(?:PL|UU|LL|FL|RD|OLAK5uy_)[\w-]{10,}$/.test(value)) return value;

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "youtube.com" && !host.endsWith(".youtube.com")) return null;
    return url.searchParams.get("list");
  } catch {
    return null;
  }
}

/** Resmî API ile liste öğeleri; sayfalama dahil. */
async function playlistViaDataApi(playlistId: string, apiKey: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = "";

  do {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?part=contentDetails&maxResults=50&playlistId=${playlistId}&key=${apiKey}` +
      (pageToken ? `&pageToken=${pageToken}` : "");

    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status === 404 ? "PLAYLIST_NOT_FOUND" : "UPSTREAM_ERROR");

    const data = await res.json();
    for (const item of data.items ?? []) {
      const id = item?.contentDetails?.videoId;
      if (id) ids.push(id);
    }
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);

  return ids;
}

/** Anahtarsız yol: playlist sayfasındaki ytInitialData'dan id'leri toplar. */
async function playlistViaPublicPage(playlistId: string): Promise<string[]> {
  return (await playlistPageLockups(playlistId)).map((lockup) => lockup.videoId);
}

/**
 * Playlist sayfasından çıkarılan ham kayıt.
 *
 * Sayfa her parçanın başlığını, kanalını, süresini ve kapağını *zaten*
 * taşıyor. Bunu okumak, parça başına ayrı istek atmaya kıyasla 100 kat daha
 * ucuz — canlı playlist kaynağının anahtarsız çalışabilmesinin tek sebebi bu.
 */
type PlaylistLockup = {
  videoId: string;
  title: string;
  channel: string;
  durationSec: number;
};

/** "3:55" veya "1:02:03" -> saniye. Okunamayan biçimde 0. */
function parseClockDuration(text: string): number {
  const parts = String(text ?? "").trim().split(":");
  if (parts.length < 2 || parts.length > 3) return 0;
  if (!parts.every((p) => /^\d+$/.test(p))) return 0;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}

async function playlistPageLockups(playlistId: string): Promise<PlaylistLockup[]> {
  const res = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`, {
    headers: { "user-agent": UA, "accept-language": "tr,en;q=0.8" },
  });
  if (!res.ok) throw new Error("UPSTREAM_ERROR");

  const html = await res.text();
  const match = html.match(/var ytInitialData = (\{[\s\S]+?\});<\/script>/);
  if (!match) throw new Error("PLAYLIST_NOT_FOUND");

  const items: PlaylistLockup[] = [];
  const seen = new Set<string>();

  const push = (item: PlaylistLockup): void => {
    if (!/^[\w-]{11}$/.test(item.videoId) || seen.has(item.videoId)) return;
    seen.add(item.videoId);
    items.push(item);
  };

  /** İç içe geçmiş metin kutularından ilk düz metni çeker. */
  const textOf = (node: unknown): string => {
    if (typeof node === "string") return node;
    if (!node || typeof node !== "object") return "";
    const record = node as Record<string, unknown>;
    if (typeof record.content === "string") return record.content;
    if (typeof record.simpleText === "string") return record.simpleText;
    if (Array.isArray(record.runs)) {
      return record.runs.map((run) => textOf(run)).join("");
    }
    return "";
  };

  /** Kapak rozetindeki süre metnini bulur ("3:55"). */
  const durationOf = (node: unknown): string => {
    let out = "";
    const dig = (value: unknown): void => {
      if (out || !value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(dig);
        return;
      }
      const record = value as Record<string, unknown>;
      const badge = record.thumbnailBadgeViewModel as { text?: unknown } | undefined;
      if (badge && typeof badge.text === "string" && parseClockDuration(badge.text) > 0) {
        out = badge.text;
        return;
      }
      Object.values(record).forEach(dig);
    };
    dig(node);
    return out;
  };

  // YouTube liste sayfasının veri yapısını iki kez değiştirdi; ikisini de
  // tanıyoruz. Yeni yapı `lockupViewModel`, eskisi `playlistVideoRenderer`.
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    const record = node as Record<string, unknown>;

    const lockup = record.lockupViewModel as Record<string, unknown> | undefined;
    if (lockup && lockup.contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
      const meta = (lockup.metadata as Record<string, unknown>)?.lockupMetadataViewModel as
        | Record<string, unknown>
        | undefined;
      const rows = (
        (meta?.metadata as Record<string, unknown>)?.contentMetadataViewModel as
          | { metadataRows?: Array<{ metadataParts?: Array<{ text?: unknown }> }> }
          | undefined
      )?.metadataRows;

      push({
        videoId: String(lockup.contentId ?? ""),
        title: textOf(meta?.title),
        channel: textOf(rows?.[0]?.metadataParts?.[0]?.text),
        durationSec: parseClockDuration(durationOf(lockup.contentImage)),
      });
      return;
    }

    const legacy = record.playlistVideoRenderer as Record<string, unknown> | undefined;
    if (legacy) {
      push({
        videoId: String(legacy.videoId ?? ""),
        title: textOf(legacy.title),
        channel: textOf(
          (legacy.shortBylineText as { runs?: Array<{ text?: string }> } | undefined) ??
            legacy.videoOwner,
        ),
        durationSec:
          Number((legacy.lengthSeconds as string) ?? 0) ||
          parseClockDuration(textOf(legacy.lengthText)),
      });
      return;
    }

    Object.values(record).forEach(walk);
  };

  walk(JSON.parse(match[1]));
  if (items.length === 0) throw new Error("PLAYLIST_EMPTY");
  return items;
}

/**
 * Playlist'in tamamını tek turda tam metadata'ya çevirir.
 *
 * `resolveTrack`'ten farkı: parça başına istek atmaz. Anahtarsız yolda liste
 * sayfası zaten her şeyi taşıdığı için **tek** HTTP isteği yeter; anahtarlı
 * yolda `videos.list` 50'lik gruplar hâlinde çağrılır. Canlı playlist kaynağı
 * her yenilemede bunu çalıştırdığı için maliyet kritik.
 *
 * Süresi okunamayan, canlı ya da gömülü oynatmaya kapalı parçalar sessizce
 * elenir — biri yüzünden yayının tamamı durmasın.
 */
export async function resolvePlaylistTracks(input: string): Promise<Track[]> {
  const playlistId = extractPlaylistId(input);
  if (!playlistId) throw new Error("INVALID_PLAYLIST_URL");

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    const ids = await playlistViaDataApi(playlistId, apiKey);
    return videosViaDataApi(ids, apiKey);
  }

  const lockups = await playlistPageLockups(playlistId);
  const tracks: Track[] = [];

  for (const lockup of lockups) {
    if (lockup.durationSec <= 0) continue;
    const parsed = parseTitle(lockup.title, lockup.channel);
    tracks.push({
      kind: "youtube",
      videoId: lockup.videoId,
      title: parsed.title,
      artist: parsed.artist,
      durationSec: lockup.durationSec,
      thumbnail: `https://i.ytimg.com/vi/${lockup.videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${lockup.videoId}`,
    });
  }

  if (tracks.length === 0) throw new Error("PLAYLIST_EMPTY");
  return tracks;
}

/** Video kimliklerini 50'lik gruplar hâlinde tam kayda çevirir. */
async function videosViaDataApi(ids: string[], apiKey: string): Promise<Track[]> {
  const tracks: Track[] = [];

  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url =
      `https://www.googleapis.com/youtube/v3/videos` +
      `?part=snippet,contentDetails,status&id=${chunk.join(",")}&key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("UPSTREAM_ERROR");
    const data = await res.json();

    // API silinmiş videoları hiç döndürmez, sıralamayı da korumaz; playlist
    // sırasını korumak için kimliğe göre eşleştiriyoruz.
    const byId = new Map<string, Track>();
    for (const item of data.items ?? []) {
      if (item.status?.embeddable === false) continue;
      if (item.snippet?.liveBroadcastContent !== "none") continue;

      const durationSec = parseIsoDuration(item.contentDetails?.duration ?? "");
      if (durationSec <= 0) continue;

      const thumbs = item.snippet.thumbnails ?? {};
      const parsed = parseTitle(item.snippet.title, item.snippet.channelTitle);
      byId.set(item.id, {
        kind: "youtube",
        videoId: item.id,
        title: parsed.title,
        artist: parsed.artist,
        durationSec,
        thumbnail:
          thumbs.maxres?.url ?? thumbs.standard?.url ?? thumbs.high?.url ??
          `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${item.id}`,
      });
    }

    for (const id of chunk) {
      const track = byId.get(id);
      if (track) tracks.push(track);
    }
  }

  if (tracks.length === 0) throw new Error("PLAYLIST_EMPTY");
  return tracks;
}

/**
 * Playlist'teki video kimliklerini sırasıyla döndürür.
 *
 * Anahtarsız yol sayfanın ilk yüklemesiyle sınırlıdır (~100 parça); daha uzun
 * listelerde YOUTUBE_API_KEY tanımlayın.
 */
export async function resolvePlaylistVideoIds(input: string): Promise<string[]> {
  const playlistId = extractPlaylistId(input);
  if (!playlistId) throw new Error("INVALID_PLAYLIST_URL");

  const apiKey = process.env.YOUTUBE_API_KEY;
  return apiKey
    ? playlistViaDataApi(playlistId, apiKey)
    : playlistViaPublicPage(playlistId);
}

const NOISE = [
  /\(\s*(official|resmi)[^)]*\)/gi,
  /\[\s*(official|resmi)[^\]]*\]/gi,
  /\((?:lyrics?|lyric video|sözleri|şarkı sözleri|audio|video|klip|video klip|hd|hq|4k[^)]*|remaster[^)]*|prod\.?[^)]*)\)/gi,
  /\[(?:lyrics?|audio|video|hd|hq|4k[^\]]*|prod\.?[^\]]*)\]/gi,
  /\|[^|]*(?:official|resmi|klip|video)[^|]*$/gi,
  /\b(?:official\s+(?:music\s+)?(?:video|audio)|video\s+klip|official)\b/gi,
  /\b(?:19|20)\d{2}\s*$/,
  /#\S+/g,
];

function cleanTitle(raw: string): string {
  let out = raw;
  for (const re of NOISE) out = out.replace(re, " ");
  return out.replace(/\s{2,}/g, " ").replace(/[\s\-–—|]+$/, "").trim();
}

/** Tamamı büyük harfle yazılmış sanatçı adlarını yumuşatır: "CEZA" -> "Ceza". */
function softenCaps(name: string): string {
  if (name.length <= 3 || name !== name.toLocaleUpperCase("tr")) return name;
  return name
    .toLocaleLowerCase("tr")
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase("tr"));
}

/** "Ceza - Suspus (Official Video)" -> { artist: "Ceza", title: "Suspus" } */
function parseTitle(rawTitle: string, channel: string) {
  const cleaned = cleanTitle(rawTitle);
  // En az bir tarafında boşluk olan ilk tireden böl; "Hip-Hop" gibi bitişik tireleri koru.
  const split = cleaned.match(/^(.+?)(?:\s+[-–—]\s*|\s*[-–—]\s+)(.+)$/);
  if (split) {
    const left = split[1].trim();
    const right = split[2].trim();
    // Bazı kanallar "Parça - Sanatçı" sırasını kullanıyor. Sağ tarafta kanal
    // adı geçiyor, solunda geçmiyorsa sıra terstir.
    const channelName = channel.trim();
    const flipped =
      channelName.length > 2 &&
      right.toLocaleLowerCase("tr").includes(channelName.toLocaleLowerCase("tr")) &&
      !left.toLocaleLowerCase("tr").includes(channelName.toLocaleLowerCase("tr"));

    const artist = softenCaps(flipped ? right : left);
    const title = flipped ? left : right;
    if (artist && title) return { artist, title };
  }
  const fallback = cleanTitle(channel || "").replace(/\s*-?\s*(resmi|topic)$/i, "").trim();
  return { artist: softenCaps(fallback), title: cleaned };
}

/** "PT4M21S" -> 261 */
function parseIsoDuration(iso: string): number {
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

async function bestThumbnail(videoId: string, fallback: string): Promise<string> {
  const maxres = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  try {
    const res = await fetch(maxres, { method: "HEAD" });
    if (res.ok) return maxres;
  } catch {
    /* sessizce fallback'e düş */
  }
  return fallback || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/** Resmî Data API v3 — tek istekte her şeyi verir. */
async function viaDataApi(videoId: string, apiKey: string): Promise<ResolvedTrack> {
  const url =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=snippet,contentDetails,status&id=${videoId}&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error("UPSTREAM_ERROR");

  const data = await res.json();
  const item = data.items?.[0];
  if (!item) throw new Error("VIDEO_NOT_FOUND");

  const durationSec = parseIsoDuration(item.contentDetails.duration);
  const thumbs = item.snippet.thumbnails ?? {};
  const parsed = parseTitle(item.snippet.title, item.snippet.channelTitle);

  return {
    kind: "youtube",
    videoId,
    title: parsed.title,
    artist: parsed.artist,
    durationSec,
    thumbnail:
      thumbs.maxres?.url ?? thumbs.standard?.url ?? thumbs.high?.url ??
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    playableInEmbed: item.status.embeddable !== false,
    isLive: item.snippet.liveBroadcastContent !== "none",
  };
}

/** Anahtarsız yol: oEmbed (başlık/kanal) + izleme sayfası (süre/gömülebilirlik). */
async function viaPublicPages(videoId: string): Promise<ResolvedTrack> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  const [oembedRes, watchRes] = await Promise.all([
    fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
    ),
    fetch(watchUrl, { headers: { "user-agent": UA, "accept-language": "tr,en;q=0.8" } }),
  ]);

  if (!oembedRes.ok) throw new Error("VIDEO_NOT_FOUND");
  if (!watchRes.ok) throw new Error("UPSTREAM_ERROR");

  const oembed = await oembedRes.json();
  const html = await watchRes.text();

  const length = html.match(/"lengthSeconds":"(\d+)"/);
  if (!length) {
    throw new Error("DURATION_UNREADABLE");
  }

  const embeddable = html.match(/"playableInEmbed":(true|false)/);
  const parsed = parseTitle(oembed.title, oembed.author_name);

  return {
    kind: "youtube",
    videoId,
    title: parsed.title,
    artist: parsed.artist,
    durationSec: Number(length[1]),
    thumbnail: await bestThumbnail(videoId, oembed.thumbnail_url),
    url: watchUrl,
    playableInEmbed: embeddable ? embeddable[1] === "true" : true,
    isLive: /"isLiveContent":true/.test(html) && !/"isLive":false/.test(html),
  };
}

/** Link veya video id'sinden tam bir parça kaydı üretir. */
export async function resolveTrack(input: string): Promise<ResolvedTrack> {
  const videoId = extractVideoId(input);
  if (!videoId) throw new Error("INVALID_URL");

  const apiKey = process.env.YOUTUBE_API_KEY;
  const track = apiKey ? await viaDataApi(videoId, apiKey) : await viaPublicPages(videoId);

  if (!track.durationSec) throw new Error("NO_DURATION");
  if (track.isLive) throw new Error("IS_LIVE");

  return track;
}
