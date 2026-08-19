import CoverArt from "@/components/CoverArt";
import { useT } from "@/lib/i18n/context";
import type { Track } from "@/lib/radio";

/** Sıradaki parça; tıklanınca yayın akışı açılır. */
export default function UpNext({
  track,
  onOpenQueue,
}: {
  track: Track;
  onOpenQueue: () => void;
}) {
  const t = useT();

  return (
    <button
      type="button"
      onClick={onOpenQueue}
      className="group hidden w-full shrink-0 items-center gap-3 border-t border-white/5 pt-4 text-left [@media(min-height:620px)]:flex"
    >
      <CoverArt
        track={track}
        width={44}
        height={44}
        className="h-11 w-11 rounded-lg object-cover opacity-70 transition group-hover:opacity-100"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium tracking-[0.18em] text-neutral-600">
          {t.player.upNext}
        </p>
        <p className="mt-0.5 truncate text-sm text-neutral-300">{track.title}</p>
        <p className="truncate text-xs text-neutral-500">{track.artist}</p>
      </div>
      <span className="shrink-0 text-[11px] text-neutral-600 transition group-hover:text-neutral-300">
        {t.player.openQueue}
      </span>
    </button>
  );
}
