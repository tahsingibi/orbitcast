/**
 * Bağımlılıksız MP3 okuyucu: süre, ID3 etiketleri ve gömülü kapak.
 *
 * Neden elle yazıldı: senkronizasyon parça süresine dayanıyor, yani bu değer
 * yanlışsa yayın kayıyor. Bunun için bir npm bağımlılığı eklemek yerine —
 * proje sıfır bağımlılıkla kurulabilsin diye — ihtiyacımız olan kadarını
 * doğrudan çözüyoruz.
 *
 * Süre iki yoldan bulunur:
 *   1. Xing/Info başlığı varsa (VBR dosyaların çoğunda vardır) kare sayısından
 *      birebir hesaplanır.
 *   2. Yoksa CBR varsayılıp dosya boyutu / bit hızı kullanılır.
 *
 * MP3 dışındaki biçimler için `ffprobe` varsa ona düşülür.
 */

import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const MPEG_VERSIONS = [2.5, null, 2, 1];
const SAMPLE_RATES = {
  1: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  2.5: [11025, 12000, 8000],
};
// [version][layer] -> kbps tablosu; yalnızca ihtiyacımız olan Layer III.
const BITRATES_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

/** ID3'ün 7 bitlik "syncsafe" tamsayısı. */
function syncsafe(buffer, offset) {
  return (
    (buffer[offset] << 21) |
    (buffer[offset + 1] << 14) |
    (buffer[offset + 2] << 7) |
    buffer[offset + 3]
  );
}

function decodeText(buffer, encoding) {
  // Sondaki boş sonlandırıcılar bazı yazıcılarda kalıyor; kırpıyoruz.
  const trim = (s) => s.replace(/\0+$/, "").trim();
  if (encoding === 0) return trim(buffer.toString("latin1"));
  if (encoding === 1) return trim(buffer.toString("utf16le").replace(/^﻿/, ""));
  if (encoding === 2) return trim(buffer.swap16().toString("utf16le"));
  return trim(buffer.toString("utf8"));
}

