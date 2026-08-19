/**
 * Ses dosyaları nerede saklanıyor?
 *
 * Bu, `playlist-store.ts`'deki "liste nereden okunuyor" sorusundan **bağımsız**
 * bir eksen. Redis'ten liste okuyup R2'den ses servis etmek geçerli bir
 * kurulumdur; ikisi birbirine karışmaz.
 *
 *   local — public/audio. Dosyalar repoda durur, kurulum sıfır adımdır.
 *   r2    — Cloudflare R2. Repo temiz kalır, egress ücretsizdir.
 *
 * Oynatıcı bu ayrımı hiç görmez: `Track.src` zaten serbest bir adres, ister
 * `/audio/parca.mp3` olsun ister `https://cdn.example/parca.mp3`. Bu yüzden
 * depo değiştirmek çalışma zamanında hiçbir şeyi değiştirmiyor — yalnızca
 * içe aktarma anında hangi adresin yazıldığını belirliyor.
 */

// Uzantılar açıkça yazılıyor: bu modüller hem Next'in bundler'ı hem de
// script'leri çalıştıran düz Node ESM tarafından yükleniyor, ikincisi
// uzantısız yolu çözemiyor.
import { createLocalStorage } from "./local.ts";
import { createR2Storage, hasR2Env } from "./r2.ts";

export type StorageKind = "local" | "r2";

export type PutInput = {
  /** Depo köküne göre yol: "parca.mp3" ya da "covers/parca.jpg". */
  key: string;
  body: Uint8Array;
  contentType: string;
};

export type AudioStorage = {
  kind: StorageKind;
  /**
   * Deponun ürettiği adreslerin ortak ön eki.
   *
   * "Bu dosya zaten bizde mi?" sorusunu cevaplamak için gerekiyor: kapak
   * onarımı, dışarıda barınan görselleri içeri alırken kendi adreslerini
   * tekrar tekrar indirmemeli.
   */
  publicBase: string;
  /** Dosyayı yerleştirir ve oynatıcının kullanacağı adresi döndürür. */
  put(input: PutInput): Promise<string>;
};

/** Adres bu deponun ürettiği bir adres mi? */
export function isStoredUrl(url: string, storage: AudioStorage): boolean {
  return url.startsWith(storage.publicBase);
}

/**
 * Hangi deponun geçerli olduğu.
 *
 * Açık ayar yoksa anahtarlara bakılır — `playlist-store.ts`'deki
 * `resolveStoreKind()` ile aynı refleks: eksik yapılandırma sessizce
 * varsayılana düşer, kurulumu yarıda bırakmaz.
 *
 * Ortam değişkeni modül yüklenirken değil, çağrı anında okunuyor: script'ler
 * `.env.local` dosyasını `store.mjs` içinden yüklüyor ve ESM sıralaması
 * gereği bu modül o andan önce değerlendirilebiliyor. Modül seviyesinde
 * okunsaydı dosyadan gelen ayar hiç görünmezdi.
 */
export function resolveStorageKind(): StorageKind {
  const configured = process.env.AUDIO_STORAGE?.trim().toLowerCase();
  if (configured === "local") return "local";
  if (configured === "r2") return "r2";
  return hasR2Env() ? "r2" : "local";
}

export function resolveStorage(): AudioStorage {
  return resolveStorageKind() === "r2" ? createR2Storage() : createLocalStorage();
}

/** Uzantıdan içerik tipi; depo hangisi olursa olsun aynı tabloyu kullanır. */
export function contentTypeFor(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
    case ".aac":
      return "audio/mp4";
    case ".ogg":
    case ".opus":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    case ".flac":
      return "audio/flac";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
