#!/usr/bin/env node
/**
 * Orbitcast — projeyi şablon hâline döndürür.
 *
 *   npm run radio:reset
 *
 * Klonlayıp denedikten sonra sıfırdan başlamak isteyen için. Repo *içindeki*
 * kullanıcı verisini temizler: ortam değişkenleri, parça listesi, istasyon
 * kimliği, yüklenmiş ses dosyaları ve künye bilgileri.
 *
 * Kaynak kodu ve testler hiç dokunulmaz — sıfırlanan şey uygulamanın kendisi
 * değil, senin ona verdiğin veri.
 *
 * Repo dışındaki depolar (Upstash Redis, Cloudflare R2) bilinçli olarak
 * ayrı tutuluyor: onlar bu klasörün mülkü değil ve yanlışlıkla silmek geri
 * alınamaz. Redis anahtarı isteğe bağlı olarak sunuluyor, R2 yalnızca
 * hatırlatılıyor.
 */

import { readdir, rm, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import path from "node:path";
import { stdin, stdout } from "node:process";

import { blankSite, readSite, writeSite } from "./lib/site-file.mjs";
import { ROOT } from "./lib/store.mjs";

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

const ENV_PATH = path.join(ROOT, ".env.local");
const PLAYLIST_PATH = path.join(ROOT, "data", "playlist.json");
const AUDIO_DIR = path.join(ROOT, "public", "audio");

/** Boş bir istasyon. `radio:setup` bunun üstüne kuruyor. */
const BLANK_PLAYLIST = {
  name: "OrbitCast",
  tagline: "",
  shareTagline: "Everyone hears the same thing right now",
  // Sabit bir tarih: kurulum "şu ana ayarla" seçeneğini zaten sunuyor ve
  // sıfırlamanın her çalıştırmada farklı çıktı vermesi için sebep yok.
  epoch: "2026-01-01T00:00:00.000Z",
  tracks: [],
  updatedAt: "1970-01-01T00:00:00.000Z",
};

/** Bir hedefin şu anki durumunu tek satırda özetler. */
async function inspect() {
  const out = [];

  const envExists = await stat(ENV_PATH).then(() => true, () => false);
  out.push({
    key: "env",
    label: ".env.local",
    detail: envExists ? "silinecek" : "yok",
    present: envExists,
    action: () => rm(ENV_PATH, { force: true }),
  });

  let trackCount = 0;
  let stationName = "";
  try {
    const doc = JSON.parse(await import("node:fs").then((fs) => fs.promises.readFile(PLAYLIST_PATH, "utf8")));
    trackCount = doc.tracks?.length ?? 0;
    stationName = doc.name ?? "";
  } catch {
    // Dosya yoksa da yazacağız.
  }
  const playlistDirty = trackCount > 0 || stationName !== BLANK_PLAYLIST.name;
  out.push({
    key: "playlist",
    label: "data/playlist.json",
    detail: playlistDirty ? `${trackCount} parça · "${stationName}" → boşaltılacak` : "zaten boş",
    present: playlistDirty,
    action: () => writeFile(PLAYLIST_PATH, `${JSON.stringify(BLANK_PLAYLIST, null, 2)}\n`, "utf8"),
  });

  let audioFiles = [];
  try {
    const walk = async (dir) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else audioFiles.push(full);
      }
    };
    await walk(AUDIO_DIR);
  } catch {
    // Klasör hiç oluşmamış olabilir.
  }
  out.push({
    key: "audio",
    label: "public/audio/",
    detail: audioFiles.length > 0 ? `${audioFiles.length} dosya silinecek` : "boş",
    present: audioFiles.length > 0,
    action: () => rm(AUDIO_DIR, { recursive: true, force: true }),
  });

  let siteDirty = false;
  try {
    const text = await readSite();
    siteDirty = !/contactEmail: ""/.test(text);
  } catch {
    // Dosya yoksa dokunmuyoruz.
  }
  out.push({
    key: "site",
    label: "src/lib/site.ts",
    detail: siteDirty ? "künye bilgileri temizlenecek" : "zaten şablon",
    present: siteDirty,
    action: async () => {
      const text = await readSite();
      await writeSite(text, blankSite(text));
    },
  });

  return out;
}

/**
 * Soru sorucu.
 *
 * `readline` kapandıktan sonra sorulan soru `ERR_USE_AFTER_CLOSE` fırlatıp
 * yığın iziyle çöküyor — Ctrl-D ya da boruya bağlı stdin bunu tetikliyor.
 * Kapanmayı yakalayıp boş cevap döndürmek, akışın "vazgeçildi" dalına düşüp
 * temiz çıkmasını sağlıyor. `setup.mjs` de aynısını yapıyor.
 */
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

async function main() {
  const { ask, close } = createAsk();

  try {
    log();
    log(c.bold("  Orbitcast · sıfırlama"));
    log(c.dim("  Repo içindeki kullanıcı verisini şablon hâline döndürür."));
    log(c.dim("  Kaynak koda ve testlere dokunulmaz."));

    const targets = await inspect();

    log();
    log(c.bold("  1 · Durum"));
    for (const t of targets) {
      const mark = t.present ? c.yellow("●") : c.dim("○");
      log(`  ${mark} ${t.label.padEnd(22)} ${c.dim(t.detail)}`);
    }

    const pending = targets.filter((t) => t.present);
    if (pending.length === 0) {
      log();
      log(c.green("  Proje zaten şablon hâlinde; yapılacak bir şey yok."));
      return;
    }

    log();
    log(c.bold("  2 · Onay"));
    log(c.dim("  Bu işlem geri alınamaz. Sürüm kontrolündeki dosyalar için"));
    log(c.dim("  `git restore <dosya>` ile geri dönebilirsin; .env.local ise"));
    log(c.dim("  .gitignore'da olduğu için kalıcı olarak gider."));
    log();
    log(c.yellow(`  ${pending.length} hedef sıfırlanacak.`));

    const typed = (await ask(`  Onaylamak için ${c.bold("SIFIRLA")} yazın: `)).trim();
    if (typed !== "SIFIRLA") {
      log(c.dim("  Vazgeçildi; hiçbir şey değişmedi."));
      return;
    }

    log();
    for (const t of pending) {
      try {
        await t.action();
        log(`  ${c.green("✓")} ${t.label}`);
      } catch (err) {
        logError(`  ✗ ${t.label} (${err.message})`);
      }
    }

    log();
    log(c.bold("  3 · Repo dışında kalanlar"));
    log(c.dim("  Bunlar bu klasörün mülkü değil, dokunulmadı:"));
    log(c.dim("  · Upstash Redis  — `radio:playlist` anahtarı listeyi hâlâ tutuyor."));
    log(c.dim("                     Kurulumda \"Listeyi değiştir\" ile üzerine yazılır."));
    log(c.dim("  · Cloudflare R2  — yüklenmiş ses ve kapaklar duruyor."));
    log(c.dim("                     Silmek istersen Cloudflare panelinden."));

    log();
    log(c.green("  Sıfırlandı."));
    log();
    log("  Şimdi:");
    log(c.cyan("    npm run radio:setup"));
    log();
  } finally {
    close();
  }
}

if (!stdin.isTTY) {
  log(c.bold("Orbitcast · sıfırlama"));
  log();
  log("  Bu komut bir terminal gerektirir:");
  log(c.cyan("    npm run radio:reset"));
  process.exitCode = 1;
} else {
  await main();
}
