#!/usr/bin/env node
/**
 * Orbitcast — playlist sihirbazı.
 *
 *   npm run radio:add                      etkileşimli sihirbaz
 *   npm run radio:add -- <link> [<link>…]  doğrudan ekle (soru sormaz)
 *
 * Tek şarkı linki de YouTube playlist linki de kabul edilir; hangisi olduğu
 * otomatik anlaşılır. Metadata (başlık, sanatçı, süre, kapak) YouTube'dan
 * çekilir, `data/playlist.json` sisteme uygun biçimde yazılır.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import {
  extractPlaylistId,
  extractVideoId,
  resolvePlaylistVideoIds,
  resolveTrack,
} from "../src/lib/youtube-metadata.ts";
import { rebaseEpoch } from "../src/lib/radio.ts";
import { resolveStorageKind } from "../src/lib/storage/index.ts";
import { importAudioFolder } from "./lib/audio-import.mjs";
import { broadcastSource, readDoc, storeKind, storeLabel, writeDoc } from "./lib/store.mjs";

/** Aynı anda kaç parça çözümlensin. YouTube'u yormayacak kadar düşük. */
const CONCURRENCY = 4;

/** youtube-metadata dile bağımlı olmasın diye kod fırlatır; CLI burada çevirir. */
const ERRORS = {
  INVALID_URL: "geçerli bir YouTube linki değil",
  VIDEO_NOT_FOUND: "video bulunamadı (silinmiş veya gizli olabilir)",
  NO_DURATION: "parça süresi belirlenemedi",
  IS_LIVE: "canlı yayın — sabit süresi yok",
  DURATION_UNREADABLE: "süre okunamadı; YOUTUBE_API_KEY tanımlamayı deneyin",
  UPSTREAM_ERROR: "YouTube'a ulaşılamadı",
  INVALID_PLAYLIST_URL: "geçerli bir YouTube playlist adresi değil",
  PLAYLIST_NOT_FOUND: "playlist bulunamadı (gizli veya silinmiş olabilir)",
  PLAYLIST_EMPTY: "playlist boş görünüyor",
  AUDIO_FOLDER_NOT_FOUND: "klasör bulunamadı",
  AUDIO_FOLDER_EMPTY: "klasörde ses dosyası yok",
  AUDIO_DURATION_UNREADABLE: "süre okunamadı (bozuk dosya olabilir)",
  STORE_READ_ONLY: "bu kaynak salt okunur; liste YouTube'da yönetiliyor",
  REDIS_UNREACHABLE:
    "Redis'e bağlanılamadı — .env.local içindeki UPSTASH_REDIS_REST_URL ve " +
    "UPSTASH_REDIS_REST_TOKEN değerlerini kontrol edin (`npm run radio:setup` ile " +
    "yeniden girebilirsiniz)",
};

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};

const log = (line = "") => console.log(line);
const logError = (line) => console.error(c.red(line));
const errorMessage = (err) => ERRORS[err.message] ?? err.message;

function formatDuration(seconds) {
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`;
}

function formatTotalDuration(tracks) {
  const total = tracks.reduce((sum, t) => sum + (t.durationSec || 0), 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours} sa ${minutes} dk` : `${minutes} dk`;
}

const readPlaylist = readDoc;
const writePlaylist = writeDoc;

/**
 * Liste değiştikten sonra yayın başlangıcını yerine oturtur.
 *
 * Karıştırılması kolay iki ayrı durum var:
 *
 *   Liste boştu  — epoch şimdiye alınır, yayın ilk parçadan başlar. Şablon
 *                  eski bir tarihle geldiği için gerekli; yoksa yayın
 *                  listenin ortasından açılırdı.
 *
 *   Liste uzadı  — epoch'a *dokunmamak* yayını sabit tutmuyor, tam tersine
 *                  kaydırıyor. Konum `(now - epoch) mod toplamSüre` ile
 *                  bulunduğundan toplam süre değişince modulo başka yere
 *                  düşer ve sapma her turda birikir. Sesin yerinde kalması
 *                  için epoch geri sarılmak zorunda.
 *
 * `ask` verilmezse (komut satırı argümanlarıyla çalıştırma) soru sorulmaz ve
 * dinleyiciyi rahatsız etmeyen seçenek uygulanır.
 */
