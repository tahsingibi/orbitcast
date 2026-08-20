"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import CoverArt from "@/components/CoverArt";
import PlayerArtwork from "@/components/player/PlayerArtwork";
import PlayerControls from "@/components/player/PlayerControls";
import PlayerFooter from "@/components/player/PlayerFooter";
import PlayerProgress from "@/components/player/PlayerProgress";
import StationHeader from "@/components/player/StationHeader";
import TrackInfo from "@/components/player/TrackInfo";
import UpNext from "@/components/player/UpNext";
import InfoDialog from "@/components/InfoDialog";
import QueueSheet from "@/components/QueueSheet";
import { useListenerCount } from "@/hooks/useListenerCount";
import { useMediaSession } from "@/hooks/useMediaSession";
import { useServerClock } from "@/hooks/useServerClock";
import {
  resolveRadioState,
  trackKind,
  type RadioState,
  type Station,
} from "@/lib/radio";
import { useT } from "@/lib/i18n/context";
import { PlaybackEngine } from "@/lib/playback-engine";

/** Yayın konumunun yeniden hesaplanma sıklığı. */
const TICK_MS = 500;
/** Bu kadar saniyeden büyük sapmalar seek ile düzeltilir. */
const DRIFT_TOLERANCE_SEC = 2;
/** Yükleme/seek sonrası oynatıcının toparlanması için tanınan süre. */
const SETTLE_MS = 3000;
/** Playlist'in değişip değişmediğinin yoklanma sıklığı. */
const PLAYLIST_POLL_MS = 60_000;
/**
 * Oynatıcının bildirdiği süre parçanınkinden bu kadar saparsa araya reklam
 * girmiş sayılır. Kayıtlı süreyle YouTube'un süresi arasındaki yuvarlama
 * farkını yutacak kadar geniş, en kısa reklamı bile yakalayacak kadar dar.
 */
const AD_DURATION_TOLERANCE_SEC = 5;

type Props = {
  initialStation: Station;
  /** Sunucunun sayfayı render ettiği an — ilk kare için zaman çapası. */
  serverNowMs: number;
  initialState: RadioState;
};

