#!/usr/bin/env node
/**
 * Orbitcast — kurulum sihirbazı.
 *
 *   npm run radio:setup
 *
 * Tek amacı var: klonlayan kişinin hiçbir dosyayı elle açmadan yayına
 * çıkabilmesi. İstasyon kimliğini sorar, yayın kaynağını seçtirir, gereken
 * ortam değişkenlerini `.env.local` dosyasına yazar ve ilk listeyi doldurur.
 *
 * Var olan değerler ezilmez; her soru mevcut değeri varsayılan olarak gösterir
 * ve boş bırakılırsa dokunulmaz. Bu yüzden kurulumu tekrar tekrar çalıştırmak
 * güvenlidir.
 */

import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { stdin, stdout } from "node:process";

import { rebaseEpoch } from "../src/lib/radio.ts";
import { extractPlaylistId, resolvePlaylistTracks } from "../src/lib/youtube-metadata.ts";
import { importAudioFolder } from "./lib/audio-import.mjs";
import { applyEnv, cleanPastedValue } from "./lib/env.mjs";
import { getField, readSite, setField, writeSite } from "./lib/site-file.mjs";
import { syncCovers } from "../src/lib/cover.ts";
import { matchTracks, mergeTrack } from "../src/lib/match.ts";
import { resolveStorage } from "../src/lib/storage/index.ts";
import {
  orderDoc,
  readDoc,
  readFileDoc,
  ROOT,
  storeLabel,
  writeDoc,
  writeFileDoc,
} from "./lib/store.mjs";

const ENV_PATH = path.join(ROOT, ".env.local");

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

// --- .env.local ---------------------------------------------------------------

async function readEnvFile() {
  try {
    return await readFile(ENV_PATH, "utf8");
  } catch {
    return "";
  }
}

// --- Sorular -------------------------------------------------------------------

function createAsk() {
  const rl = createInterface({ input: stdin, output: stdout });
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

  return { ask, close: () => rl.close() };
}

/** Mevcut değeri varsayılan gösterir; boş cevap onu korur. */
async function askWithDefault(ask, label, current) {
  const answer = (await ask(`  ${label} ${c.dim(`[${current}]`)}: `)).trim();
  return answer || current;
}

async function askChoice(ask, label, options, fallback = 1) {
  log();
  log(`  ${label}`);
  options.forEach((option, i) => log(`    ${i + 1}) ${option}`));
  const answer = (await ask(`  Seçim [${fallback}]: `)).trim();
  const index = Number(answer || fallback);
  return Number.isInteger(index) && index >= 1 && index <= options.length ? index : fallback;
}

// --- Kaynak akışları -----------------------------------------------------------

/** Canlı YouTube playlist: hiçbir depo gerekmez, liste YouTube'da yönetilir. */
async function setupYouTube(ask, env) {
  log();
  log(c.dim("  Yayın doğrudan bu playlist'ten okunacak. Şarkı eklemek veya"));
  log(c.dim("  çıkarmak için YouTube'daki listeyi düzenlemeniz yeterli."));
  log(c.dim("  Liste herkese açık ya da 'bağlantıya sahip olanlar' olmalı."));
  log();

  for (;;) {
    const link = (await ask("  Playlist adresi: ")).trim();
    if (!link) return null;

    if (!extractPlaylistId(link)) {
      logError("  ✗ Bu bir YouTube playlist adresi değil.");
      continue;
    }

    log(c.dim("  Liste okunuyor…"));
    try {
      const tracks = await resolvePlaylistTracks(link);
      log(c.green(`  ✓ ${tracks.length} parça bulundu.`));
      env.RADIO_SOURCE = "youtube";
      env.YOUTUBE_PLAYLIST_URL = link;
      return { tracks, replace: true };
    } catch (err) {
      logError(`  ✗ Liste okunamadı (${err.message}).`);
      const retry = (await ask("  Başka bir adres denensin mi? [E/h] ")).trim().toLowerCase();
      if (retry === "h" || retry === "n") return null;
    }
  }
}

