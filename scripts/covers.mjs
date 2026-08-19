#!/usr/bin/env node
/**
 * Orbitcast — kapakları kendi depona taşır.
 *
 *   npm run radio:covers
 *
 * Kendi dosyalarından yayın yaparken ses senin deponda olur ama kapaklar
 * kolayca dışarıda kalır: `radio:match` ile eşleşen parçalar YouTube'un
 * görselini *gösterir*, kopyalamaz. Bu komut o bağı koparır — kapakları indirip
 * depoya koyar ve listedeki adresleri günceller.
 *
 * Kapağı hiç olmayan parçalar için bir YouTube playlist adresi verebilirsin:
 * parçalar süre ve başlığa göre eşleştirilip kapakları oradan çekilir.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { coverState, syncCovers } from "../src/lib/cover.ts";
import { matchTracks } from "../src/lib/match.ts";
import { resolveStorage } from "../src/lib/storage/index.ts";
import { extractPlaylistId, resolvePlaylistTracks } from "../src/lib/youtube-metadata.ts";
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

async function main() {
  const rl = createInterface({ input: stdin, output: stdout });
  // Kapanmış readline'a soru sormak ERR_USE_AFTER_CLOSE ile çöküyor;
  // Ctrl-D basıldığında akış "vazgeçildi" dalına düşmeli.
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
    log();
    log(c.bold("  Orbitcast · kapak onarımı"));

    const doc = await readDoc();
    const storage = resolveStorage();
    const audio = doc.tracks.filter((t) => t.kind === "audio");

    if (audio.length === 0) {
      logError("\n  Listede yerel ses dosyası yok; kapak taşınacak parça bulunamadı.");
      return;
    }

    const counts = { stored: 0, external: 0, missing: 0 };
    for (const track of audio) counts[coverState(track, storage)] += 1;

    log(c.dim(`  Depo: ${storeLabel()} · ses deposu: ${storage.kind}`));
    log();
    log(c.bold("  1 · Durum"));
    log(`  ${c.green(`✓ ${counts.stored}`)} kapak zaten depoda`);
    log(`  ${c.yellow(`↗ ${counts.external}`)} kapak dışarıda barınıyor (indirilecek)`);
    log(`  ${c.dim(`− ${counts.missing}`)} parçanın kapağı yok`);

    if (counts.external === 0 && counts.missing === 0) {
      log();
      log(c.green("  Tüm kapaklar zaten kendi deponda; yapılacak bir şey yok."));
      return;
    }

    // Kapağı hiç olmayanlar için dışarıdan bir kaynak gerekiyor.
    let fallback;
    if (counts.missing > 0) {
      log();
      log(c.bold("  2 · Kapağı olmayanlar"));
      log(c.dim(`  ${counts.missing} parçanın hiç kapağı yok. Bu şarkıların YouTube`));
      log(c.dim("  playlist adresini verirsen kapakları oradan eşleştirilir."));
      log();

      const link = (await ask("  Playlist adresi (boş: atla): ")).trim();
      if (link && !extractPlaylistId(link)) {
        logError("  ✗ Geçerli bir YouTube playlist adresi değil; atlanıyor.");
      } else if (link) {
        try {
          log(c.dim("  Liste okunuyor…"));
          const remote = await resolvePlaylistTracks(link);
          const missing = audio.filter((t) => coverState(t, storage) === "missing");
          const result = matchTracks(missing, remote);

          const byTrack = new Map(
            result.confident.map((m) => [m.local, m.remote.url || m.remote.thumbnail]),
          );
          fallback = (track) => byTrack.get(track);
          log(c.green(`  ✓ ${result.confident.length}/${missing.length} parça eşleşti`));
        } catch (err) {
          logError(`  ✗ Okunamadı (${err.message}); kapaksızlar atlanacak.`);
        }
      }
    }

    log();
    log(c.bold("  3 · İndirme"));
    const answer = (await ask("  Kapaklar depoya taşınsın mı? [E/h] ")).trim().toLowerCase();
    if (answer === "h" || answer === "n") {
      log(c.dim("  Vazgeçildi."));
      return;
    }

    const result = await syncCovers({
      tracks: doc.tracks,
      storage,
      fallback,
      onProgress: (done, total, track) => {
        if (!stdout.isTTY) return;
        stdout.write(`\r  ${c.dim(`${done}/${total} · ${track.title.slice(0, 40)}`)}`.padEnd(70));
      },
    });
    if (stdout.isTTY) stdout.write("\r".padEnd(72) + "\r");

    if (result.ingested === 0) {
      logError("  Hiçbir kapak indirilemedi; liste değiştirilmedi.");
      for (const item of result.failed.slice(0, 5)) {
        log(c.dim(`  − ${item.track.title.slice(0, 44)} (${item.reason})`));
      }
      return;
    }

    // Kapak değişikliği süreleri etkilemiyor; epoch'a dokunmaya gerek yok.
    doc.tracks = result.tracks;
    await writeDoc(doc);

    log(c.green(`  ✓ ${result.ingested} kapak depoya taşındı · ${storeLabel()}`));
    if (result.failed.length > 0) {
      log(c.yellow(`  − ${result.failed.length} parça kapaksız kaldı:`));
      for (const item of result.failed.slice(0, 8)) {
        log(c.dim(`    ${item.track.title.slice(0, 44)} (${item.reason})`));
      }
    }
    log();
  } finally {
    rl.close();
  }
}

if (!stdin.isTTY) {
  log(c.bold("Orbitcast · kapak onarımı"));
  log();
  log("  Bu komut bir terminal gerektirir:");
  log(c.cyan("    npm run radio:covers"));
  process.exitCode = 1;
} else {
  await main();
}
