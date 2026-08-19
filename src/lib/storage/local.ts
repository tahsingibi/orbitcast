/**
 * Dosyaları repodaki `public/audio` altına yazan depo.
 *
 * Projenin ilk günden beri yaptığı şey; R2 eklenince davranışı korumak için
 * adapter'a dönüştürüldü. Kurulum gerektirmemesi tek avantajı, dosyaların
 * git geçmişine girmesi tek dezavantajı.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AudioStorage, PutInput } from "./index.ts";

// import.meta.url derleme çıktısının içini gösterdiği için proje köküne
// oradan ulaşılamıyor; `playlist-store.ts` ile aynı gerekçeyle cwd.
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

export function createLocalStorage(): AudioStorage {
  return {
    kind: "local",
    publicBase: "/audio/",

    async put({ key, body }: PutInput): Promise<string> {
      const target = path.join(AUDIO_DIR, key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
      return `/audio/${key}`;
    },
  };
}