async function settleEpoch(doc, previousCount, ask) {
  if (previousCount === 0 && doc.tracks.length > 0) {
    doc.epoch = new Date().toISOString();
    log(c.dim("  Liste boştu; yayın başlangıcı şimdiye ayarlandı."));
    return;
  }

  if (doc.tracks.length === previousCount) return;

  // Parçalar yalnızca sona ekleniyor; önceki liste ilk N parçadır.
  const previous = doc.tracks.slice(0, previousCount);
  const rebased = rebaseEpoch(
    {
      epochMs: Date.parse(doc.epoch),
      tracks: previous,
      totalDurationSec: previous.reduce((sum, t) => sum + t.durationSec, 0),
    },
    doc.tracks,
    Date.now(),
  );

  // Çalan parça yeni listede yoksa korunacak bir konum da yok.
  if (rebased === null) return;

  if (ask) {
    log();
    log(c.dim("  Liste uzadı. epoch'a dokunulmazsa yayın kayar: toplam süre"));
    log(c.dim("  değiştiği için dinleyiciler başka bir parçaya atlar."));
    const answer = (await ask("  Yayın kesintisiz devam etsin mi? [E/h] "))
      .trim()
      .toLowerCase();
    if (answer === "h" || answer === "n") {
      log(c.yellow("  epoch korundu; yayın konumu kaydı."));
      return;
    }
  }

  doc.epoch = new Date(rebased).toISOString();
  log(c.dim("  Yayın konumu korundu; epoch yeniden hesaplandı."));
}

/**
 * Video kimliklerini paralel olarak çözer, ilerlemeyi tek satırda gösterir.
 * Başarısız olanlar atlanır ve sonda raporlanır.
 */
async function resolveAll(videoIds, existingIds) {
  const resolved = [];
  const skipped = [];
  let completed = 0;

  const showProgress = () => {
    if (!stdout.isTTY) return;
    stdout.write(`\r  ${c.dim(`çözümleniyor ${completed}/${videoIds.length}`)}   `);
  };

  const queue = [...videoIds.entries()];
  const worker = async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const [order, videoId] = next;

      if (existingIds.has(videoId)) {
        skipped.push({ videoId, reason: "zaten listede" });
      } else {
        try {
          const track = await resolveTrack(videoId);
          if (!track.playableInEmbed) {
            skipped.push({ videoId, reason: "gömülü oynatmaya kapalı" });
          } else {
            resolved.push({ order, track });
            existingIds.add(videoId);
          }
        } catch (err) {
          skipped.push({ videoId, reason: errorMessage(err) });
        }
      }

      completed += 1;
      showProgress();
    }
  };

  showProgress();
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, videoIds.length) }, worker));
  if (stdout.isTTY) stdout.write("\r".padEnd(40) + "\r");

  // Girilen sırayı koru
  resolved.sort((a, b) => a.order - b.order);
  return { added: resolved.map((r) => r.track), skipped };
}

/** Bir link kümesini (tekli ve/veya playlist) video kimliklerine açar. */
async function expandLinks(inputs) {
  const videoIds = [];
  const failures = [];

  for (const input of inputs) {
    const playlistId = extractPlaylistId(input);
    const videoId = extractVideoId(input);

    // "watch?v=…&list=…" hem video hem liste taşır; tekil video kazanır.
    if (videoId) {
      videoIds.push(videoId);
      continue;
    }

    if (playlistId) {
      try {
        log(c.dim(`  playlist açılıyor: ${playlistId}`));
        const found = await resolvePlaylistVideoIds(input);
        log(c.dim(`  ${found.length} parça bulundu`));
        videoIds.push(...found);
      } catch (err) {
        failures.push(`${input}: ${errorMessage(err)}`);
      }
      continue;
    }

    failures.push(`${input}: ${ERRORS.INVALID_URL}`);
  }

  return { videoIds, failures };
}

function report(added, skipped) {
  for (const track of added) {
    log(
      `  ${c.green("✓")} ${track.artist} — ${track.title} ` +
        c.dim(`(${formatDuration(track.durationSec)})`),
    );
  }
  for (const item of skipped) {
    log(`  ${c.yellow("−")} ${item.videoId} ${c.dim(`(${item.reason})`)}`);
  }
}

// --- Etkileşimli akış --------------------------------------------------------

