/**
 * AWS Signature Version 4 — yalnızca ihtiyacımız olan kadarı.
 *
 * Neden elle yazıldı: `@aws-sdk/client-s3` bu iş için ~15 MB'lık bir bağımlılık
 * getiriyor ve ondan tek bir şey istiyoruz: bir PUT isteğini imzalamak.
 * `mp3.mjs` ile aynı gerekçe — proje sıfır bağımlılıkla kurulabilsin.
 *
 * Kapsam bilinçli olarak dar: tek parça (streaming olmayan) gövde, başlıkla
 * imzalama, R2'nin beklediği `auto` bölgesi.
 *
 * Presigned URL üretimi yok. R2'de imzalı adresler custom domain ile
 * çalışmıyor; oynatma tarafı public custom domain + WAF kuralı ile korunuyor.
 * Burada imza yalnızca *yükleme* için gerekiyor.
 */

import { createHash, createHmac } from "node:crypto";

const ALGORITHM = "AWS4-HMAC-SHA256";

export type SignInput = {
  method: string;
  url: URL;
  /**
   * İmzaya girecek başlıklar. `host` ve `x-amz-date` otomatik ekleniyor;
   * S3'ün istediği `x-amz-content-sha256` gibi servise özgü olanları çağıran
   * verir — bu dosya AWS imzalamasından fazlasını bilmesin.
   */
  headers: Record<string, string>;
  body: Uint8Array;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  /** Testlerin zamanı sabitleyebilmesi için. */
  now?: Date;
};

export const sha256hex = (data: Uint8Array | string) =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: Uint8Array | string, data: string) =>
  createHmac("sha256", key).update(data).digest();

/**
 * RFC 3986 kodlaması.
 *
 * `encodeURIComponent` bu beş karakteri kodlamadan bırakıyor ama AWS onları
 * kodlanmış bekliyor; eşleşmezse imza tutmaz ve hata "SignatureDoesNotMatch"
 * olarak döner — sebebi de söylenmez. O yüzden elle tamamlıyoruz.
 */
function encodeSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * İsteği imzalar ve gönderilecek başlıkların tamamını döndürür.
 *
 * Dönen nesne `fetch`e olduğu gibi verilir: içinde `Authorization` ile birlikte
 * imzaya dahil edilen `host` ve `x-amz-date` de vardır. Bunlardan biri yolda
 * değişirse imza geçersiz olur.
 */
export function signRequest(input: SignInput): Record<string, string> {
  const { method, url, body, accessKeyId, secretAccessKey, region, service } = input;
  const now = input.now ?? new Date();

  // "2026-08-17T09:20:44.840Z" -> "20260817T092044Z"
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256hex(body);

  const headers: Record<string, string> = {
    ...input.headers,
    host: url.host,
    "x-amz-date": amzDate,
  };

  // Başlıklar küçük harfe indirilip ada göre sıralanıyor; imza bu sıraya
  // duyarlı, değerlerdeki fazla boşluklar da tekilleştiriliyor.
  const entries = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, " ")] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const canonicalHeaders = entries.map(([name, value]) => `${name}:${value}\n`).join("");
  const signedHeaders = entries.map(([name]) => name).join(";");

  const canonicalUri = url.pathname.split("/").map(encodeSegment).join("/");

  // Aynı anahtar birden çok kez geçebildiği için sıralama değere kadar iniyor;
  // yalnızca anahtara bakmak tekrarlı parametrelerde imzayı bozuyor.
  const canonicalQuery = [...url.searchParams.entries()]
    .map(([key, value]) => [encodeSegment(key), encodeSegment(value)] as const)
    .sort(([ka, va], [kb, vb]) =>
      ka < kb ? -1 : ka > kb ? 1 : va < vb ? -1 : va > vb ? 1 : 0,
    )
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [ALGORITHM, amzDate, scope, sha256hex(canonicalRequest)].join("\n");

  // Anahtar zinciri: her adım bir öncekinin çıktısını anahtar olarak kullanır.
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  return {
    ...headers,
    Authorization:
      `${ALGORITHM} Credential=${accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
