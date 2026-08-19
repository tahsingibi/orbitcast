import { NextResponse } from "next/server";

import { isAuthenticated } from "@/lib/admin-auth";
import { fromFilename, slugify } from "@/lib/audio-meta";
import { ingestCover } from "@/lib/cover";
import { getI18n } from "@/lib/i18n/server";
import { readAudioBuffer } from "@/lib/mp3.mjs";
import type { Track } from "@/lib/radio";
import { contentTypeFor, resolveStorage } from "@/lib/storage";

/**
 * Panelden yüklenen bir ses dosyasını depoya koyar ve parçayı döndürür.
 *
 * `resolve` ile aynı sözleşme: kaydetmez, yalnızca parçayı hazırlar. Panel
 * onu taslak listeye ekler, kaydetme mevcut akıştan geçer. Böylece yükleme
 * ile listeyi yazma birbirine karışmıyor.
 *
 * Süre burada kritik — senkronun tamamı ona dayanıyor. MP3'te kendi
 * çözümleyicimiz okur ve o söz sahibidir; diğer biçimlerde tarayıcının
 * ölçtüğü değere düşülür, çünkü sunucuda ffprobe olacağının garantisi yok.
 */
export const dynamic = "force-dynamic";

/** Fazlası panelden yüklenecek bir şarkı değil, kazadır. */
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** Gömülü kapak hangi uzantıyla saklanacak. */
const COVER_EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

const AUDIO_EXTENSIONS = new Set([".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".flac"]);

const extensionOf = (name: string) => {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
};

export async function POST(request: Request) {
  const { t } = await getI18n();

  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: t.errors.unauthorized }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: t.errors.uploadNoFile }, { status: 400 });
  }

  const extension = extensionOf(file.name);
  if (!AUDIO_EXTENSIONS.has(extension)) {
    return NextResponse.json({ error: t.errors.uploadBadType }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: t.errors.uploadTooLarge }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // MP3'te etiket ve süre dosyanın kendisinden geliyor.
  const parsed = extension === ".mp3" ? readAudioBuffer(buffer) : null;

  const clientDuration = Number(form.get("durationSec"));
  const durationSec =
    parsed && parsed.durationSec > 0
      ? parsed.durationSec
      : Number.isFinite(clientDuration) && clientDuration > 0
        ? clientDuration
        : 0;

  if (!(durationSec > 0)) {
    return NextResponse.json({ error: t.errors.uploadNoDuration }, { status: 400 });
  }

  const guessed = fromFilename(file.name);
  const field = (name: string) => String(form.get(name) ?? "").trim();

  const title = field("title") || parsed?.title || guessed.title || file.name;
  const artist =
    field("artist") || parsed?.artist || guessed.artist || parsed?.album || t.admin.unknownArtist;

  const id = slugify(file.name.replace(/\.[^.]+$/, ""));
  const storage = resolveStorage();

  try {
    const key = `${id}${extension}`;
    const src = await storage.put({
      key,
      body: buffer,
      contentType: contentTypeFor(key),
    });

    // Kapak önceliği: yüklenen dosya, yoksa MP3'e gömülü görsel.
    const cover = form.get("cover");
    let thumbnail = "";

    if (cover instanceof File && cover.size > 0 && cover.size <= MAX_COVER_BYTES) {
      const coverKey = `covers/${id}${extensionOf(cover.name) || ".jpg"}`;
      thumbnail = await storage.put({
        key: coverKey,
        body: Buffer.from(await cover.arrayBuffer()),
        contentType: contentTypeFor(coverKey),
      });
    } else if (parsed?.picture) {
      const coverKey = `covers/${id}.${COVER_EXTENSION[parsed.picture.mime] ?? "jpg"}`;
      thumbnail = await storage.put({
        key: coverKey,
        body: parsed.picture.data,
        contentType: contentTypeFor(coverKey),
      });
    } else if (field("coverUrl")) {
      // Son çare: verilen adresten indirilip depoya alınıyor. Adres YouTube
      // linkiyse kapak kalite merdiveninden geçiyor. Başarısızlık yüklemeyi
      // düşürmüyor — parça kapaksız da yayına girebilir.
      thumbnail = (await ingestCover({ source: field("coverUrl"), id, storage })) ?? "";
    }

    const track: Track = {
      kind: "audio",
      videoId: id,
      src,
      title,
      artist,
      durationSec: Math.round(durationSec),
      thumbnail,
      url: "",
    };

    return NextResponse.json({ track, storage: storage.kind });
  } catch (err) {
    // Depoya yazılamadı: anahtar yanlış, kota dolu, ağ kesik. Sebebi panelde
    // göstermek şart — aksi hâlde "kaydedilmedi" deyip susmuş oluruz.
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `${t.errors.uploadFailed} (${detail})` }, { status: 502 });
  }
}
