import MarqueeText from "@/components/MarqueeText";
import ShareMenu from "@/components/ShareMenu";
import { useT } from "@/lib/i18n/context";
import type { Station, Track } from "@/lib/radio";

/** Çalan parçanın adı, sanatçısı ve paylaşım eylemi. */
export default function TrackInfo({
  station,
  track,
}: {
  station: Station;
  track: Track;
}) {
  const t = useT();

  return (
    <div className="flex shrink-0 items-end gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-[0.18em] text-neutral-500">
          {t.player.nowPlaying}
        </p>
        {/*
          Uzun adlar üç noktanın arkasında kayboluyordu; sığmıyorsa metin kendi
          alanı içinde gidip geliyor. Anahtar parçaya bağlı: yeni parçada
          animasyon baştan kurulsun.
        */}
        <h2 className="mt-1.5 text-xl font-semibold tracking-tight [@media(min-height:720px)]:text-2xl">
          <MarqueeText key={track.videoId} text={track.title} />
        </h2>
        <p className="mt-1 truncate text-sm text-neutral-400" title={track.artist}>
          {track.artist}
        </p>
      </div>

      {/* Paylaşılan şey bu parça; eylem oynatma kontrollerinin değil, parça
          bilgisinin yanına ait. */}
      <ShareMenu station={station} track={track} />
    </div>
  );
}
