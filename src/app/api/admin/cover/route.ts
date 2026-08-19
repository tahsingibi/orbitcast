import { NextResponse } from "next/server";

import { isAuthenticated } from "@/lib/admin-auth";
import { slugify } from "@/lib/audio-meta";
import { ingestCover } from "@/lib/cover";
import { getI18n } from "@/lib/i18n/server";
import { contentTypeFor, resolveStorage } from "@/lib/storage";

/**
 * Tek bir parçanın kapağını değiştirir.
 *
 * `upload` ucundan ayrı: orası yeni bir parça kuruyor ve ses dosyası istiyor.
 * Burada parça zaten listede, yalnızca görseli değişiyor. İki kaynak kabul
 * ediliyor — yüklenen dosya ya da bir adres (YouTube linki de olur, kapak
 * kalite merdiveninden indirilir).
 *
 * `resolve` ile aynı sözleşme: listeyi yazmaz, yalnızca yeni adresi döndürür.
 * Kaydetme paneldeki mevcut akıştan geçer.
 */
export const dynamic = "force-dynamic";

const MAX_COVER_BYTES = 5 * 1024 * 1024;

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
  if (!form) {
    return NextResponse.json({ error: t.errors.invalidBody }, { status: 400 });
  }

  // Kapak dosyası parçanın kimliğiyle adlandırılıyor; aynı parçaya ikinci kez
  // kapak seçmek eskisinin üzerine yazıyor, depoda çöp birikmiyor.
  const raw = String(form.get("videoId") ?? "").trim();
  const id = raw ? slugify(raw) : "";
  if (!raw || !id) {
    return NextResponse.json({ error: t.errors.invalidBody }, { status: 400 });
  }

  const storage = resolveStorage();
  const file = form.get("file");
  const url = String(form.get("coverUrl") ?? "").trim();

  try {
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_COVER_BYTES) {
        return NextResponse.json({ error: t.errors.uploadTooLarge }, { status: 413 });
      }
      if (!file.type.startsWith("image/")) {
        return NextResponse.json({ error: t.errors.uploadBadType }, { status: 400 });
      }

      const key = `covers/${id}${extensionOf(file.name) || ".jpg"}`;
      const thumbnail = await storage.put({
        key,
        body: Buffer.from(await file.arrayBuffer()),
        contentType: contentTypeFor(key),
      });
      return NextResponse.json({ thumbnail });
    }

    if (url) {
      const thumbnail = await ingestCover({ source: url, id, storage });
      if (!thumbnail) {
        return NextResponse.json({ error: t.errors.coverUnreadable }, { status: 400 });
      }
      return NextResponse.json({ thumbnail });
    }

    return NextResponse.json({ error: t.errors.uploadNoFile }, { status: 400 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `${t.errors.uploadFailed} (${detail})` }, { status: 502 });
  }
}
