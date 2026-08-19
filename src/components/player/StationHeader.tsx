import SourceBadge from "@/components/SourceBadge";
import { ListenersIcon } from "@/components/player/icons";
import { useT } from "@/lib/i18n/context";
import type { Station } from "@/lib/radio";

/** İstasyon kimliği ve o anki dinleyici sayısı. */
export default function StationHeader({
  station,
  listeners,
  isPlaying,
}: {
  station: Station;
  /** Sunucu sayaç veremiyorsa null; o hâlde rozet hiç gösterilmiyor. */
  listeners: number | null;
  isPlaying: boolean;
}) {
  const t = useT();

  return (
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
  );
}
