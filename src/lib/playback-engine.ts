"use client";

import { trackKind, type Track } from "./radio";
import {
  loadYouTubeApi,
  PlayerState,
  playerErrorKey,
  type YouTubePlayer,
} from "./youtube";

/**
 * Playlist'te iki tür parça olabilir: gömülü YouTube videoları ve repodaki ses
 * dosyaları. İkisinin oynatma API'si taban tabana zıt, ama radyonun geri
 * kalanı için ikisi de "şu parçayı şu saniyeden çal" demekten ibaret.
 *
 * Bu sınıf o farkı yutuyor. RadioPlayer tek bir motorla konuşur; hangi arka
 * ucun devrede olduğunu bilmesi gerekmez.
 *
 * Arka uçlar tembel kurulur: yalnızca YouTube parçası olan bir istasyonda
 * `<audio>` hiç oluşturulmaz, yalnızca yerel dosyaları olan bir istasyonda
 * YouTube iframe API'si hiç indirilmez.
 */

/**
 * `createYouTube` API yüklenene kadar geçen sürede ikinci bir oynatıcı
 * kurulmasını engelleyen yer tutucu. Hiçbir çağrısı bu aralıkta kullanılmaz;
 * `ytReady` false olduğu için tüm komutlar `pending`e düşer.
 */
const PLACEHOLDER = {
  loadVideoById: () => {},
  playVideo: () => {},
  pauseVideo: () => {},
  seekTo: () => {},
  getCurrentTime: () => 0,
  getDuration: () => 0,
  getPlayerState: () => PlayerState.UNSTARTED,
  setVolume: () => {},
  mute: () => {},
  unMute: () => {},
  destroy: () => {},
} satisfies YouTubePlayer;

/**
 * Çok kısa, sessiz bir WAV. iOS'ta oynatma iznini dokunma olayının içinde
 * almak için çalınacak bir şey gerekiyor.
 */
const SILENCE =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=";

export type EngineEvents = {
  /** Motor ilk kez komut alabilir hâle geldiğinde. */
  onReady: () => void;
  onBuffering: (buffering: boolean) => void;
  /** Ses gerçekten akmaya başladı; eski hata mesajı varsa düşürülür. */
  onPlaying: () => void;
  onEnded: () => void;
  onError: (key: ReturnType<typeof playerErrorKey> | "playerApiFailed") => void;
};

type Pending = { track: Track; startSeconds: number } | null;

export class PlaybackEngine {
  private readonly container: HTMLElement;
  private readonly events: EngineEvents;

  private yt: YouTubePlayer | null = null;
  private ytReady = false;
  private audio: HTMLAudioElement | null = null;

  private active: "youtube" | "audio" | null = null;
  /** Arka uç hazır değilken gelen yükleme isteği; hazır olunca uygulanır. */
  private pending: Pending = null;
  private wantsPlayback = false;
  private volume = 80;
  private muted = false;
  private announcedReady = false;
  private destroyed = false;

  constructor(container: HTMLElement, events: EngineEvents) {
    this.container = container;
    this.events = events;
  }

  // --- Dışa açık yüzey -------------------------------------------------------

  /**
   * Parçayı verilen saniyeden yükler ve gerekiyorsa arka uçlar arasında geçer.
   *
   * Geçişte diğer arka uç susturulmaz, *durdurulur*: iki ses üst üste binerse
   * senkron duygusu tamamen kaybolur.
   */
  /**
   * Arka ucu önceden kurar; hiçbir şey yüklemez, çalmaz.
   *
   * Buna ihtiyaç var çünkü oynat düğmesi motor hazır olana kadar kapalı
   * duruyor, motor da ilk `load()` çağrısına kadar arka uç kurmuyordu —
   * düğmeye basılmadan hazır olamayan, basılamayan bir düğme.
   */
  prepare(track: Track): void {
    if (this.destroyed) return;
    if (trackKind(track) === "audio") this.ensureAudio();
    else if (!this.yt) this.createYouTube(track.videoId);
  }

