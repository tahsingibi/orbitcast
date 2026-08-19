"use client";

import { useEffect } from "react";

import type { Track } from "@/lib/radio";

/**
 * İşletim sistemine "burada bir şey çalıyor" der.
 *
 * Sesi `<audio>` ile çalmak tek başına yetmiyor: mobil tarayıcılar sekme arka
 * plana düştüğünde ya da ekran kilitlendiğinde, kendini tanıtmamış bir sesi
 * askıya alma hakkını saklı tutuyor. MediaSession bu tanıtımı yapıyor —
 * karşılığında kilit ekranında kapak, ad ve oynat/duraklat çıkıyor.
 *
 * Radyoya özgü kısım: ileri/geri sarma ve parça atlama **bilerek kapatılıyor**.
 * Konum `(now - epoch) mod toplamSüre` ile herkes için aynı hesaplandığından
 * tek bir dinleyicinin ileri sarması diye bir şey yok; işletim sistemine
 * çubuk gösterttirmek sadece çalışmayan bir düğme sunardı.
 *
 * Desteklemeyen tarayıcıda sessizce hiçbir şey yapmaz.
 */
export function useMediaSession(options: {
  track: Track;
  stationName: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
}): void {
  const { track, stationName, isPlaying, onPlay, onPause } = options;
  const { title, artist, thumbnail } = track;

  // Üstveri: parça değiştikçe tazeleniyor.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: stationName,
      artwork: thumbnail ? [{ src: thumbnail }] : [],
    });
  }, [title, artist, thumbnail, stationName]);

  // Durum: kilit ekranındaki düğmenin doğru simgeyi göstermesi için.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // Kontroller.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

    const session = navigator.mediaSession;

    /** Tarayıcı bilmediği eylemi reddediyor; radyoda anlamsız olanları susturuyoruz. */
    const set = (action: MediaSessionAction, handler: (() => void) | null) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Bu eylemi desteklemiyor; sorun değil.
      }
    };

    set("play", onPlay);
    set("pause", onPause);
    set("stop", onPause);

    // Yayın canlı: sarma ve atlama yok.
    for (const action of [
      "seekto",
      "seekforward",
      "seekbackward",
      "nexttrack",
      "previoustrack",
    ] as const) {
      set(action, null);
    }

    return () => {
      set("play", null);
      set("pause", null);
      set("stop", null);
    };
  }, [onPlay, onPause]);
}
