/**
 * `mp3.mjs` için tip bildirimi.
 *
 * Çözümleyici bilinçli olarak düz JavaScript: bağımlılıksız çalışması ve
 * script'lerden derlenmeden kullanılabilmesi gerekiyor. TypeScript tarafında
 * doğru şekli görebilmek için sözleşmesi burada duruyor — özellikle `picture`,
 * çıkarımla `never` olarak görünüyor ve kapak yükleme kodunu kırıyordu.
 */

export type AudioPicture = {
  /** ID3'ten gelen MIME tipi; genelde image/jpeg ya da image/png. */
  mime: string;
  data: Uint8Array;
};

export type AudioMeta = {
  /** Kesirli olabilir; yuvarlamak çağırana kalmış. */
  durationSec: number;
  title: string;
  artist: string;
  album: string;
  picture: AudioPicture | null;
};

/** Bellekteki bir MP3'ü çözer. Süre bulunamazsa `durationSec` 0 döner. */
export function readAudioBuffer(buffer: Uint8Array): AudioMeta;

/** Diskteki bir ses dosyasını çözer; süre okunamazsa hata fırlatır. */
export function readAudioFile(filePath: string): Promise<AudioMeta>;