async function runWizard() {
  const rl = createInterface({ input: stdin, output: stdout });

  // Girdi biterse (Ctrl+D) readline kendini kapatır; sonraki soru çirkin bir
  // stack trace ile patlamasın diye sessizce boş cevap dönüyoruz.
  let closed = false;
  rl.on("close", () => {
    closed = true;
  });

  const ask = async (question) => {
    if (closed) return "";
    try {
      return await rl.question(question);
    } catch {
      closed = true;
      return "";
    }
  };

  try {
    for (;;) {
      const doc = await readPlaylist();

      log();
      log(c.bold("  Orbitcast · playlist sihirbazı"));
      log(
        c.dim(`  ${doc.name} · ${doc.tracks.length} parça · ${formatTotalDuration(doc.tracks)}`),
      );
      // Hangi depoya yazdığımızı görünür kılmak şart: script dosyaya yazarken
      // sitenin Redis'ten okuduğu bir kurulumda değişiklikler kayboluyor gibi
      // görünüyordu.
      log(c.dim(`  depo: ${storeLabel()}`));

      if (storeKind() === "redis") {
        // Yazma işlemi hem Redis'e hem yedek dosyaya gidiyor; bu satır olmazsa
        // git'te beliren değişiklik sürpriz oluyor.
        log(c.dim("  data/playlist.json yedek liste olarak birlikte güncelleniyor"));
      }

      if (broadcastSource(doc) === "youtube") {
        log();
        log(c.yellow("  Yayın doğrudan bir YouTube playlist'inden okunuyor."));
        log(c.dim("  Parçaları YouTube'daki listeden ekleyip çıkarın. Burada"));
        log(c.dim("  yaptığınız değişiklikler istasyon bilgilerine ve YouTube'a"));
        log(c.dim("  ulaşılamadığında devreye giren yedek listeye işler."));
      }

      log();
      log("  1) Şarkı ekle (tek veya birden çok link)");
      log("  2) YouTube playlist'i içe aktar");
      log("  3) Yerel ses dosyalarını ekle (klasör tara)");
      log("  4) İstasyon bilgilerini düzenle");
      log("  5) Listeyi göster");
      log("  6) Parça çıkar");
      log("  0) Çık");
      log();

      const choice = (await ask("  Seçim: ")).trim();

      // Girdi bittiyse ask() boş döner; ayrıca kontrol gerekmiyor.
      if (choice === "0" || choice === "") break;
      else if (choice === "1") await addTracks(ask, doc);
      else if (choice === "2") await importPlaylist(ask, doc);
      else if (choice === "3") await addLocalFiles(ask, doc);
      else if (choice === "4") await editStation(ask, doc);
      else if (choice === "5") showList(doc);
      else if (choice === "6") await removeTracks(ask, doc);
      else logError("  Geçersiz seçim.");
    }
  } finally {
    rl.close();
  }
}

async function addTracks(ask, doc) {
  log();
  log(c.dim("  Linkleri yapıştırın. Birden çoksa her satıra bir tane."));
  log(c.dim("  Bitirmek için boş satırda Enter."));
  log();

  const inputs = [];
  for (;;) {
    const line = (await ask("  > ")).trim();
    if (!line) break;
    inputs.push(...line.split(/[\s,]+/).filter(Boolean));
  }

  if (inputs.length === 0) return;

  const { videoIds, failures } = await expandLinks(inputs);
  failures.forEach((failure) => logError(`  ✗ ${failure}`));
  if (videoIds.length === 0) return;

  const existing = new Set(doc.tracks.map((t) => t.videoId));
  const { added, skipped } = await resolveAll(videoIds, existing);

  log();
  report(added, skipped);
  if (added.length === 0) return;

  log();
  const answer = (await ask(`  ${added.length} parça eklensin mi? [E/h] `)).trim().toLowerCase();
  if (answer === "h" || answer === "n") return;

  const before = doc.tracks.length;
  doc.tracks.push(...added);
  await settleEpoch(doc, before, ask);
  await writePlaylist(doc);
  log(c.green(`  ${added.length} parça eklendi.`));
}

