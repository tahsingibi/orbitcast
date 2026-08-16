/** YouTube IFrame Player API'nin kullandığımız kadarının tip tanımı. */

export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export type YouTubePlayer = {
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  /** Reklam sırasında parçanın değil, reklamın süresini bildirir. */
  getDuration(): number;
  getPlayerState(): number;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
};

type YouTubeApi = {
  Player: new (
    element: HTMLElement | string,
    options: {
      videoId?: string;
      host?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: { data: number }) => void;
        onError?: (event: { data: number }) => void;
      };
    },
  ) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YouTubeApi> | null = null;

/** IFrame API script'ini sayfa başına bir kez yükler. */
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }

    // API hazır olduğunda global callback'i çağırır; başka bir yükleyici
    // varsa onu ezmemek için zincirliyoruz.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("PLAYER_API_FAILED"));
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("PLAYER_API_FAILED"));
    document.head.appendChild(script);
  });

  return apiPromise;
}

/** Oynatıcı hata kodunu sözlük anahtarına çevirir. */
export function playerErrorKey(
  code: number,
): "playerInvalidId" | "playerUnsupported" | "playerRemoved" | "playerNotEmbeddable" | "playerGeneric" {
  switch (code) {
    case 2:
      return "playerInvalidId";
    case 5:
      return "playerUnsupported";
    case 100:
      return "playerRemoved";
    case 101:
    case 150:
      return "playerNotEmbeddable";
    default:
      return "playerGeneric";
  }
}