export default function RadioPlayer({
  initialStation,
  serverNowMs,
  initialState,
}: Props) {
  const t = useT();
  const clock = useServerClock(serverNowMs);

  const [station, setStation] = useState<Station>(initialStation);
  const [state, setState] = useState<RadioState>(initialState);
  const [infoOpen, setInfoOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  // Kimlikleri sabit kalmalı: pencerelerin kapanma efektleri her render'da
  // yeniden kurulursa animasyon zamanlayıcısı hiç tamamlanamaz.
  const closeQueue = useCallback(() => setQueueOpen(false), []);
  const closeInfo = useCallback(() => setInfoOpen(false), []);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [errorKey, setErrorKey] = useState<keyof typeof t.errors | null>(null);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  /**
   * Araya reklam girdi mi?
   *
   * Reklamı engellemiyoruz — engelleyemeyiz de, engellememeliyiz de. Yalnızca
   * fark edip iki şey yapıyoruz: dinleyiciye ne olduğunu söylüyoruz ve reklam
   * boyunca boşuna sapma düzeltmesi yapmayı bırakıyoruz.
   */
  const [adBreak, setAdBreak] = useState(false);
  // Sayaç yalnızca gerçekten çalarken sayılsın: hem doğru tanım hem ucuz.
  const listeners = useListenerCount(isPlaying);

  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlaybackEngine | null>(null);
  /** Event handler'ların her zaman güncel senkron fonksiyonunu görmesi için. */
  const syncToLiveRef = useRef<(force?: boolean) => void>(() => {});
  /**
   * Oynatıcıya hâlihazırda yüklenmiş parça. Sıra numarası tek başına yetmez:
   * playlist düzenlenirse aynı sırada başka bir video bulunabilir.
   */
  const loadedRef = useRef<{ index: number; videoId: string } | null>(null);
  /** Son yükleme/seek anı; art arda düzeltmeyi engeller. */
  const settleUntilRef = useRef(0);
  /** Kullanıcının niyeti — efektlerin bayat state okumaması için ref. */
  const wantsPlaybackRef = useRef(false);
  /** Reklamın son bilinen hâli; kenar geçişini yakalamak için. */
  const adBreakRef = useRef(false);

  /**
   * Oynatıcıyı yayının canlı konumuna getirir.
   *
   * Parça değiştiyse yeni videoyu doğru saniyeden yükler; aynı parçadaysak
   * yalnızca sapma toleransı aşıldığında seek eder. Kaynak her zaman saat
   * hesabıdır — oynatıcının kendi ilerlemesi değil.
   */
  const syncToLive = useCallback(
    (force = false) => {
      const player = playerRef.current;
      if (!player) return;

      const live = resolveRadioState(station, clock.now());
      const loaded = loadedRef.current;
      const changed =
        !loaded ||
        loaded.index !== live.index ||
        loaded.videoId !== live.track.videoId;

      if (force || changed) {
        loadedRef.current = { index: live.index, videoId: live.track.videoId };
        settleUntilRef.current = performance.now() + SETTLE_MS;
        setErrorKey(null);
        // Yeni parça yükleniyor; önceki parçanın reklam işareti taşınmasın.
        adBreakRef.current = false;
        setAdBreak(false);
        player.load(live.track, live.offsetSec);
        return;
      }

      // --- Reklam arası -----------------------------------------------------
      // Yalnızca YouTube parçalarında olur. Oynatıcı reklam çalarken durumunu
      // hâlâ PLAYING bildiriyor ama süresi reklamınkine düşüyor.
      const reported = player.duration();
      const inAd =
        trackKind(live.track) === "youtube" &&
        reported > 0 &&
        Math.abs(reported - live.track.durationSec) > AD_DURATION_TOLERANCE_SEC;

      if (inAd !== adBreakRef.current) {
        adBreakRef.current = inAd;
        setAdBreak(inAd);

        // Reklam bittiğinde tek bir hamleyle canlıya dön. Reklam *boyunca*
        // seek etmek işe yaramıyordu: oynatıcı reklamdayken konumu tutmuyor.
        if (!inAd) {
          settleUntilRef.current = performance.now() + SETTLE_MS;
          player.seek(live.offsetSec);
        }
      }

      if (inAd) return;

      if (performance.now() < settleUntilRef.current) return;
      if (!player.isPlaying()) return;

      const drift = player.currentTime() - live.offsetSec;
      if (Math.abs(drift) > DRIFT_TOLERANCE_SEC) {
        settleUntilRef.current = performance.now() + SETTLE_MS;
        player.seek(live.offsetSec);
      }
    },
    [station, clock],
  );

  useEffect(() => {
    syncToLiveRef.current = syncToLive;
  }, [syncToLive]);

  // --- Oynatıcıyı kur --------------------------------------------------------
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const engine = new PlaybackEngine(container, {
      onReady: () => setPlayerReady(true),
      onBuffering: setIsBuffering,
      onPlaying: () => setErrorKey(null),
      // Parça beklenenden erken bitse bile anında canlıya dön.
      onEnded: () => {
        if (wantsPlaybackRef.current) syncToLiveRef.current(true);
      },
      onError: setErrorKey,
    });
    playerRef.current = engine;
    // Arka ucu şimdiden kur ki oynat düğmesi açılabilsin.
    engine.prepare(initialState.track);

    return () => {
      engine.destroy();
      playerRef.current = null;
      container.innerHTML = "";
    };
    // Oynatıcı oturum boyunca bir kez kurulur; ilk parçanın türü yalnızca
    // hangi arka ucun önceden kurulacağını belirler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Yayın saati ----------------------------------------------------------
  useEffect(() => {
    const tick = () => {
      setState(resolveRadioState(station, clock.now()));
      if (wantsPlaybackRef.current) syncToLive();
    };

    tick();
    const interval = window.setInterval(tick, TICK_MS);

    // Arka plandaki sekmede zamanlayıcı kısıldığı için dönüşte hemen hizala.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [station, clock, syncToLive]);

  // --- Playlist güncellemeleri ----------------------------------------------
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/station", { cache: "no-store" });
        if (!res.ok) return;

        const { station: fresh } = (await res.json()) as { station: Station };
        // Boş liste yayını kesmesin: eldeki playlist'le devam et.
        if (!fresh?.tracks?.length) return;

        setStation((current) =>
          current.version === fresh.version ? current : fresh,
        );
      } catch {
        // Ağ hatasında mevcut playlist'le devam et.
      }
    };

    const interval = window.setInterval(poll, PLAYLIST_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // --- Ses ------------------------------------------------------------------
  useEffect(() => {
    const stored = window.localStorage.getItem("radio:volume");
    // Sunucuda localStorage okunamadığı için kayıtlı ses ancak mount sonrası
    // uygulanabilir; hydration uyuşmazlığı yaşamamanın tek yolu bu.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored !== null) setVolume(Number(stored));
  }, []);

  useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || !player) return;

    player.applyVolume(volume, muted);
    window.localStorage.setItem("radio:volume", String(volume));
  }, [volume, muted, playerReady]);

  // --- Kontroller -----------------------------------------------------------
  const play = useCallback(() => {
    wantsPlaybackRef.current = true;
    setIsPlaying(true);
    // iOS oynatma iznini yalnızca dokunma olayının içinde verir; her iki arka
    // ucu da senkronizasyondan *önce*, burada uyandırıyoruz.
    playerRef.current?.unlock();
    playerRef.current?.play();
    // Duraklatmadan sonra kaldığı yerden değil, canlı konumdan devam eder.
    syncToLive(true);
  }, [syncToLive]);

  const pause = useCallback(() => {
    wantsPlaybackRef.current = false;
    setIsPlaying(false);
    setIsBuffering(false);
    // Duraklatınca senkron döngüsü de duruyor; reklam işaretini orada
    // bırakırsak durmuş bir oynatıcının üstünde asılı kalır.
    adBreakRef.current = false;
    setAdBreak(false);
    playerRef.current?.pause();
  }, []);

  // Ses artık kendi dosyalarımızdan gelebildiği için yayın arka planda da
  // sürebilir; işletim sisteminin bunu bilmesi gerekiyor.
  useMediaSession({
    track: state.track,
    stationName: station.name,
    isPlaying,
    onPlay: play,
    onPause: pause,
  });

  const togglePlay = isPlaying ? pause : play;
  const { track, nextTrack, offsetSec, index } = state;

  return (
    <main className="relative flex h-full items-center justify-center overflow-hidden bg-neutral-950 px-5 py-4 text-neutral-100 [@media(min-height:720px)]:py-8">
      {/* Kapaktan türeyen atmosfer */}
      <div className="pointer-events-none absolute inset-0  -z-10">
        <CoverArt
          track={track}
          fill
          plain
          priority
          className="scale-125 object-cover opacity-40 blur-3xl saturate-150"
        />
        <div className="absolute inset-0 bg-linear-to-b from-neutral-950/40 via-neutral-950/75 to-neutral-950" />
      </div>

      <section className="flex h-full w-full max-w-sm flex-col justify-center gap-4 [@media(min-height:800px)]:gap-5">
        <StationHeader
          station={station}
          listeners={listeners}
          isPlaying={isPlaying}
        />

        <PlayerArtwork
          track={track}
          mountRef={mountRef}
          adBreak={adBreak}
          isBuffering={isBuffering}
        />

        <TrackInfo station={station} track={track} />

        <PlayerProgress
          offsetSec={offsetSec}
          durationSec={track.durationSec}
          index={index}
        />

        <PlayerControls
          isPlaying={isPlaying}
          playerReady={playerReady}
          onTogglePlay={togglePlay}
          volume={volume}
          muted={muted}
          onVolumeChange={(value) => {
            setVolume(value);
            setMuted(false);
          }}
          onToggleMute={() => setMuted((m) => !m)}
        />

        {errorKey && (
          <p className="shrink-0 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {t.errors[errorKey] as string} {t.player.errorSuffix}
          </p>
        )}

        <UpNext track={nextTrack} onOpenQueue={() => setQueueOpen(true)} />

        <PlayerFooter
          onOpenQueue={() => setQueueOpen(true)}
          onOpenInfo={() => setInfoOpen(true)}
        />
      </section>

      <QueueSheet
        open={queueOpen}
        onClose={closeQueue}
        station={station}
        state={state}
      />

      <InfoDialog
        open={infoOpen}
        onClose={closeInfo}
        stationName={station.name}
        selfHosted={station.tracks.some(
          (track) => trackKind(track) === "audio",
        )}
      />
    </main>
  );
}