function looksLikeUrl(value) {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Doğru türde bir değer alana kadar sorar.
 *
 * `validate` bir hata metni ya da null döndürür; hata varsa soru tekrarlanır.
 * Boş cevap "vazgeçtim" demektir.
 */
async function askUntilValid(ask, label, validate) {
  for (;;) {
    const value = cleanPastedValue(await ask(`  ${label}: `));
    if (!value) return "";

    const problem = validate(value);
    if (!problem) return value;
    logError(`  ✗ ${problem}`);
  }
}

/** Upstash Redis: panelden yönetilir, şarkı eklemek için deploy gerekmez. */
async function setupRedis(ask, env) {
  log();
  log(c.dim("  Upstash panelinde bir Redis veritabanı açın ve REST bilgilerini"));
  log(c.dim("  buraya yapıştırın: https://console.upstash.com"));
  log(c.dim("  Panelin `ANAHTAR=\"değer\"` satırlarını olduğu gibi yapıştırabilirsiniz."));
  log();

  for (;;) {
    const url = await askUntilValid(ask, "UPSTASH_REDIS_REST_URL", (value) =>
      looksLikeUrl(value) ? null : "Bu bir adres değil; https:// ile başlamalı.",
    );
    const token = await askUntilValid(ask, "UPSTASH_REDIS_REST_TOKEN", (value) =>
      looksLikeUrl(value)
        ? "Bu bir adres, token değil. Panelde REST_TOKEN satırını kopyalayın."
        : null,
    );

    if (!url || !token) {
      log(c.yellow("  Atlandı; bu değerleri sonra .env.local dosyasına ekleyebilirsiniz."));
      return null;
    }

    log(c.dim("  Bağlantı deneniyor…"));
    try {
      const { Redis } = await import("@upstash/redis");
      await new Redis({ url, token }).ping();
      log(c.green("  ✓ Bağlantı kuruldu."));
    } catch (err) {
      logError(`  ✗ Bağlanılamadı (${String(err.message).split(",")[0]}).`);
      // Çalışmayan bilgileri sessizce kaydetmek, hatayı ilk `npm run radio:add`
      // çağrısına erteliyordu; orada sebebi bulmak çok daha zor.
      const next = await askChoice(ask, "Ne yapalım?", [
        "Bilgileri tekrar gireyim",
        "Yine de kaydet (sonra düzeltirim)",
      ]);
      if (next === 1) continue;
      log(c.yellow("  Kaydedildi ama bağlantı doğrulanmadı."));
    }

    // `.env.local` kurulumun sonunda yazılıyor, ama listeyi bu çalıştırmada
    // Redis'e yazacaksak store.mjs'in bilgileri şimdi görmesi gerekiyor.
    const values = {
      RADIO_SOURCE: "redis",
      UPSTASH_REDIS_REST_URL: url,
      UPSTASH_REDIS_REST_TOKEN: token,
    };
    Object.assign(env, values);
    Object.assign(process.env, values);
    return null;
  }
}

/** Yerel ses dosyaları: repoya kopyalanır, sunucudan servis edilir. */
/**
 * Ses dosyaları nerede saklanacak?
 *
 * Soru içe aktarmadan *önce* sorulmak zorunda: `importAudioFolder` dosyaları
 * seçilen depoya yazıyor. Değerler `.env.local`'a ancak kurulumun sonunda
 * yazıldığı için `process.env`'e de hemen işleniyor — yoksa ayar bu
 * çalıştırmada geçerli olmaz, kullanıcı da sebebini anlamazdı.
 */
async function setupStorage(ask, env) {
  const apply = (values) => {
    Object.assign(env, values);
    Object.assign(process.env, values);
  };

  log();
  const choice = await askChoice(ask, "Ses dosyaları nerede saklansın?", [
    "Repo içinde (public/audio) — ek kurulum yok, dosyalar git'e girer",
    "Cloudflare R2 — repo temiz kalır, dinleyici trafiği ücretsiz",
  ]);

  if (choice === 1) {
    apply({ AUDIO_STORAGE: "local" });
    return;
  }

  log();
  log(c.dim("  Cloudflare panelinden: R2 > bucket > Settings bölümünde Account ID,"));
  log(c.dim("  R2 > Manage API tokens ile Object Read & Write yetkili bir anahtar."));
  log(c.dim("  Public adres, bucket'a bağladığınız custom domain olmalı —"));
  log(c.dim("  r2.dev adresi üretim için uygun değil."));
  log();

  /**
   * Mevcut değeri varsayılan olarak sunar; boş cevap onu korur.
   *
   * Kurulumun tekrar çalıştırılabilir olması buna bağlı: beş anahtarı her
   * seferinde yeniden yapıştırmak gerekseydi "tekrar çalıştırmak güvenlidir"
   * pratikte doğru olmazdı. Gizli değer maskeleniyor — terminal geçmişinde
   * ve omuz üstünde durmasın.
   */
  const askKept = async (label, name, { secret = false } = {}) => {
    const current = (process.env[name] ?? "").trim();
    const shown = secret ? `${current.slice(0, 4)}…${current.slice(-4)}` : current;
    const suffix = current ? ` ${c.dim(`[${shown}]`)}` : "";
    return cleanPastedValue(await ask(`  ${label}${suffix}: `)) || current;
  };

  const values = {
    AUDIO_STORAGE: "r2",
    R2_ACCOUNT_ID: await askKept("Account ID", "R2_ACCOUNT_ID"),
    R2_BUCKET: await askKept("Bucket adı", "R2_BUCKET"),
    R2_ACCESS_KEY_ID: await askKept("Access Key ID", "R2_ACCESS_KEY_ID"),
    R2_SECRET_ACCESS_KEY: await askKept("Secret Access Key", "R2_SECRET_ACCESS_KEY", {
      secret: true,
    }),
    R2_PUBLIC_URL: await askKept("Public adres (ör. https://cdn.siteniz.com)", "R2_PUBLIC_URL"),
  };

  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    logError(`  ✗ Eksik: ${missing.join(", ")}`);
    log(c.dim("  Yerel depoyla devam ediliyor; sonra .env.local'dan tamamlayabilirsiniz."));
    apply({ AUDIO_STORAGE: "local" });
    return;
  }

  apply(values);
  log();
  log(c.yellow("  ! Bucket public olduğu için hotlink koruması WAF tarafında yapılır."));
  log(c.dim("    README > 'Hotlink koruması' başlığındaki tek kuralı eklemeyi unutmayın."));
}

