#!/usr/bin/env node
/**
 * Orbitcast — yerel ses dosyalarını YouTube kayıtlarıyla birleştirir.
 *
 *   npm run radio:match
 *
 * Kendi mp3'lerinizi içe aktardıktan sonra iki eksik kalıyor: başlıklar dosya
 * adından türüyor (çoğu zaman sanatçı çıkmıyor) ve kapak hiç yok. Aynı
 * şarkıların YouTube kayıtları listede duruyorsa bu komut ikisini birleştirir:
 *
 *   ses      → R2'den çalmaya devam eder (src ve süre korunur)
 *   kimlik   → YouTube'dan gelir (başlık, sanatçı, kapak)
 *
 * Eşleşen YouTube kaydı listeden düşürülür; aksi hâlde her şarkı listede iki
 * kez çalardı.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { syncCovers } from "../src/lib/cover.ts";
import { matchTracks, mergeTrack } from "../src/lib/match.ts";
import { resolveStorage } from "../src/lib/storage/index.ts";
import { rebaseEpoch } from "../src/lib/radio.ts";
import { readDoc, storeLabel, writeDoc } from "./lib/store.mjs";

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

const trim = (value, width) =>
  value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);

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

/** Bir eşleşmeyi tek satırda özetler. */
function describe(match) {
  const delta = Math.abs(match.local.durationSec - match.remote.durationSec);
  return (
    `  ${c.dim(match.score.toFixed(2))}  ${trim(match.local.title, 34)}` +
    `  ${c.dim("⇄")}  ${trim(`${match.remote.artist} · ${match.remote.title}`, 40)}` +
    `  ${c.dim(`Δ${delta}s`)}`
  );
}

