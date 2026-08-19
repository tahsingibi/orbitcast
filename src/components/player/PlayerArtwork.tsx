import type { RefObject } from "react";

import CoverArt from "@/components/CoverArt";
import { useT } from "@/lib/i18n/context";
import type { Track } from "@/lib/radio";

/**
 * Kapak — ve altında saklanan ses kaynağı.
 *
 * YouTube iframe'i ekran dışına atılmıyor, kapağın *altına* konuyor: mobil
 * tarayıcılar görünmeyen ya da ekran dışındaki medyayı oynatmayı reddedebiliyor.
 * Örtmek oynatmayı engellemiyor, çünkü tarayıcılar kararı elemanın hesaplanmış
 * stiline ve boyutuna bakarak veriyor, üstünün kapalı olup olmadığına değil.
 */
export default function PlayerArtwork({
  track,
  mountRef,
  adBreak,
  isBuffering,
}: {
  track: Track;
  /** Oynatma motorunun bağlanacağı kap. */
  mountRef: RefObject<HTMLDivElement | null>;
  adBreak: boolean;
  isBuffering: boolean;
}) {
  const t = useT();

  return (
    <div className="relative min-h-0 w-full max-h-96 flex-1 overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl shadow-black/60 ring-1 ring-white/10">
      <div
        ref={mountRef}
        aria-hidden
        className="yt-slot pointer-events-none absolute inset-0"
      />
      {/*
        Iframe'i örten opak zemin.

        Kapak tek başına yetmiyor: `key` her parça değişiminde <img>'i yeniden
        kurduğu için yeni görsel inene kadar ortada saydam bir boşluk kalıyor
        ve iframe görünüyor. Kapak 404 verirse boşluk kalıcı oluyor. Zemin
        kapakla aynı katmanda ama DOM'da önce, yani kapak yüklendiğinde onun
        altında kalıyor.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 bg-neutral-900"
      />
      <CoverArt
        track={track}
        alt={`${track.artist} — ${track.title}`}
        fill
        priority
        className="z-10 object-cover"
      />
      {(adBreak || isBuffering) && (
        <div className="absolute inset-0 z-20 flex items-end justify-start bg-neutral-950/30 p-4">
          <span className="rounded-full bg-neutral-950/70 px-3 py-1 text-[11px] text-neutral-300 backdrop-blur">
            {adBreak ? t.player.adBreak : t.player.buffering}
          </span>
        </div>
      )}
    </div>
  );
}
