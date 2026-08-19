import { NextResponse } from "next/server";

import { normalizeTrackInput } from "@/lib/track-input";
import { isAuthenticated } from "@/lib/admin-auth";
import { format } from "@/lib/i18n/format";
import { getI18n } from "@/lib/i18n/server";
import {
  copyLiveToBackup,
  readPlaylist,
  setBroadcastSource,
  storeKind,
  writePlaylist,
  type BroadcastSource,
} from "@/lib/playlist-store";
import { isEditableSource, type Track } from "@/lib/radio";
import { invalidateStationCache } from "@/lib/station";

export const dynamic = "force-dynamic";

async function guard() {
  if (await isAuthenticated()) return null;
  const { t } = await getI18n();
  return NextResponse.json({ error: t.errors.unauthorized }, { status: 401 });
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;

  const { doc, source, error } = await readPlaylist();
  return NextResponse.json({ playlist: doc, storeKind, source, sourceError: error ?? null });
}

/** İsteğin kendi kusuru olan hâller; sunucu hatası olarak raporlanmamalı. */
const CONFLICT_CODES = new Set([
  "backupPlaylistEmpty",
  "playlistUrlMissing",
  "playlistUnreadable",
  "livePlaylistEmpty",
]);

function failure(err: unknown, t: Awaited<ReturnType<typeof getI18n>>["t"]) {
  const code = (err as Error).message as keyof typeof t.errors;
  const message = (t.errors[code] as string | undefined) ?? (err as Error).message;
  return NextResponse.json(
    { error: message },
    { status: CONFLICT_CODES.has(code) ? 409 : 500 },
  );
}

const SOURCES: BroadcastSource[] = ["redis", "file", "youtube"];

/**
 * Yayın kaynağını değiştirir ya da canlı listeyi yedeğe kopyalar.
 *
 * İkisi de listenin *içeriğini* değil, yayının nereden çıkacağını ilgilendirdiği
 * için PUT'tan ayrı duruyor.
 */
export async function PATCH(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const { t } = await getI18n();

  const body = await request.json().catch(() => null);

  if (body?.action === "copyToBackup") {
    try {
      const count = await copyLiveToBackup();
      const { doc, source, error } = await readPlaylist();
      return NextResponse.json({ playlist: doc, source, sourceError: error ?? null, count });
    } catch (err) {
      return failure(err, t);
    }
  }

  if (!SOURCES.includes(body?.source)) {
    return NextResponse.json({ error: t.errors.invalidSource }, { status: 400 });
  }

  try {
    await setBroadcastSource(body.source, body.youtubePlaylistUrl);
    invalidateStationCache();
    const { doc, source, error } = await readPlaylist();
    return NextResponse.json({ playlist: doc, source, sourceError: error ?? null });
  } catch (err) {
    return failure(err, t);
  }
}

/** Playlist'in tamamını değiştirir — ekleme, silme ve sıralama aynı yoldan geçer. */
export async function PUT(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  const { t } = await getI18n();

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.tracks)) {
    return NextResponse.json({ error: t.errors.invalidBody }, { status: 400 });
  }

  const { doc: current, source: currentSource } = await readPlaylist();

  if (!isEditableSource(currentSource)) {
    return NextResponse.json(
      { error: t.errors.readOnlyWhileBackup },
      { status: 409 },
    );
  }

  const tracks: Track[] = [];
  for (const [i, raw] of body.tracks.entries()) {
    const track = normalizeTrackInput(raw);
    if (!track) {
      return NextResponse.json(
        { error: format(t.errors.trackFieldMissing, { index: i + 1 }) },
        { status: 400 },
      );
    }
    tracks.push(track);
  }

  // startAtIndex verildiyse yayın o parçanın başına çekilir.
  //
  //   elapsed = (now - epoch) mod total  olduğundan, seçilen parçanın tam
  //   şimdi başlaması için  epoch = now - (o parçaya kadarki süreler)  yeterli.
  //   Zaman sunucudan okunur; istemci saatine güvenilmez.
  let epoch = current.epoch;

  // İlk parçalar boş bir listeye ekleniyorsa yayın baştan başlasın; yoksa
  // şablonun sabit epoch'u yüzünden listenin ortasından açılırdı.
  if (current.tracks.length === 0 && tracks.length > 0) {
    epoch = new Date().toISOString();
  }

  if (body.startAtIndex !== undefined && body.startAtIndex !== null) {
    const index = Number(body.startAtIndex);
    if (!Number.isInteger(index) || index < 0 || index >= tracks.length) {
      return NextResponse.json({ error: t.errors.invalidStartIndex }, { status: 400 });
    }
    const offsetSec = tracks
      .slice(0, index)
      .reduce((sum, t) => sum + t.durationSec, 0);
    epoch = new Date(Date.now() - offsetSec * 1000).toISOString();
  }

  try {
    const saved = await writePlaylist({
      name: String(body.name || current.name).trim() || current.name,
      tagline: String(body.tagline ?? current.tagline).trim(),
      shareTagline:
        String(body.shareTagline ?? current.shareTagline).trim() || current.shareTagline,
      epoch,
      tracks,
      pinnedSource: current.pinnedSource,
      youtubePlaylistUrl: current.youtubePlaylistUrl,
    });
    invalidateStationCache();
    return NextResponse.json({ playlist: saved });
  } catch (err) {
    return failure(err, t);
  }
}
