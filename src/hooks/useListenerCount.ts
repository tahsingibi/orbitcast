"use client";

import { useEffect, useState } from "react";

/**
 * Kaç kişinin aynı anda dinlediğini bildirir.
 *
 * Kalp atışı yalnızca ses çalarken ve sekme görünürken gidiyor. Bu hem
 * Upstash komut bütçesini koruyor hem de sayıyı doğru tanımlıyor: sayfayı
 * açık unutan biri "dinleyici" değil.
 *
 * Sunucu sayaç veremezse (Redis yok, kota bitti) `null` döner ve arayüz
 * rozeti hiç göstermez — yayının önüne geçmeyen sessiz bir başarısızlık.
 */

/** Sunucudaki kova genişliğiyle uyumlu; ondan kısa olması sayıyı düzeltmez. */
const HEARTBEAT_MS = 5 * 60 * 1000;

const STORAGE_KEY = "radio:listener-id";

/** Oturumluk, anlamsız bir kimlik. Kapatılınca kaybolur. */
function listenerId(): string {
  const existing = window.sessionStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const id = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
  window.sessionStorage.setItem(STORAGE_KEY, id);
  return id;
}

export function useListenerCount(active: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const beat = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/presence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: listenerId() }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { count: number | null };
        if (!cancelled) setCount(data.count);
      } catch {
        // Ağ hatasında eldeki sayıyla devam et.
      }
    };

    void beat();
    const interval = window.setInterval(beat, HEARTBEAT_MS);

    // Sekmeye dönüldüğünde sayı bayat olabilir; bir atış da o an gitsin.
    const onVisible = () => {
      if (document.visibilityState === "visible") void beat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);

  return count;
}
