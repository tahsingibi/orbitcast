/**
 * Cloudflare R2 deposu.
 *
 * İki ayrı adres kullanılıyor ve bu ayrım kritik:
 *
 *   yükleme — <hesap>.r2.cloudflarestorage.com  (S3 API, imzalı, gizli)
 *   oynatma — R2_PUBLIC_URL                     (custom domain, public, cache'li)
 *
 * Neden ikisi? R2'de imzalı (presigned) adresler custom domain ile
 * çalışmıyor, custom domain de Cloudflare cache'i ve WAF kurallarının tek
 * yolu. İkisini birleştirmek Pro plan gerektiriyor. Bu yüzden yükleme
 * imzalanır, oynatma public bırakılır ve hotlink koruması WAF tarafında
 * `Referer` kuralıyla yapılır (README'de kurulum adımı olarak anlatılıyor).
 *
 * Pratik sonuç: buradaki anahtarlar hiçbir zaman istemciye ulaşmaz, yalnızca
 * R2_PUBLIC_URL herkese görünür.
 */

import type { AudioStorage, PutInput } from "./index.ts";
import { sha256hex, signRequest } from "./sigv4.ts";

const REQUIRED = [
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_URL",
] as const;

const read = (name: string) => (process.env[name] ?? "").trim();

/** Beş değişkenin tamamı doluysa R2 kullanılabilir. Eksik yapılandırma yarım kalmasın. */
export function hasR2Env(): boolean {
  return REQUIRED.every((name) => read(name) !== "");
}

/**
 * Public adresi kullanılabilir bir tabana indirger.
 *
 * Şemayı yazmayı unutmak çok kolay ("cdn.site.com"). O hâliyle üretilen `src`
 * tarayıcıda **göreli adres** sayılır: parça kendi sitenden istenir, 404 döner
 * ve hata "dosya yok" gibi görünür — asıl sebep görünmez. Bu yüzden şema
 * yoksa https varsayılıyor, sondaki eğik çizgiler atılıyor.
 */
export function normalizePublicUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function createR2Storage(): AudioStorage {
  const missing = REQUIRED.filter((name) => read(name) === "");
  if (missing.length > 0) {
    throw new Error(`R2_ENV_MISSING: ${missing.join(", ")}`);
  }

  const accountId = read("R2_ACCOUNT_ID");
  const bucket = read("R2_BUCKET");
  const accessKeyId = read("R2_ACCESS_KEY_ID");
  const secretAccessKey = read("R2_SECRET_ACCESS_KEY");
  const publicBase = normalizePublicUrl(read("R2_PUBLIC_URL"));

  return {
    kind: "r2",
    publicBase: `${publicBase}/`,

    async put({ key, body, contentType }: PutInput): Promise<string> {
      const url = new URL(
        `/${bucket}/${key}`,
        `https://${accountId}.r2.cloudflarestorage.com`,
      );

      const headers = signRequest({
        method: "PUT",
        url,
        headers: {
          "content-type": contentType,
          // S3 gövde özetini ayrıca başlıkta da istiyor ve imzaya dahil ediyor.
          "x-amz-content-sha256": sha256hex(body),
        },
        body,
        accessKeyId,
        secretAccessKey,
        // R2 tek bir sanal bölge sunuyor; imzada da bu ad bekleniyor.
        region: "auto",
        service: "s3",
      });

      const res = await fetch(url, { method: "PUT", headers, body: body as BodyInit });
      if (!res.ok) {
        // Gövde S3 biçiminde XML hata döndürüyor; kısaltıp bırakıyoruz ki
        // "SignatureDoesNotMatch" gibi asıl sebep görünür kalsın.
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        throw new Error(`R2_PUT_FAILED ${res.status} ${detail}`);
      }

      return `${publicBase}/${key}`;
    },
  };
}
