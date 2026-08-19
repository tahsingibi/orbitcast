import { MutedIcon, PauseIcon, PlayIcon, SpeakerIcon } from "@/components/player/icons";
import { useT } from "@/lib/i18n/context";

/** Oynat/duraklat ve ses seviyesi. */
export default function PlayerControls({
  isPlaying,
  playerReady,
  onTogglePlay,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}: {
  isPlaying: boolean;
  /** Motor hazır değilken düğme kilitli: erken tıklama sessizce kaybolurdu. */
  playerReady: boolean;
  onTogglePlay: () => void;
  volume: number;
  muted: boolean;
  onVolumeChange: (value: number) => void;
  onToggleMute: () => void;
}) {
  const t = useT();
  const displayVolume = muted ? 0 : volume;

  return (
    <div className="flex shrink-0 items-center gap-4">
      <button
        type="button"
        onClick={onTogglePlay}
        disabled={!playerReady}
        aria-label={isPlaying ? t.player.pause : t.player.play}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-950 transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 [@media(min-height:720px)]:h-14 [@media(min-height:720px)]:w-14"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="flex flex-1 items-center gap-3">
        <button
          type="button"
          onClick={onToggleMute}
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
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          aria-label={t.player.volume}
          className="volume-slider h-1 w-full cursor-pointer appearance-none rounded-full"
          style={{
            background: `linear-gradient(to right, #f5f5f5 ${displayVolume}%, rgba(255,255,255,0.15) ${displayVolume}%)`,
          }}
        />
      </div>
    </div>
  );
}
