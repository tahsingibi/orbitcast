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

import { extractPlaylistId, resolvePlaylistTracks } from "../src/lib/youtube-metadata.ts";
import { importAudioFolder } from "./lib/audio-import.mjs";
import { applyEnv, cleanPastedValue } from "./lib/env.mjs";
import { orderDoc, readFileDoc, ROOT, writeFileDoc } from "./lib/store.mjs";

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

    env.RADIO_SOURCE = "redis";
    env.UPSTASH_REDIS_REST_URL = url;
    env.UPSTASH_REDIS_REST_TOKEN = token;
    return null;
  }
}

/** Yerel ses dosyaları: repoya kopyalanır, sunucudan servis edilir. */
async function setupLocalFiles(ask, env, doc) {
  log();
  log(c.dim("  Ses dosyalarınızın klasörünü verin. Dosyalar public/audio altına"));
  log(c.dim("  kopyalanacak ve repoyla birlikte deploy edilecek."));
  log(c.yellow("  Telifli müziği kendi sunucunuzdan yayınlamanın sorumluluğu size ait."));
  log();

  const folder = (await ask("  Klasör: ")).trim();
  if (!folder) return null;

  const existing = new Set(doc.tracks.map((t) => t.videoId));
  try {
    const result = await importAudioFolder(folder, existing, (done, total) => {
      if (stdout.isTTY) stdout.write(`\r  ${c.dim(`okunuyor ${done}/${total}`)}   `);
    });
    if (stdout.isTTY) stdout.write("\r".padEnd(40) + "\r");

    log(c.green(`  ✓ ${result.tracks.length} parça hazır · ${(result.bytes / 1024 / 1024).toFixed(1)} MB`));
    for (const item of result.skipped) log(c.yellow(`  − ${item.name} (${item.reason})`));

    env.RADIO_SOURCE = "file";
    return { tracks: result.tracks, replace: false };
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

    const doc = await readFileDoc();
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

    // --- Yayın başlangıcı
    log();
    log(c.bold("  4 · Yayın başlangıcı"));
    log(c.dim("  epoch, akışın kavramsal sıfır noktası. Değiştirirseniz herkesin"));
    log(c.dim("  duyduğu şarkı kayar; bir kez ayarlayıp bir daha dokunmayın."));
    const resetEpoch = await askChoice(
      ask,
      `Şu anki değer: ${doc.epoch}`,
      ["Olduğu gibi bırak", "Şu ana ayarla (yayın ilk parçadan başlar)"],
    );
    if (resetEpoch === 2) doc.epoch = new Date().toISOString();

    // --- Yaz
    await writeFileDoc(orderDoc(doc));
    await writeFile(ENV_PATH, applyEnv(envText, env), "utf8");

    log();
    log(c.green("  Kurulum tamam."));
    log(c.dim(`  · .env.local güncellendi (${Object.keys(env).length} değişken)`));
    log(c.dim(`  · data/playlist.json · ${doc.tracks.length} parça`));
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