/**
 * Listenin nerede tutulacağı.
 *
 * Ses dosyalarının nerede durduğundan bağımsız bir soru: R2'den ses servis
 * ederken listeyi Redis'te tutmak en yaygın kurulum — dosyalar repoyu
 * şişirmez, liste de deploy almadan panelden yönetilir.
 */
async function askListLocation(ask, env) {
  log();
  const choice = await askChoice(ask, "Parça listesi nerede tutulsun?", [
    "Upstash Redis — panelden yönetirim, şarkı eklemek için deploy gerekmesin",
    "data/playlist.json — liste repoda dursun",
  ]);

  if (choice === 2) {
    env.RADIO_SOURCE = "file";
    process.env.RADIO_SOURCE = "file";
    return;
  }

  await setupRedis(ask, env);
}

/**
 * Yerel dosyaların meta bilgisini bir YouTube listesinden zenginleştirir.
 *
 * Dosya adları başlık ve sanatçıyı güvenilir taşımıyor, kapak ise hiç yok.
 * Aynı şarkıların YouTube kayıtları varsa ses yerelden çalmaya devam ederken
 * kimlik oradan alınabiliyor.
 *
 * YouTube parçaları listeye *eklenmiyor* — yalnızca meta kaynağı olarak
 * kullanılıyorlar. Eklenselerdi her şarkı listede iki kez çalardı.
 */