async function importPlaylist(ask, doc) {
  log();
  const link = (await ask("  Playlist adresi: ")).trim();
  if (!link) return;

  let videoIds;
  try {
    videoIds = await resolvePlaylistVideoIds(link);
  } catch (err) {
    logError(`  ✗ ${errorMessage(err)}`);
    return;
  }

  log(c.dim(`  ${videoIds.length} parça bulundu.`));
  if (!process.env.YOUTUBE_API_KEY && videoIds.length >= 100) {
    log(
      c.yellow(
        "  Not: anahtarsız yöntem ilk ~100 parçayla sınırlı. Tamamı için YOUTUBE_API_KEY tanımlayın.",
      ),
    );
  }

  const howMany = (await ask("  Kaç tanesi eklensin? [hepsi] ")).trim();
  const limit = howMany ? Number(howMany) : videoIds.length;
  const selected = Number.isFinite(limit) && limit > 0 ? videoIds.slice(0, limit) : videoIds;

  // Varsayılan davranış "üstüne ekle" olduğu için, yeni bir liste kurmak
  // isteyen herkes önce eski parçaları tek tek silmek zorunda kalıyordu.
  const replace = doc.tracks.length > 0 && (await askReplace(ask, doc));

  const existing = new Set(replace ? [] : doc.tracks.map((t) => t.videoId));
  const { added, skipped } = await resolveAll(selected, existing);

  log();
  report(added, skipped);
  if (added.length === 0) return;

  log();
  const question = replace
    ? `  Liste ${added.length} parçayla değiştirilsin mi? [E/h] `
    : `  ${added.length} parça eklensin mi? [E/h] `;
  const answer = (await ask(question)).trim().toLowerCase();
  if (answer === "h" || answer === "n") return;

  const before = replace ? 0 : doc.tracks.length;
  doc.tracks = replace ? added : [...doc.tracks, ...added];
  await settleEpoch(doc, before, ask);
  await writePlaylist(doc);
  log(c.green(replace ? `  Liste ${added.length} parçayla değiştirildi.` : `  ${added.length} parça eklendi.`));
}

/** Mevcut listenin korunup korunmayacağını sorar. */
async function askReplace(ask, doc) {
  log();
  log(`  Listede ${doc.tracks.length} parça var.`);
  log("    1) Üstüne ekle");
  log("    2) Listeyi bu playlist ile değiştir");
  const answer = (await ask("  Seçim [1]: ")).trim();
  return answer === "2";
}

/** Yerel ses dosyalarını yapılandırılmış depoya alıp listeye ekler. */
async function addLocalFiles(ask, doc) {
  // Depo seçimi kurulumda yapılıyor; burada yalnızca hangisinin geçerli
  // olduğunu söylüyoruz ki dosyaların nereye gittiği sürpriz olmasın.
  const target =
    resolveStorageKind() === "r2"
      ? "Cloudflare R2'ye yüklenir, repo değişmez."
      : "public/audio altına kopyalanır ve repoya dahil olur.";

  log();
  log(c.dim("  Ses dosyalarının bulunduğu klasörü verin; alt klasörler de taranır."));
  log(c.dim(`  Dosyalar ${target}`));
  log();

  const folder = (await ask("  Klasör: ")).trim();
  if (!folder) return;

  const existing = new Set(doc.tracks.map((t) => t.videoId));
  let result;
  try {
    result = await importAudioFolder(folder, existing, (done, total, name) => {
      if (!stdout.isTTY) return;
      stdout.write(`\r  ${c.dim(`okunuyor ${done}/${total} · ${name.slice(0, 40)}`)}`.padEnd(70));
    });
  } catch (err) {
    if (stdout.isTTY) stdout.write("\r".padEnd(72) + "\r");
    logError(`  ✗ ${errorMessage(err)}`);
    return;
  }
  if (stdout.isTTY) stdout.write("\r".padEnd(72) + "\r");

  log();
  for (const track of result.tracks) {
    log(
      `  ${c.green("✓")} ${track.artist} — ${track.title} ` +
        c.dim(`(${formatDuration(track.durationSec)})`),
    );
  }
  for (const item of result.skipped) {
    log(`  ${c.yellow("−")} ${item.name} ${c.dim(`(${errorMessage(new Error(item.reason))})`)}`);
  }
  if (result.tracks.length === 0) return;

  log();
  log(c.dim(`  Repoya eklenecek boyut: ${(result.bytes / 1024 / 1024).toFixed(1)} MB`));
  const answer = (await ask(`  ${result.tracks.length} parça eklensin mi? [E/h] `))
    .trim()
    .toLowerCase();
  if (answer === "h" || answer === "n") return;

  const before = doc.tracks.length;
  doc.tracks.push(...result.tracks);
  await settleEpoch(doc, before, ask);
  await writePlaylist(doc);
  log(c.green(`  ${result.tracks.length} parça eklendi.`));
}

async function editStation(ask, doc) {
  log();
  log(c.dim("  Boş bırakırsanız mevcut değer korunur."));
  log();

  const fields = [
    ["name", "İstasyon adı"],
    ["tagline", "Slogan"],
    ["shareTagline", "Paylaşım metni"],
  ];

  for (const [key, label] of fields) {
    const answer = (await ask(`  ${label} ${c.dim(`[${doc[key]}]`)}: `)).trim();
    if (answer) doc[key] = answer;
  }

  await writePlaylist(doc);
  log(c.green("  İstasyon bilgileri kaydedildi."));
}

