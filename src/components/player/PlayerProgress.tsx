import { formatClock } from "@/lib/radio";

/**
 * Parça ilerlemesi — yalnızca göstergedir.
 *
 * Tıklanamaz ve sürüklenemez: konum herkes için ortak hesaplandığından tek
 * kişilik sarma diye bir şey yok. Etkileşimli görünen bir çubuk yanlış söz
 * verirdi.
 */
export default function PlayerProgress({
  offsetSec,
  durationSec,
  /** Parça sırası; değişince geçiş animasyonu baştan kurulsun diye anahtar. */
  index,
}: {
  offsetSec: number;
  durationSec: number;
  index: number;
}) {
  const progress = Math.min(100, (offsetSec / durationSec) * 100);

  return (
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
        <span>{formatClock(durationSec)}</span>
      </div>
    </div>
  );
}
