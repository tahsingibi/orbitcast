"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

const RESYNC_INTERVAL_MS = 5 * 60 * 1000;
const SAMPLE_COUNT = 3;

type Anchor = {
  /** Ölçüm anındaki sunucu zamanı (ms). */
  serverMs: number;
  /** Aynı ana denk gelen monotonik tarayıcı zamanı. */
  perfMs: number;
  /** Ölçümün gidiş-dönüş süresi; daha küçüğü daha güvenilir. */
  rttMs: number;
};

/**
 * Sunucu saatine kilitlenmiş bir zaman kaynağı.
 *
 * Kullanıcının sistem saati yanlış olabilir (hatta yayın sırasında değişebilir),
 * bu yüzden bir kez sunucudan referans alınır ve sonrasında ilerleme
 * `performance.now()` üzerinden — yani saat değişimlerinden etkilenmeyen
 * monotonik bir sayaçla — sürdürülür.
 */
export function useServerClock(initialServerMs: number) {
  const anchorRef = useRef<Anchor | null>(null);

  const now = useCallback(() => {
    // İlk çapa sunucudan gelen HTML'in zaman damgasıdır; ağ gecikmesi kadar
    // hatalıdır ama ilk kareyi çizmeye yeter, hemen ardından /api/now ile
    // rafine edilir. Render sırasında değil, ilk okumada kurulur.
    anchorRef.current ??= {
      serverMs: initialServerMs,
      perfMs: performance.now(),
      rttMs: Number.POSITIVE_INFINITY,
    };

    const anchor = anchorRef.current;
    return anchor.serverMs + (performance.now() - anchor.perfMs);
  }, [initialServerMs]);

  const sync = useCallback(async () => {
    let best: Anchor | null = null;

    for (let i = 0; i < SAMPLE_COUNT; i += 1) {
      const sentAt = performance.now();
      try {
        const res = await fetch("/api/now", { cache: "no-store" });
        if (!res.ok) continue;
        const { now: serverMs } = (await res.json()) as { now: number };
        const receivedAt = performance.now();
        const rttMs = receivedAt - sentAt;

        // Cevap yazıldığı an ≈ isteğin ortası. Yarım RTT'yi geri ekliyoruz.
        const candidate: Anchor = { serverMs: serverMs + rttMs / 2, perfMs: receivedAt, rttMs };
        if (!best || candidate.rttMs < best.rttMs) best = candidate;
      } catch {
        // Ağ hatasında eldeki çapayla devam et.
      }
    }

    if (best) anchorRef.current = best;
  }, []);

  useEffect(() => {
    void sync();

    const interval = window.setInterval(() => void sync(), RESYNC_INTERVAL_MS);

    // Sekme arka plandayken zamanlayıcılar kısılır; geri dönüldüğünde tazele.
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sync]);

  // Kimliği sabit kalmalı: tüketen efektler her render'da yeniden kurulmasın.
  return useMemo(() => ({ now, sync }), [now, sync]);
}