function showList(doc) {
  log();
  doc.tracks.forEach((track, i) => {
    log(
      `  ${String(i + 1).padStart(3)}. ${track.artist} — ${track.title} ` +
        c.dim(`(${formatDuration(track.durationSec)})`),
    );
  });
  log(c.dim(`  toplam ${formatTotalDuration(doc.tracks)}`));
}

async function removeTracks(ask, doc) {
  showList(doc);
  log();
  const answer = (
    await ask("  Çıkarılacak sıra numarası (virgülle çoğaltın, tümü için 'hepsi'): ")
  ).trim();
  if (!answer) return;

  if (answer.toLowerCase() === "hepsi" || answer === "*") {
    const confirmed = (await ask(`  ${doc.tracks.length} parçanın tamamı silinsin mi? [e/H] `))
      .trim()
      .toLowerCase();
    if (confirmed !== "e" && confirmed !== "y") return;
    const count = doc.tracks.length;
    doc.tracks = [];
    await writePlaylist(doc);
    log(c.green(`  ${count} parça çıkarıldı, liste boş.`));
    return;
  }

  const positions = answer
    .split(/[\s,]+/)
    .map((n) => Number(n) - 1)
    .filter((n) => Number.isInteger(n) && n >= 0 && n < doc.tracks.length);

  if (positions.length === 0) {
    logError("  Geçerli sıra numarası girilmedi.");
    return;
  }

  const removing = positions.map((i) => doc.tracks[i]);
  log();
  removing.forEach((track) => log(`  ${c.red("−")} ${track.artist} — ${track.title}`));

  const confirmed = (await ask(`  ${removing.length} parça çıkarılsın mı? [E/h] `))
    .trim()
    .toLowerCase();
  if (confirmed === "h" || confirmed === "n") return;

  const toRemove = new Set(positions);
  doc.tracks = doc.tracks.filter((_, i) => !toRemove.has(i));
  await writePlaylist(doc);
  log(c.green(`  ${removing.length} parça çıkarıldı.`));
}

// --- Soru sormayan mod -------------------------------------------------------

async function addFromArguments(inputs) {
  const doc = await readPlaylist();
  const { videoIds, failures } = await expandLinks(inputs);
  failures.forEach((failure) => logError(`✗ ${failure}`));

  if (videoIds.length === 0) {
    process.exitCode = 1;
    return;
  }

  const existing = new Set(doc.tracks.map((t) => t.videoId));
  const { added, skipped } = await resolveAll(videoIds, existing);
  report(added, skipped);

  if (added.length === 0) return;

  const before = doc.tracks.length;
  doc.tracks.push(...added);
  // Etkileşimsiz yol: soru sorulmaz, dinleyiciyi rahatsız etmeyen seçenek.
  await settleEpoch(doc, before);
  await writePlaylist(doc);
  log(c.green(`${added.length} parça eklendi · toplam ${doc.tracks.length}`));
}

/**
 * Beklenen hataları okunabilir biçimde bildirir.
 *
 * Depo erişimi ağa bağlı olduğu için burada ham bir yığın izi görmek çok kolay;
 * kullanıcıya lazım olan tek şey ise ne yapması gerektiği.
 */
function fail(err) {
  logError(`\n  ✗ ${errorMessage(err)}`);
  if (err.cause) log(c.dim(`  (${err.cause.message.split(",")[0]})`));
  process.exitCode = 1;
}

const args = process.argv.slice(2);

if (args.length > 0) {
  await addFromArguments(args).catch(fail);
} else if (!stdin.isTTY) {
  // Sihirbaz gerçek bir terminal ister. Boru/CI ortamında linkleri argüman
  // olarak almak hem çalışır hem de yarım kalmış bir soru-cevaptan iyidir.
  log(c.bold("Orbitcast · playlist sihirbazı"));
  log();
  log("  Etkileşimli sihirbaz için bir terminalde çalıştırın:");
  log(c.cyan("    npm run radio:add"));
  log();
  log("  Boru veya betik içinde linkleri argüman olarak verin:");
  log(c.cyan("    npm run radio:add -- <link> [<link>…]"));
  log();
  log(c.dim("  Tek şarkı linki de playlist linki de olur."));
  process.exitCode = 1;
} else {
  await runWizard().catch(fail);
}
