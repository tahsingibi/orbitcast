"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Kaydırma çubuğu gizlenmiş bir alanda hangi yöne kaydırılabileceğini bildirir.
 *
 * Scroll olayı dinlemek yerine alanın başına ve sonuna birer sentinel koyup
 * IntersectionObserver ile izliyoruz: sentinel görünür değilse o yönde
 * kaydırılacak içerik var demektir. Bu yaklaşım her karede state güncellemez
 * ve içerik değiştiğinde ayrıca tetiklenmeye ihtiyaç duymaz — geometri
 * değişince kendiliğinden yeniden hesaplanır.
 *
 * Dönen üç ref sırasıyla kaydırılan kutuya, içeriğin en başına ve en sonuna
 * bağlanır; `fade` de kenarlardaki solma efektlerini sürer.
 */
export function useScrollFade() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [fade, setFade] = useState({ top: false, bottom: false });

  useEffect(() => {
    const viewport = viewportRef.current;
    const top = topRef.current;
    const bottom = bottomRef.current;
    if (!viewport || !top || !bottom) return;

    // Geri çağrı mikrogörev olarak çalışır; render sırasında durum
    // güncellenmediği için zincirleme render sorunu doğmaz.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const edge = entry.target === top ? "top" : "bottom";
          setFade((current) => ({ ...current, [edge]: !entry.isIntersecting }));
        }
      },
      { root: viewport },
    );

    observer.observe(top);
    observer.observe(bottom);

    return () => observer.disconnect();
  }, []);

  return { viewportRef, topRef, bottomRef, fade };
}