  load(track: Track, startSeconds: number): void {
    if (this.destroyed) return;

    if (trackKind(track) === "audio") {
      this.stopYouTube();
      this.loadAudio(track, startSeconds);
    } else {
      this.stopAudio();
      this.loadYouTube(track, startSeconds);
    }
  }

  play(): void {
    this.wantsPlayback = true;
    if (this.active === "audio") void this.audio?.play().catch(() => {});
    else this.yt?.playVideo();
  }

  pause(): void {
    this.wantsPlayback = false;
    this.audio?.pause();
    this.yt?.pauseVideo();
  }

  seek(seconds: number): void {
    if (this.active === "audio") {
      if (this.audio) this.audio.currentTime = seconds;
    } else {
      this.yt?.seekTo(seconds, true);
    }
  }

  currentTime(): number {
    if (this.active === "audio") return this.audio?.currentTime ?? 0;
    return this.yt?.getCurrentTime() ?? 0;
  }

  /**
   * Oynatıcının bildirdiği süre.
   *
   * Normalde parçanın süresi. YouTube araya reklam soktuğunda ise *reklamın*
   * süresi — IFrame API'de reklam olayı olmadığı için elimizdeki en güvenilir
   * işaret bu.
   */
  duration(): number {
    if (this.active === "audio") return this.audio?.duration ?? 0;
    return this.yt?.getDuration() ?? 0;
  }

  isPlaying(): boolean {
    if (this.active === "audio") {
      const audio = this.audio;
      return Boolean(audio && !audio.paused && !audio.ended && audio.readyState > 2);
    }
    return this.yt?.getPlayerState() === PlayerState.PLAYING;
  }

  applyVolume(volume: number, muted: boolean): void {
    this.volume = volume;
    this.muted = muted;

    if (this.audio) {
      this.audio.volume = volume / 100;
      this.audio.muted = muted || volume === 0;
    }
    if (this.ytReady && this.yt) {
      this.yt.setVolume(volume);
      if (muted || volume === 0) this.yt.mute();
      else this.yt.unMute();
    }
  }

  /**
   * İki arka ucu da kullanıcı hareketinin *içinde* uyandırır.
   *
   * iOS otomatik oynatma iznini eleman başına ve yalnızca dokunma olayı
   * sırasında veriyor. Karışık bir listede ilk parça YouTube ise, sıra yerel
   * dosyaya geldiğinde artık dokunma olayının içinde olmayacağız ve `<audio>`
   * sessizce reddedilecekti. Onu şimdi, izin varken açıp kapatıyoruz.
   */
  unlock(): void {
    if (this.destroyed) return;
    const audio = this.ensureAudio();
    if (!audio.paused || this.active === "audio") return;

    // Kaynağı olmayan bir <audio> çalmayı reddeder, dolayısıyla kilit de
    // açılmazdı. Bir anlık sessizlik çalıp durduruyoruz; asıl parça geldiğinde
    // `loadAudio` src'yi zaten değiştiriyor.
    if (!audio.src) audio.src = SILENCE;
    void audio
      .play()
      .then(() => audio.pause())
      .catch(() => {});
  }

  destroy(): void {
    this.destroyed = true;
    this.pending = null;

    this.audio?.pause();
    this.audio?.remove();
    this.audio = null;

    this.yt?.destroy();
    this.yt = null;
    this.ytReady = false;
  }

  // --- YouTube arka ucu ------------------------------------------------------

  private loadYouTube(track: Track, startSeconds: number): void {
    this.active = "youtube";

    if (!this.yt) {
      this.pending = { track, startSeconds };
      this.createYouTube(track.videoId);
      return;
    }
    if (!this.ytReady) {
      this.pending = { track, startSeconds };
      return;
    }

    this.yt.loadVideoById({ videoId: track.videoId, startSeconds });
    if (this.wantsPlayback) this.yt.playVideo();
  }

