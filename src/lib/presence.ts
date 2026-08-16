import "server-only";

import { Redis } from "@upstash/redis";

/**
 * Anlık dinleyici sayısı.
 *
 * Sayım HyperLogLog ile yapılıyor: her dinleyici kendi rastgele kimliğini bir
 * zaman kovasına ekliyor, kovanın kardinalitesi de "kaç kişi dinliyor" oluyor.
 * HLL sabit ~12 KB yer kaplar — kaç dinleyici olursa olsun.
 *
 * Buradaki bütün tasarım kararları tek bir kısıttan çıkıyor: Upstash'in
 * ücretsiz katmanı aylık 500.000 komut ve bu bütçeyi istasyon okumalarıyla
 * paylaşıyoruz. Bu yüzden:
 *
 *   - Kalp atışı 5 dakikada bir (saniyede değil).
 *   - Yalnızca ses gerçekten çalarken gönderiliyor; sayfayı açıp play'e
 *     basmayan ziyaretçi hiç komut harcamıyor. Hem ucuz hem daha doğru:
 *     "dinleyici" zaten dinleyen kişi demek.
 *   - Kovanın son kullanma tarihi kova başına bir kez yazılıyor.
 *
 * Bunun bedeli: sayı 5 dakikaya kadar gecikmeli. Bir radyo için kabul
 * edilebilir; gerçek zamanlı olması kalıcı bağlantı gerektirirdi.
 */

/** Kova genişliği. Kısaltmak sayıyı tazeler, maliyeti doğrudan artırır. */
const BUCKET_SEC = 300;
/** Kovalar kendiliğinden silinsin; iki kova geriye bakmaya yetecek kadar. */
const BUCKET_TTL_SEC = BUCKET_SEC * 3;

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

/** Redis yoksa özellik kapalıdır; arayüz sayaç göstermez. */
export const presenceEnabled = Boolean(redisUrl && redisToken);

let redis: Redis | null = null;
function getRedis(): Redis {
  redis ??= new Redis({ url: redisUrl!, token: redisToken! });
  return redis;
}

function bucketKey(index: number): string {
  return `radio:listeners:${index}`;
}

/** Son kullanma tarihi yazılmış kova; her kova için bir kez yeter. */
let expiredBucket = -1;

/**
 * Dinleyiciyi kaydeder ve güncel sayıyı döndürür.
 *
 * Sayım bu kovayla bir öncekini birleştirerek yapılıyor. Tek kovaya bakmak,
 * kova sınırının hemen ardından sayacın sıfıra düşmesine yol açardı.
 */
export async function recordListener(id: string): Promise<number> {
  const bucket = Math.floor(Date.now() / 1000 / BUCKET_SEC);
  const key = bucketKey(bucket);

  const client = getRedis();
  await client.pfadd(key, id);

  if (expiredBucket !== bucket) {
    expiredBucket = bucket;
    // Beklemiyoruz: sayacı geciktirmesin, başarısız olursa da kova zaten
    // bir sonraki turda yeniden işaretlenir.
    void client.expire(key, BUCKET_TTL_SEC).catch(() => {});
  }

  return client.pfcount(key, bucketKey(bucket - 1));
}

/** Yazmadan yalnızca okur. */
export async function countListeners(): Promise<number> {
  const bucket = Math.floor(Date.now() / 1000 / BUCKET_SEC);
  return getRedis().pfcount(bucketKey(bucket), bucketKey(bucket - 1));
}