async function enrichFromYouTube(ask, tracks) {
  log();
  log(c.dim("  İsterseniz bu şarkıların YouTube playlist adresini verin: başlık,"));
  log(c.dim("  sanatçı ve kapaklar oradan eşleştirilir. Ses yine kendi"));
  log(c.dim("  dosyalarınızdan çalar, liste uzamaz."));
  log();

  const link = (await ask("  Playlist adresi (boş: atla): ")).trim();
  if (!link) return tracks;

  if (!extractPlaylistId(link)) {
    logError("  ✗ Geçerli bir YouTube playlist adresi değil; atlanıyor.");
    return tracks;
  }

  let remote;
  try {
    log(c.dim("  Liste okunuyor…"));
    remote = await resolvePlaylistTracks(link);
  } catch (err) {
    logError(`  ✗ Okunamadı (${err.message}); meta dosya adlarından kalacak.`);
    return tracks;
  }

  const result = matchTracks(tracks, remote);
  const merged = new Map(
    result.confident.map((m) => [m.local, mergeTrack(m.local, m.remote)]),
  );

  log(c.green(`  ✓ ${result.confident.length} parça eşleşti (kapak ve başlık geldi)`));
  if (result.uncertain.length + result.unmatchedLocal.length > 0) {
    const rest = result.uncertain.length + result.unmatchedLocal.length;
    log(c.dim(`  − ${rest} parça eşleşmedi; adı dosyadan kalır, panelden düzeltilebilir.`));
  }

  const enriched = tracks.map((track) => merged.get(track) ?? track);

  // Eşleşen kapaklar YouTube'un adresini *göstermekle* kalmasın: `radio:match`
  // gibi burada da indirilip depoya alınıyor. Aksi hâlde sesi kendi deponda
  // olan bir yayın kapaklar için YouTube'a bağımlı kalırdı.
  if (merged.size > 0) {
    log(c.dim("  Kapaklar depoya taşınıyor…"));
    const synced = await syncCovers({
      tracks: enriched,
      storage: resolveStorage(),
      onProgress: (done, total) => {
        if (stdout.isTTY) stdout.write(`\r  ${c.dim(`kapak ${done}/${total}`)}   `);
      },
    });
    if (stdout.isTTY) stdout.write("\r".padEnd(40) + "\r");
    log(c.green(`  ✓ ${synced.ingested} kapak depoya alındı`));
    if (synced.failed.length > 0) {
      log(c.dim(`  − ${synced.failed.length} kapak indirilemedi; yedek görselle görünür.`));
    }
    return synced.tracks;
  }

  return enriched;
}

async function setupLocalFiles(ask, env, doc) {
  await setupStorage(ask, env);
  await askListLocation(ask, env);

  log();
  log(c.dim("  Ses dosyalarınızın klasörünü verin."));
  log(c.yellow("  Telifli müziği kendi sunucunuzdan yayınlamanın sorumluluğu size ait."));
  log();

  const folder = (await ask("  Klasör: ")).trim();
  if (!folder) return null;

  // Kimlik dosya adından türediği için aynı klasör ikinci kez tarandığında
  // parçalar "zaten listede" diye atlanıyor. Bu, listeyi büyütürken doğru
  // davranış; ama depoyu boşaltıp sıfırdan kuranı sessizce eli boş bırakıyordu
  // — hiçbir dosya yüklenmiyor, yayın kırık kalıyordu. O yüzden liste doluysa
  // niyeti soruyoruz. `radio:add` playlist içe aktarırken de aynısını yapıyor.
  let replace = false;
  if (doc.tracks.length > 0) {
    log();
    log(c.dim(`  Listede zaten ${doc.tracks.length} parça var.`));
    replace =
      (await askChoice(ask, "Ne yapalım?", [
        "Bu klasördekileri listeye ekle",
        "Listeyi bu klasörle değiştir (sıfırdan kur)",
      ])) === 2;
  }

  const existing = replace ? new Set() : new Set(doc.tracks.map((t) => t.videoId));
  try {
    const result = await importAudioFolder(folder, existing, (done, total) => {
      if (stdout.isTTY) stdout.write(`\r  ${c.dim(`okunuyor ${done}/${total}`)}   `);
    });
    if (stdout.isTTY) stdout.write("\r".padEnd(40) + "\r");

    const size = (result.bytes / 1024 / 1024).toFixed(1);
    const where = result.storage === "r2" ? "R2" : "public/audio";
    log(c.green(`  ✓ ${result.tracks.length} parça hazır · ${size} MB · ${where}`));
    for (const item of result.skipped) log(c.yellow(`  − ${item.name} (${item.reason})`));

    const tracks = await enrichFromYouTube(ask, result.tracks);
    return { tracks, replace };
  } catch (err) {
    if (stdout.isTTY) stdout.write("\r".padEnd(40) + "\r");
    logError(`  ✗ ${err.message}`);
    return null;
  }
}

/** data/playlist.json: liste repoda durur, panelden düzenlenir. */
async function setupFile(ask, env) {
  log();
  log(c.dim("  Liste data/playlist.json içinde tutulacak. Şarkıları `npm run radio:add`"));
  log(c.dim("  ile veya /admin panelinden ekleyebilirsiniz."));

  env.RADIO_SOURCE = "file";

  const link = (await ask("  Başlangıç için bir YouTube playlist adresi (boş: atla): ")).trim();
  if (!link) return null;

  log(c.dim("  Liste okunuyor…"));
  try {
    const tracks = await resolvePlaylistTracks(link);
    log(c.green(`  ✓ ${tracks.length} parça bulundu.`));
    return { tracks, replace: true };
  } catch (err) {
    logError(`  ✗ Liste okunamadı (${err.message}); listeyi sonra doldurabilirsiniz.`);
    return null;
  }
}

