#!/usr/bin/env node
/**
 * data/playlist.json'daki YouTube linklerini gezip metadata'yı doldurur.
 *
 *   npm run radio:sync            -> eksik alanları tamamlar
 *   npm run radio:sync -- --force -> title/artist'i de yeniden türetir
 *
 * Bu dosya yalnızca *tohum* listeyi hazırlar. Yayın Upstash Redis üzerinde
 * çalışırken günlük düzenlemeler /admin panelinden yapılır; bu script ilk
 * kurulum ve yerel geliştirme içindir.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { extractVideoId, resolveTrack } from "../src/lib/youtube-metadata.ts";

/** youtube-metadata dile bağımlı olmasın diye kod fırlatır; CLI burada çevirir. */
const ERRORS = {
  INVALID_URL: "geçerli bir YouTube linki değil",
  VIDEO_NOT_FOUND: "video bulunamadı (silinmiş veya gizli olabilir)",
  NO_DURATION: "parça süresi belirlenemedi",
  IS_LIVE: "canlı yayın — sabit süresi yok",
  DURATION_UNREADABLE:
    "süre okunamadı; YOUTUBE_API_KEY tanımlamayı deneyin",
  UPSTREAM_ERROR: "YouTube'a ulaşılamadı",
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAYLIST_PATH = path.join(ROOT, "data", "playlist.json");
const FORCE = process.argv.includes("--force");

function formatDuration(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

const raw = JSON.parse(await readFile(PLAYLIST_PATH, "utf8"));
const tracks = raw.tracks ?? [];
if (!Array.isArray(tracks) || tracks.length === 0) {
  console.error("data/playlist.json içinde 'tracks' dizisi boş.");
  process.exit(1);
}

const problems = [];

for (const [i, track] of tracks.entries()) {
  const label = `#${i + 1} ${track.url || track.videoId}`;

  try {
    const resolved = await resolveTrack(track.videoId || track.url);

    if (!resolved.playableInEmbed) {
      problems.push(`${label}: gömülü oynatmaya kapalı — yayında sessiz kalır.`);
    }

    track.videoId = resolved.videoId;
    track.url = resolved.url;
    // Süre senkronun temeli: her zaman tazelenir.
    track.durationSec = resolved.durationSec;
    // Elle düzeltilmiş alanlar --force verilmedikçe korunur.
    if (FORCE || !track.title) track.title = resolved.title;
    if (FORCE || !track.artist) track.artist = resolved.artist;
    if (FORCE || !track.thumbnail) track.thumbnail = resolved.thumbnail;

    console.log(
      `✓ ${label} → ${track.artist} — ${track.title} (${formatDuration(track.durationSec)})`,
    );
  } catch (err) {
    problems.push(`${label}: ${ERRORS[err.message] ?? err.message}`);
  }
}

// Alanları sabit sırada yaz ki diff'ler okunabilir kalsın.
raw.tracks = tracks
  .filter((t) => extractVideoId(t.videoId || t.url || ""))
  .map((t) => ({
    videoId: t.videoId,
    title: t.title,
    artist: t.artist,
    durationSec: t.durationSec,
    thumbnail: t.thumbnail,
    url: t.url,
  }));

await writeFile(PLAYLIST_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

const total = raw.tracks.reduce((sum, t) => sum + (t.durationSec || 0), 0);
console.log(`\n${raw.tracks.length} parça · toplam ${formatDuration(total)} · data/playlist.json güncellendi.`);

if (problems.length) {
  console.error(`\n⚠️  ${problems.length} sorun:`);
  for (const p of problems) console.error(`   - ${p}`);
  process.exitCode = 1;
}
