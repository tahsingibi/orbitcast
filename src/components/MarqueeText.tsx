"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Sığmayan metni kendi alanı içinde gidip getiren başlık.
 *
 * Uzun parça adları kesiliyor ve üç noktanın arkasında kalan kısım hiç
 * görünmüyordu. Klasik oynatıcı çözümü: metin sığmıyorsa yavaşça sola kayıyor,
 * sonuna varınca duruyor, geri dönüyor.
 *
 * İki şey bilinçli:
 *
 *   - **Sığıyorsa hiç kıpırdamıyor.** Animasyon yalnızca gerçekten taşan
 *     metinlerde kuruluyor; kısa başlıklarda ekranda oynayan bir şey olmuyor.
 *   - **Solma yalnızca kesilen tarafta.** Metin başlangıçtayken solda kesilen bir
 *     şey yok, o yüzden sol solma kapalı; sona varınca sağdaki kapanıyor. Sabit
 *     tutmak, kesilmemiş içeriğin üstüne gradyan bindirmek olurdu.
 *
 * Hareketi azaltma tercihi açıksa animasyon devre dışı kalıp metin üç noktayla
 * kesiliyor — davranış eskisiyle aynı oluyor.
 */

/**
 * Kaydırma hızı. Okunabilecek kadar yavaş, beklemeyi sıkıcı yapmayacak kadar
 * hızlı; uzun bir başlıkta tam turu ~15 saniyeye getiriyor.
 */
const SPEED_PX_PER_SEC = 60;
/** Zaman çizgisinin hareketle geçen oranı; kalanı iki uçtaki bekleme. */
const MOVING_RATIO = 0.7;
/** Çok küçük taşmalarda animasyon kurmaya değmez (yuvarlama payı). */
const MIN_OVERFLOW_PX = 4;

type Props = {
  text: string;
  className?: string;
};

export default function MarqueeText({ text, className = "" }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  /** Metnin kaç piksel taştığı. 0 ise sığıyor demektir. */
  const [overflow, setOverflow] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    const node = textRef.current;
    if (!viewport || !node) return;

    const measure = () => {
      const hidden = node.scrollWidth - viewport.clientWidth;
      setOverflow(hidden > MIN_OVERFLOW_PX ? hidden : 0);
    };

    measure();

    // Yazı tipi geç yüklenebiliyor ve kart genişliği ekranla değişiyor;
    // ölçümü tek seferlik yapmak yanlış sonuç veriyor.
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  // Sabit hız: uzun başlık uzun sürer, kısa taşma çabuk biter.
  const duration = overflow
    ? Math.max(5, (2 * overflow) / SPEED_PX_PER_SEC / MOVING_RATIO)
    : 0;

  return (
    <div
      ref={viewportRef}
      className={`marquee relative overflow-hidden ${className}`}
      style={
        overflow
          ? ({
              "--marquee-shift": `-${overflow}px`,
              "--marquee-duration": `${duration}s`,
            } as React.CSSProperties)
          : undefined
      }
      title={text}
    >
      <span
        ref={textRef}
        // Taşmıyorsa eski davranış: tek satır, üç nokta.
        className={overflow ? "marquee-track block w-max" : "block truncate"}
      >
        {text}
      </span>

      {overflow > 0 && (
        <>
          <span aria-hidden className="marquee-fade marquee-fade-start" />
          <span aria-hidden className="marquee-fade marquee-fade-end" />
        </>
      )}
    </div>
  );
}