// --- Akış ----------------------------------------------------------------------

async function main() {
  const { ask, close } = createAsk();

  try {
    log();
    log(c.bold("  Orbitcast · kurulum"));
    log(c.dim("  Boş bırakılan her soruda köşeli parantezdeki değer korunur."));

    // Yapılandırılmış depodan okunuyor: kurulum ikinci kez çalıştırıldığında
    // Redis'teki güncel listeyi değil, repodaki bayat dosyayı temel almak
    // panelde yapılan tüm düzenlemeleri geri alırdı. Depoya ulaşılamazsa
    // dosyaya düşülüyor — ilk kurulumda zaten Redis yapılandırılmamış olur.
    const doc = await readDoc().catch(() => readFileDoc());
    const envText = await readEnvFile();
    const env = {};

    // --- İstasyon kimliği
    log();
    log(c.bold("  1 · İstasyon"));
    doc.name = await askWithDefault(ask, "Ad", doc.name);
    doc.tagline = await askWithDefault(ask, "Slogan", doc.tagline);
    log(c.dim("  Paylaşım metni, X kartının alt satırı. Tek satırda kalması için"));
    log(c.dim("  ~45 karakteri geçmeyin; sonuna nokta koymayın."));
    doc.shareTagline = await askWithDefault(ask, "Paylaşım metni", doc.shareTagline);

    // --- Kaynak
    log();
    log(c.bold("  2 · Yayın kaynağı"));
    const choice = await askChoice(ask, "Parça listesi nereden okunsun?", [
      "YouTube playlist — listeyi YouTube'da yönetirim, panel istemiyorum",
      "Upstash Redis — panelden yönetirim, şarkı eklemek için deploy gerekmesin",
      "data/playlist.json — liste repoda dursun",
      "Yerel ses dosyaları — kendi mp3'lerimi yayınlayacağım",
    ]);

    const imported =
      choice === 1
        ? await setupYouTube(ask, env)
        : choice === 2
          ? await setupRedis(ask, env)
          : choice === 3
            ? await setupFile(ask, env)
            : await setupLocalFiles(ask, env, doc);

    // Liste değişmeden önceki hâli: 4. bölümde yayın konumunu koruyabilmek için
    // eski sıralama ve süreler gerekiyor.
    const previousTracks = doc.tracks;
    if (imported) {
      doc.tracks = imported.replace ? imported.tracks : [...doc.tracks, ...imported.tracks];
    }

    // --- Yönetim ve anahtarlar
    log();
    log(c.bold("  3 · Erişim"));

    if (choice === 1) {
      log(c.dim("  Bu modda panel salt okunur; parola yalnızca listeyi görmek için."));
    }
    const generated = randomBytes(18).toString("base64url");
    const password = await askWithDefault(ask, "Admin parolası", generated);
    env.ADMIN_PASSWORD = password;

    log();
    log(c.dim("  YouTube API anahtarı zorunlu değil ama üretimde önerilir:"));
    log(c.dim("  anahtarsız yöntem 100'den uzun listeleri getiremez ve sunucu"));
    log(c.dim("  IP'lerinde bot kontrolüne takılabilir."));
    const apiKey = (await ask("  YOUTUBE_API_KEY (boş: atla): ")).trim();
    if (apiKey) env.YOUTUBE_API_KEY = apiKey;

    // --- Kaldırma talebi adresi
    //
    // Ortam değişkeni değil, `src/lib/site.ts` içinde: künye yapılı veri
    // tutuyor ve orada duruyor. Burada sorulmasının sebebi şablonda bilerek
    // boş olması — doldurulmazsa hak sahipleri "Hakkında" penceresinde
    // yazacak bir adres bulamıyor.
    log();
    log(c.dim("  Telif sahipleri bir parçanın kaldırılmasını istediğinde bu adrese"));
    log(c.dim("  yazacak; \"Hakkında\" penceresinde görünür. Boş bırakırsanız o"));
    log(c.dim("  bölümde adres hiç gösterilmez."));

    try {
      const siteText = await readSite();
      const current = getField(siteText, "contactEmail");
      const answer = (
        await ask(`  Kaldırma talebi e-postası${current ? ` ${c.dim(`[${current}]`)}` : ""}: `)
      ).trim();

      const email = answer || current;
      if (email && email !== current) {
        await writeSite(siteText, setField(siteText, "contactEmail", email));
        log(c.dim("  · src/lib/site.ts güncellendi"));
      }
    } catch (err) {
      logError(`  ✗ Künye güncellenemedi (${err.message}); site.ts'i elle düzenleyin.`);
    }

    // --- Yayın başlangıcı
    log();
    log(c.bold("  4 · Yayın başlangıcı"));
    log(c.dim("  epoch, akışın kavramsal sıfır noktası. Değiştirirseniz herkesin"));
    log(c.dim("  duyduğu şarkı kayar; bir kez ayarlayıp bir daha dokunmayın."));
    // Liste değiştiyse epoch'a dokunmamak yayını *kaydırır*: konum
    // `(now - epoch) mod toplamSüre` ile bulunduğu için toplam süre değişince
    // modulo başka yere düşer. Konumu korumanın yolu epoch'u oynatmak.
    const changed = previousTracks.length > 0 && doc.tracks !== previousTracks;
    const rebased = changed
      ? rebaseEpoch(
          {
            epochMs: Date.parse(doc.epoch),
            tracks: previousTracks,
            totalDurationSec: previousTracks.reduce((sum, t) => sum + t.durationSec, 0),
          },
          doc.tracks,
          Date.now(),
        )
      : null;

    const options = ["Olduğu gibi bırak", "Şu ana ayarla (yayın ilk parçadan başlar)"];
    if (rebased !== null) {
      log(c.dim("  Liste değişti: epoch'a dokunmamak dinleyicileri başka bir parçaya"));
      log(c.dim("  atlatır. Üçüncü seçenek onları aynı yerde tutar."));
      options.push("Yayın konumunu koru (epoch yeniden hesaplanır)");
    }

    const resetEpoch = await askChoice(ask, `Şu anki değer: ${doc.epoch}`, options);
    if (resetEpoch === 2) doc.epoch = new Date().toISOString();
    if (resetEpoch === 3 && rebased !== null) doc.epoch = new Date(rebased).toISOString();

    // --- Yaz
    // Seçilen depoya yazılıyor. Redis seçildiyse `writeDoc` listeyi oraya
    // koyar ve data/playlist.json'ı yedek olarak günceller; böylece kurulum
    // biter bitmez panelden yönetilebilir hâle geliyor.
    //
    // Redis'e ulaşılamazsa dosyaya düşülüyor: bu noktada ses dosyaları çoktan
    // yüklenmiş oluyor ve listeyi kaybetmek bütün kurulumu boşa çıkarırdı.
    try {
      await writeDoc(doc);
    } catch (err) {
      logError(`  ✗ Depoya yazılamadı (${err.message}).`);
      log(c.yellow("  Liste data/playlist.json'a kaydedildi; bağlantıyı düzeltip"));
      log(c.yellow("  `npm run radio:setup` komutunu tekrar çalıştırabilirsiniz."));
      await writeFileDoc(orderDoc(doc));
    }

    await writeFile(ENV_PATH, applyEnv(envText, env), "utf8");

    log();
    log(c.green("  Kurulum tamam."));
    log(c.dim(`  · .env.local güncellendi (${Object.keys(env).length} değişken)`));
    log(c.dim(`  · ${storeLabel()} · ${doc.tracks.length} parça`));
    log();
    log("  Şimdi:");
    log(c.cyan("    npm run dev"));
    log(c.dim("    http://localhost:3000  ·  yönetim: /admin"));
    log();
    if (choice === 1) {
      log(c.dim("  Şarkı eklemek için YouTube'daki playlist'i düzenlemeniz yeterli."));
    } else {
      log(c.dim("  Şarkı eklemek için: npm run radio:add"));
    }
    log();
  } finally {
    close();
  }
}

if (!stdin.isTTY) {
  log(c.bold("Orbitcast · kurulum"));
  log();
  log("  Kurulum sihirbazı bir terminal gerektirir:");
  log(c.cyan("    npm run radio:setup"));
  process.exitCode = 1;
} else {
  await main();
}