async function main() {
  const { ask, close } = createAsk();

  try {
    log();
    log(c.bold("  Orbitcast · eşleştirme"));

    const doc = await readDoc();
    const local = doc.tracks.filter((t) => t.kind === "audio");
    const remote = doc.tracks.filter((t) => (t.kind ?? "youtube") === "youtube");

    log(c.dim(`  Depo: ${storeLabel()} · ${doc.tracks.length} parça`));
    log(c.dim(`  ${local.length} ses dosyası · ${remote.length} YouTube kaydı`));

    if (local.length === 0) {
      logError("\n  Listede yerel ses dosyası yok; eşleştirilecek bir şey bulunamadı.");
      return;
    }
    if (remote.length === 0) {
      logError("\n  Listede YouTube kaydı yok; meta çekilecek bir kaynak bulunamadı.");
      return;
    }

    const result = matchTracks(local, remote);

    log();
    log(c.bold("  1 · Sonuç"));
    log(`  ${c.green(`✓ ${result.confident.length}`)} kesin eşleşme`);
    log(`  ${c.yellow(`? ${result.uncertain.length}`)} onay bekliyor`);
    log(`  ${c.dim(`− ${result.unmatchedLocal.length}`)} ses dosyası eşleşmedi (dosya adı metası kalır)`);
    log(`  ${c.dim(`− ${result.unmatchedRemote.length}`)} YouTube kaydının karşılığı yok (listede kalır)`);

    if (result.confident.length > 0) {
      log();
      log(c.dim("  kesin eşleşmelerden birkaçı:"));
      for (const match of result.confident.slice(0, 5)) log(describe(match));
      if (result.confident.length > 5) {
        log(c.dim(`  … ${result.confident.length - 5} tane daha`));
      }
    }

    const accepted = [...result.confident];

    if (result.uncertain.length > 0) {
      log();
      log(c.bold("  2 · Onay"));
      log(c.dim("  Skor eşiğin altında kaldı; tek tek soruyorum."));
      log();
      for (const match of result.uncertain) {
        log(describe(match));
        const answer = (await ask("     birleştirilsin mi? [E/h] ")).trim().toLowerCase();
        if (answer !== "h" && answer !== "n") accepted.push(match);
      }
    }

    if (accepted.length === 0) {
      log();
      log(c.yellow("  Uygulanacak eşleşme yok; hiçbir şey değişmedi."));
      return;
    }

    // Birleşme iki yönlü: yerel parça zenginleşir, YouTube kaydı listeden çıkar.
    const merged = new Map();
    const dropped = new Set();
    for (const match of accepted) {
      merged.set(match.local.videoId, mergeTrack(match.local, match.remote));
      dropped.add(match.remote.videoId);
    }

    // Karşılığı olmayan YouTube parçaları listede kalırsa yayın arada bir
    // iframe'e düşer. Ses dosyası olmadığı için onları tutmanın tek anlamı
    // o parçayı hiç kaybetmemek; tercih kullanıcının.
    let dropRest = false;
    if (result.unmatchedRemote.length > 0) {
      log();
      log(c.dim(`  ${result.unmatchedRemote.length} YouTube parçasının ses dosyası yok:`));
      for (const track of result.unmatchedRemote.slice(0, 5)) {
        log(c.dim(`  · ${track.artist} · ${track.title}`));
      }
      log(c.dim("  Listede kalırlarsa sıraları geldiğinde YouTube oynatıcısı açılır."));
      const answer = (await ask("  Bunlar da listeden çıkarılsın mı? [E/h] ")).trim().toLowerCase();
      dropRest = answer !== "h" && answer !== "n";
      if (dropRest) for (const track of result.unmatchedRemote) dropped.add(track.videoId);
    }

    const previousTracks = doc.tracks;
    const tracks = doc.tracks
      .filter((t) => !((t.kind ?? "youtube") === "youtube" && dropped.has(t.videoId)))
      .map((t) => (t.kind === "audio" && merged.has(t.videoId) ? merged.get(t.videoId) : t));

    const withCover = accepted.filter((m) => m.remote.thumbnail).length;

    log();
    log(c.bold("  3 · Uygulanacak"));
    log(`  ${accepted.length} parça birleştirilecek · ${withCover} tanesine kapak gelecek`);
    log(`  liste ${previousTracks.length} → ${c.bold(tracks.length)} parça`);

    const answer = (await ask("\n  Uygulansın mı? [E/h] ")).trim().toLowerCase();
    if (answer === "h" || answer === "n") {
      log(c.dim("  Vazgeçildi."));
      return;
    }

    // Kapaklar YouTube'un adresini *göstermekle* kalmasın: indirilip depoya
    // konuyor. Aksi hâlde sesi kendi deponda olan bir yayın kapaklar için
    // YouTube'a bağımlı kalır ve video silinince görsel kaybolur.
    let finalTracks = tracks;
    if (withCover > 0) {
      const storage = resolveStorage();
      log(c.dim("  Kapaklar depoya taşınıyor…"));

      const synced = await syncCovers({
        tracks,
        storage,
        onProgress: (done, total) => {
          if (stdout.isTTY) stdout.write(`\r  ${c.dim(`kapak ${done}/${total}`)}   `);
        },
      });
      if (stdout.isTTY) stdout.write("\r".padEnd(40) + "\r");

      finalTracks = synced.tracks;
      log(c.green(`  ✓ ${synced.ingested} kapak depoya alındı`));
      if (synced.failed.length > 0) {
        log(c.dim(`  − ${synced.failed.length} kapak indirilemedi; parçalar yedek görselle görünür.`));
      }
    }

    doc.tracks = finalTracks;

    // Liste ciddi biçimde kısaldı: epoch'a dokunmamak yayını kaydırır.
    const rebased = rebaseEpoch(
      {
        epochMs: Date.parse(doc.epoch),
        tracks: previousTracks,
        totalDurationSec: previousTracks.reduce((sum, t) => sum + t.durationSec, 0),
      },
      finalTracks,
      Date.now(),
    );

    if (rebased !== null) {
      const keep = (await ask("  Yayın kesintisiz devam etsin mi? [E/h] ")).trim().toLowerCase();
      if (keep === "h" || keep === "n") {
        log(c.yellow("  epoch korundu; yayın konumu kaydı."));
      } else {
        doc.epoch = new Date(rebased).toISOString();
        log(c.dim("  Yayın konumu korundu; epoch yeniden hesaplandı."));
      }
    }

    await writeDoc(doc);

    log();
    log(c.green(`  Tamam · ${finalTracks.length} parça · ${storeLabel()}`));
    if (result.unmatchedLocal.length > 0) {
      log();
      log(c.dim("  Eşleşmeyen ses dosyaları (başlığı panelden düzeltebilirsiniz):"));
      for (const track of result.unmatchedLocal) log(c.dim(`  − ${track.title}`));
    }
    log();
  } finally {
    close();
  }
}

if (!stdin.isTTY) {
  log(c.bold("Orbitcast · eşleştirme"));
  log();
  log("  Bu komut bir terminal gerektirir:");
  log(c.cyan("    npm run radio:match"));
  process.exitCode = 1;
} else {
  await main();
}