  /**
   * Oynatıcıyı kurar.
   *
   * `videoId` şart: parametresiz kurulan oynatıcı boş bir embed adresi açıyor
   * ve YouTube buna "geçersiz video kimliği" hatasıyla cevap veriyor — kullanıcı
   * daha hiçbir şeye basmadan ekranda hata bandı beliriyordu.
   */
  private createYouTube(videoId: string): void {
    // İki kez çağrılmasın diye niyet hemen işaretleniyor; API yüklemesi async.
    this.yt = PLACEHOLDER;

    loadYouTubeApi()
      .then((YT) => {
        if (this.destroyed) return;

        // YT.Player verilen elementi iframe ile değiştirdiği için React'in
        // yönetmediği geçici bir düğüm veriyoruz.
        const host = document.createElement("div");
        this.container.appendChild(host);

        this.yt = new YT.Player(host, {
          videoId,
          playerVars: {
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            fs: 0,
            playsinline: 1,
            iv_load_policy: 3,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              this.ytReady = true;
              this.applyVolume(this.volume, this.muted);
              this.announceReady();
              this.flushPending();
            },
            onStateChange: ({ data }) => {
              if (this.active !== "youtube") return;
              this.events.onBuffering(data === PlayerState.BUFFERING);
              if (data === PlayerState.PLAYING) this.events.onPlaying();
              if (data === PlayerState.ENDED) this.events.onEnded();
            },
            onError: ({ data }) => {
              if (this.active === "youtube") this.events.onError(playerErrorKey(data));
            },
          },
        });
      })
      .catch(() => {
        this.yt = null;
        this.events.onError("playerApiFailed");
      });
  }

  private stopYouTube(): void {
    if (this.ytReady) this.yt?.pauseVideo();
  }

  // --- Yerel dosya arka ucu --------------------------------------------------

  private ensureAudio(): HTMLAudioElement {
    if (this.audio) return this.audio;

    const audio = document.createElement("audio");
    audio.preload = "auto";
    // Bilerek crossOrigin verilmiyor: sesi canvas'a ya da WebAudio'ya
    // taşımadığımız için CORS'a ihtiyaç yok, ama istemek dosyayı CORS
    // başlığı göndermeyen bir CDN'den servis edenleri kırardı.
    audio.volume = this.volume / 100;
    audio.muted = this.muted || this.volume === 0;

    audio.addEventListener("waiting", () => {
      if (this.active === "audio") this.events.onBuffering(true);
    });
    audio.addEventListener("playing", () => {
      if (this.active !== "audio") return;
      this.events.onBuffering(false);
      this.events.onPlaying();
    });
    audio.addEventListener("canplay", () => {
      if (this.active === "audio") this.events.onBuffering(false);
    });
    audio.addEventListener("ended", () => {
      if (this.active === "audio") this.events.onEnded();
    });
    audio.addEventListener("error", () => {
      if (this.active === "audio") this.events.onError("playerGeneric");
    });

    this.container.appendChild(audio);
    this.audio = audio;
    this.announceReady();
    return audio;
  }

  private loadAudio(track: Track, startSeconds: number): void {
    const audio = this.ensureAudio();
    this.active = "audio";

    const src = track.src ?? "";
    // Aynı dosyadaysak yeniden yüklemek gereksiz bir buffer turu demek.
    if (!audio.src.endsWith(src)) {
      audio.src = src;
      audio.load();
    }

    const seek = () => {
      audio.currentTime = startSeconds;
      if (this.wantsPlayback) void audio.play().catch(() => {});
    };

    // Metadata gelmeden currentTime atanamaz; hazırsa doğrudan, değilse bir
    // kerelik dinleyiciyle.
    if (audio.readyState >= 1) seek();
    else audio.addEventListener("loadedmetadata", seek, { once: true });
  }

  private stopAudio(): void {
    this.audio?.pause();
  }

  // --- Ortak -----------------------------------------------------------------

  private announceReady(): void {
    if (this.announcedReady) return;
    this.announcedReady = true;
    this.events.onReady();
  }

  private flushPending(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.load(pending.track, pending.startSeconds);
  }
}
