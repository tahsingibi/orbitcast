"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import InfoDialog from "@/components/InfoDialog";
import QueueSheet from "@/components/QueueSheet";
import MarqueeText from "@/components/MarqueeText";
import ShareMenu from "@/components/ShareMenu";
import SourceBadge from "@/components/SourceBadge";
import { useListenerCount } from "@/hooks/useListenerCount";
import { useServerClock } from "@/hooks/useServerClock";
import {
  formatClock,
  resolveRadioState,
  trackKind,
  type RadioState,
  type Station,
} from "@/lib/radio";
import { site } from "@/lib/site";
import LanguageSwitch from "@/components/LanguageSwitch";
import { useT } from "@/lib/i18n/context";
import { PlaybackEngine } from "@/lib/playback-engine";
import Link from "next/link";

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

  const togglePlay = isPlaying ? pause : play;
  const displayVolume = muted ? 0 : volume;
  const { track, nextTrack, offsetSec, index } = state;
  const progress = Math.min(100, (offsetSec / track.durationSec) * 100);


  return (
    <main className="relative flex h-full items-center justify-center overflow-hidden bg-neutral-950 px-5 py-4 text-neutral-100 [@media(min-height:720px)]:py-8">
      {/* Kapaktan türeyen atmosfer */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <Image
          key={track.videoId}
          src={track.thumbnail}
          alt=""
          fill
          priority
          sizes="100vw"
          className="scale-125 object-cover opacity-40 blur-3xl saturate-150"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/40 via-neutral-950/75 to-neutral-950" />
      </div>

      <section className="flex h-full w-full max-w-sm flex-col justify-center gap-4 [@media(min-height:800px)]:gap-5">
        <header className="flex shrink-0 items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold tracking-[0.2em] text-neutral-200">
              {station.name}
            </h1>
            <p className="mt-1 text-xs text-neutral-500">{station.tagline}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {listeners !== null && listeners > 0 && (
              <span
                title={t.player.listenersHint}
                className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.15em] text-neutral-400"
              >
                <ListenersIcon />
                {listeners}
              </span>
            )}
            <SourceBadge source={station.source} active={isPlaying} />
          </div>
        </header>

        <div className="relative min-h-0 w-full max-h-96 flex-1 overflow-hidden rounded-2xl bg-neutral-900 shadow-2xl shadow-black/60 ring-1 ring-white/10">
          {/*
            Ses kaynağı. Ekran dışına atmak yerine kapağın *altına* konuyor:
            mobil tarayıcılar görünmeyen veya ekran dışındaki medyayı
            oynatmayı reddedebiliyor. Opak kapak görseli üstünü tamamen örter.
          */}
          <div ref={mountRef} aria-hidden className="yt-slot pointer-events-none absolute inset-0" />
          {/*
            Iframe'i örten opak zemin.

            Kapak tek başına yetmiyor: `key` her parça değişiminde <img>'i
            yeniden kurduğu için yeni görsel inene kadar ortada saydam bir
            boşluk kalıyor ve iframe görünüyor. Kapak 404 verirse boşluk
            kalıcı oluyor. Zemin kapakla aynı katmanda ama DOM'da önce, yani
            kapak yüklendiğinde onun altında kalıyor.

            Örtmek oynatmayı engellemiyor: tarayıcılar otomatik oynatma
            kararını elemanın hesaplanmış stiline ve boyutuna bakarak veriyor,
            üstünün kapalı olup olmadığına değil.
          */}
          <div aria-hidden className="pointer-events-none absolute inset-0 z-10 bg-neutral-900" />
          <Image
            key={track.videoId}
            src={track.thumbnail}
            alt={`${track.artist} — ${track.title}`}
            fill
            priority
            sizes="(max-width: 400px) 100vw, 384px"
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

        <div className="flex shrink-0 items-end gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-[0.18em] text-neutral-500">
              {t.player.nowPlaying}
            </p>
            {/*
              Uzun adlar üç noktanın arkasında kayboluyordu; sığmıyorsa metin
              kendi alanı içinde gidip geliyor. Anahtar parçaya bağlı: yeni
              parçada animasyon baştan kurulsun.
            */}
            <h2 className="mt-1.5 text-xl font-semibold tracking-tight [@media(min-height:720px)]:text-2xl">
              <MarqueeText key={track.videoId} text={track.title} />
            </h2>
            <p
              className="mt-1 truncate text-sm text-neutral-400"
              title={track.artist}
            >
              {track.artist}
            </p>
          </div>

          {/* Paylaşılan şey bu parça; eylem oynatma kontrollerinin değil,
              parça bilgisinin yanına ait. */}
          <ShareMenu station={station} track={track} />
        </div>

        {/* Yalnızca göstergedir: tıklanamaz, sürüklenemez. */}
        <div className="shrink-0">
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              key={index}
              className="h-full rounded-full bg-neutral-100 transition-[width] duration-500 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[11px] tabular-nums text-neutral-500">
            <span>{formatClock(offsetSec)}</span>
            <span>{formatClock(track.durationSec)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!playerReady}
            aria-label={isPlaying ? t.player.pause : t.player.play}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-950 transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 [@media(min-height:720px)]:h-14 [@media(min-height:720px)]:w-14"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          <div className="flex flex-1 items-center gap-3">
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? t.player.unmute : t.player.mute}
              className="text-neutral-400 transition hover:text-neutral-100"
            >
              {displayVolume === 0 ? <MutedIcon /> : <SpeakerIcon />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={displayVolume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                setMuted(false);
              }}
              aria-label={t.player.volume}
              className="volume-slider h-1 w-full cursor-pointer appearance-none rounded-full"
              style={{
                background: `linear-gradient(to right, #f5f5f5 ${displayVolume}%, rgba(255,255,255,0.15) ${displayVolume}%)`,
              }}
            />
          </div>
        </div>

        {errorKey && (
          <p className="shrink-0 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {t.errors[errorKey] as string} {t.player.errorSuffix}
          </p>
        )}

        <button
          type="button"
          onClick={() => setQueueOpen(true)}
          className="group hidden w-full shrink-0 items-center gap-3 border-t border-white/5 pt-4 text-left [@media(min-height:620px)]:flex"
        >
          <Image
            src={nextTrack.thumbnail}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 rounded-lg object-cover opacity-70 transition group-hover:opacity-100"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium tracking-[0.18em] text-neutral-600">
              {t.player.upNext}
            </p>
            <p className="mt-0.5 truncate text-sm text-neutral-300">
              {nextTrack.title}
            </p>
            <p className="truncate text-xs text-neutral-500">
              {nextTrack.artist}
            </p>
          </div>
          <span className="shrink-0 text-[11px] text-neutral-600 transition group-hover:text-neutral-300">
            {t.player.openQueue}
          </span>
        </button>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-neutral-600">
          {/* Künye artık "Hakkında" penceresinde; burada yalnızca dört giriş
              kalıyor ki satır okunur olsun. */}
          <p>
            <LanguageSwitch />
          </p>
          <span className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQueueOpen(true)}
              className="text-neutral-500 underline decoration-white/15 underline-offset-4 transition hover:text-neutral-300 hover:decoration-white/40"
            >
              {t.player.queueLink}
            </button>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="text-neutral-500 underline decoration-white/15 underline-offset-4 transition hover:text-neutral-300 hover:decoration-white/40"
            >
              {t.player.infoLink}
            </button>
            <Link
              href={site.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-neutral-500 underline decoration-white/15 underline-offset-4 transition hover:text-neutral-300 hover:decoration-white/40"
            >
              {t.player.repoLink}
            </Link>
          </span>
        </footer>
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
      />
    </main>
  );
}

/** Dinleyici rozetinin ikonu: iki kişi silueti. */
function ListenersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden>
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-6 1.8-6 4v2h12v-2c0-2.2-2.7-4-6-4Z" />
      <path d="M17.5 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm.5 1.5c-.7 0-1.4.1-2 .3 1.3.9 2 2.1 2 3.4V19h4v-1.6c0-2-2.4-3.4-4-3.9Z" opacity=".6" />
    </svg>
  );
}


function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-6 w-6">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
    >
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" strokeLinejoin="round" />
      <path
        d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
    >
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" strokeLinejoin="round" />
      <path d="m16 10 4 4m0-4-4 4" strokeLinecap="round" />
    </svg>
  );
}