/** ID3v2 etiketini ayrıştırır. Etiket yoksa boş bir sonuç döner. */
function readId3(buffer) {
  const empty = { size: 0, title: "", artist: "", album: "", picture: null };
  if (buffer.length < 10 || buffer.toString("latin1", 0, 3) !== "ID3") return empty;

  const major = buffer[3];
  const flags = buffer[5];
  const tagSize = syncsafe(buffer, 6);
  const size = 10 + tagSize + (flags & 0x10 ? 10 : 0);

  // v2.2 çerçeve başlıkları 6 bayt; nadir olduğu için yalnızca süreyi
  // atlayabilmek adına boyutu döndürüp içeriğini okumuyoruz.
  if (major < 3) return { ...empty, size };

  let offset = 10;
  if (flags & 0x40) {
    // Genişletilmiş başlık: v2.3'te boyut kendisi hariç, v2.4'te syncsafe ve dahil.
    offset += major === 4 ? syncsafe(buffer, offset) : buffer.readUInt32BE(offset) + 4;
  }

  const out = { ...empty, size };
  const end = Math.min(10 + tagSize, buffer.length);

  while (offset + 10 <= end) {
    const id = buffer.toString("latin1", offset, offset + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;

    const frameSize =
      major === 4 ? syncsafe(buffer, offset + 4) : buffer.readUInt32BE(offset + 4);
    if (frameSize <= 0 || offset + 10 + frameSize > end) break;

    const body = buffer.subarray(offset + 10, offset + 10 + frameSize);

    if (id === "TIT2") out.title = decodeText(body.subarray(1), body[0]);
    else if (id === "TPE1") out.artist = decodeText(body.subarray(1), body[0]);
    else if (id === "TALB") out.album = decodeText(body.subarray(1), body[0]);
    else if (id === "APIC" && !out.picture) out.picture = readPicture(body);

    offset += 10 + frameSize;
  }

  return out;
}

/** APIC çerçevesinden gömülü kapağı çıkarır. */
function readPicture(body) {
  const encoding = body[0];
  const mimeEnd = body.indexOf(0, 1);
  if (mimeEnd < 0) return null;

  const mime = body.toString("latin1", 1, mimeEnd);
  let cursor = mimeEnd + 1 + 1; // MIME sonlandırıcı + resim türü baytı

  // Açıklama alanı; UTF-16'da sonlandırıcı iki bayt.
  if (encoding === 1 || encoding === 2) {
    while (cursor + 1 < body.length && !(body[cursor] === 0 && body[cursor + 1] === 0)) {
      cursor += 2;
    }
    cursor += 2;
  } else {
    const end = body.indexOf(0, cursor);
    if (end < 0) return null;
    cursor = end + 1;
  }

  const data = body.subarray(cursor);
  if (data.length < 100) return null;
  return { mime: mime.includes("png") ? "image/png" : "image/jpeg", data };
}

/** İlk geçerli MPEG kare başlığını bulup çözer. */
function readFrameHeader(buffer, from) {
  for (let i = from; i + 4 < buffer.length && i < from + 200_000; i += 1) {
    if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue;

    const version = MPEG_VERSIONS[(buffer[i + 1] >> 3) & 0x03];
    const layer = 4 - ((buffer[i + 1] >> 1) & 0x03);
    const bitrateIndex = (buffer[i + 2] >> 4) & 0x0f;
    const sampleIndex = (buffer[i + 2] >> 2) & 0x03;

    if (!version || layer !== 3 || bitrateIndex === 0 || bitrateIndex === 15) continue;
    if (sampleIndex === 3) continue;

    const sampleRate = SAMPLE_RATES[version][sampleIndex];
    const bitrate =
      (version === 1 ? BITRATES_V1_L3[bitrateIndex] : BITRATES_V2_L3[bitrateIndex]) * 1000;
    if (!sampleRate || !bitrate) continue;

    return {
      offset: i,
      version,
      sampleRate,
      bitrate,
      channelMode: (buffer[i + 3] >> 6) & 0x03,
      samplesPerFrame: version === 1 ? 1152 : 576,
    };
  }
  return null;
}

/**
 * Kare içindeki Xing/Info başlığını okur.
 *
 * Kare sayısı tek başına yetmiyor: kodlayıcı başa ve sona sessizlik ekler
 * (delay/padding). Bunlar düşülmezse süre ~40 ms uzun çıkar ve saniyeye
 * yuvarlarken bir tam saniye kayabilir — yayın akışında duyulur bir boşluk.
 */
function readXing(buffer, frame) {
  // Xing başlığının kare içindeki yeri sürüme ve kanal moduna göre değişir.
  const mono = frame.channelMode === 3;
  const offset = frame.offset + 4 + (frame.version === 1 ? (mono ? 17 : 32) : mono ? 9 : 17);
  const tag = buffer.toString("latin1", offset, offset + 4);
  if (tag !== "Xing" && tag !== "Info") return null;

  const flags = buffer.readUInt32BE(offset + 4);
  if (!(flags & 0x01)) return null; // kare sayısı alanı yok

  const frames = buffer.readUInt32BE(offset + 8);

  // Xing gövdesinden sonra LAME uyumlu etiket gelir; delay/padding onun
  // 21. baytında, 12'şer bit hâlinde duruyor.
  let cursor = offset + 8;
  if (flags & 0x01) cursor += 4;
  if (flags & 0x02) cursor += 4;
  if (flags & 0x04) cursor += 100;
  if (flags & 0x08) cursor += 4;

  let delay = 0;
  let padding = 0;
  if (cursor + 24 <= buffer.length) {
    const a = buffer[cursor + 21];
    const b = buffer[cursor + 22];
    const c = buffer[cursor + 23];
    delay = (a << 4) | (b >> 4);
    padding = ((b & 0x0f) << 8) | c;
    // Saçma değerler etiketin hiç yazılmadığını gösterir; yok sayıyoruz.
    if (delay > 3000 || padding > 5000) {
      delay = 0;
      padding = 0;
    }
  }

  return { frames, delay, padding };
}

/** ffprobe kuruluysa süreyi ondan öğrenir; yoksa null. */
async function durationViaFfprobe(filePath) {
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const seconds = Number(String(stdout).trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

/**
 * Bir ses dosyasını okur.
 *
 * Dönen `durationSec` kesirli olabilir; yuvarlamayı çağıran tarafa bırakıyoruz
 * ki toplam süre hesabında biriken hata kontrol edilebilsin.
 */
export async function readAudioFile(filePath) {
  const isMp3 = /\.mp3$/i.test(filePath);
  const buffer = isMp3 ? await readFile(filePath) : null;

  if (!isMp3) {
    const durationSec = await durationViaFfprobe(filePath);
    if (!durationSec) throw new Error("AUDIO_DURATION_UNREADABLE");
    return { durationSec, title: "", artist: "", album: "", picture: null };
  }

  const tags = readId3(buffer);
  const frame = readFrameHeader(buffer, tags.size);

  let durationSec = 0;
  if (frame) {
    const xing = readXing(buffer, frame);
    durationSec = xing
      ? Math.max(
          0,
          xing.frames * frame.samplesPerFrame - xing.delay - xing.padding,
        ) / frame.sampleRate
      : ((buffer.length - frame.offset) * 8) / frame.bitrate;
  }

  // Kendi hesabımız tutmadıysa (bozuk başlık, ham stream) ffprobe'a soruyoruz.
  if (!(durationSec > 0)) {
    durationSec = (await durationViaFfprobe(filePath)) ?? 0;
  }
  if (!(durationSec > 0)) throw new Error("AUDIO_DURATION_UNREADABLE");

  return {
    durationSec,
    title: tags.title,
    artist: tags.artist,
    album: tags.album,
    picture: tags.picture,
  };
}
