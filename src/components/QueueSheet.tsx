"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import CoverArt from "@/components/CoverArt";
import { useNativeDialog } from "@/hooks/useNativeDialog";
import { useScrollFade } from "@/hooks/useScrollFade";
import { useT } from "@/lib/i18n/context";
import { format } from "@/lib/i18n/format";

import {
  formatClock,
  resolveQueue,
  type QueueEntry,
  type Track,
  type RadioState,
  type Station,
} from "@/lib/radio";

/** Şimdiden geriye ve ileriye kaç parça gösterilecek. */
const PAST_COUNT = 4;
const FUTURE_COUNT = 5;

/** Bu mesafeyi aşan sürükleme bırakıldığında sayfa kapanır. */
const CLOSE_DISTANCE_PX = 96;
/** Hızlı bir savurma, mesafe kısa olsa da kapatır (px/ms). */
const CLOSE_VELOCITY = 0.55;
/** Sürükleme bırakıldığında yerine oturma süresi. */
const SPRING_MS = 200;

type Props = {
  open: boolean;
  onClose: () => void;
  station: Station;
  state: RadioState;
};

type Gesture = {
  startY: number;
  lastY: number;
  lastAt: number;
  velocity: number;
  /** Sürükleme bu temasta serbest mi? (tutamaçtan başladı ya da liste tepede) */
  allowed: boolean;
};

/**
 * Yayın akışı: az önce çalanlar, şu an çalan ve sıradakiler.
 *
 * Satırlar bilinçli olarak tıklanamaz — radyo mantığında dinleyici listede
 * gezinemez, yalnızca akışı görür.
 *
 * Aşağıdan açılan sayfa native <dialog> üzerine kuruldu (odak tuzağı, Esc,
 * top-layer bedava gelir) ve üstüne gerçek bir sürükle-kapat jesti eklendi:
 * tutamaçtan veya liste en tepedeyken aşağı çekilince sayfa parmağı takip eder,
 * yeterince uzağa ya da hızlı çekilirse kapanır, yetmezse geri yerine oturur.
 */
export default function QueueSheet({ open, onClose, station, state }: Props) {
  const t = useT();

  // Kaydırma çubuğu gizli; kaydırılabilir yön kenarlardaki solma efektiyle
  // bildiriliyor. Sürükle-kapat jesti de bu viewport'un konumunu okuyor.
  const { viewportRef, topRef, bottomRef, fade } = useScrollFade();
  const handleRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  // Jestin bitişi window seviyesinden de gelebildiği için mesafe ve durum
  // ref'te de tutuluyor: oradaki dinleyici bayat closure okumasın.
  const dragYRef = useRef(0);
  const draggingRef = useRef(false);

  const applyDrag = (value: number) => {
    dragYRef.current = value;
    setDragY(value);
  };

  /**
   * Tek kapanma yolu. Sürükleme durumu burada sıfırlanır, ardından üst duruma
   * haber verilir; dialog'u asıl kapatan `useNativeDialog` eşitleme efektidir.
   *
   * Kapanışı zamanlayıcıyla geciktiren bir animasyon durumu denendi ve
   * bırakıldı: efekt bağımlılıkları değiştikçe zamanlayıcı yeniden kuruluyor,
   * pencere kimi yolda hiç kapanmıyor ya da kapanıp bir daha açılmıyordu.
   */
  const requestClose = useCallback(() => {
    dragYRef.current = 0;
    draggingRef.current = false;
    setDragY(0);
    setDragging(false);
    onClose();
  }, [onClose]);

  // Esc ile native kapanışta da durum senkronda kalsın.
  const ref = useNativeDialog(open, requestClose);

  const { past, future } = resolveQueue(station, state, PAST_COUNT, FUTURE_COUNT);

  function handlePointerDown(event: React.PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const fromHandle = handleRef.current?.contains(event.target as Node) ?? false;
    const listAtTop = (viewportRef.current?.scrollTop ?? 0) <= 0;

    gestureRef.current = {
      startY: event.clientY,
      lastY: event.clientY,
      lastAt: event.timeStamp,
      velocity: 0,
      allowed: fromHandle || listAtTop,
    };
  }

  function handlePointerMove(event: React.PointerEvent) {
    const gesture = gestureRef.current;
    if (!gesture || !gesture.allowed) return;

    const elapsed = event.timeStamp - gesture.lastAt;
    if (elapsed > 0) gesture.velocity = (event.clientY - gesture.lastY) / elapsed;
    gesture.lastY = event.clientY;
    gesture.lastAt = event.timeStamp;

    const distance = event.clientY - gesture.startY;

    // Yukarı çekmek sayfayı büyütmez; liste normal şekilde kaydırılabilir kalır.
    if (distance <= 0) {
      if (dragYRef.current !== 0) applyDrag(0);
      return;
    }

    if (!draggingRef.current) {
      // Küçük titremeleri jest saymayalım.
      if (distance < 4) return;
      draggingRef.current = true;
      setDragging(true);
      try {
        // Parmak sayfanın dışına taşsa da jest bize akmaya devam etsin.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Yakalanamayan pointer'da jest yine de çalışır.
      }
    }

    applyDrag(distance);
  }

  const handlePointerEnd = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;

    if (!draggingRef.current) {
      if (dragYRef.current !== 0) applyDrag(0);
      return;
    }

    draggingRef.current = false;
    setDragging(false);

    const distance = dragYRef.current;
    const flung = distance > 32 && (gesture?.velocity ?? 0) > CLOSE_VELOCITY;

    if (distance > CLOSE_DISTANCE_PX || flung) requestClose();
    else applyDrag(0);
  }, [requestClose]);

  /**
   * Emniyet ağı: pointerup sayfaya hiç ulaşmayabilir (parmak pencere dışında
   * kalkar, bağlam menüsü açılır, jest iptal edilir). Bu olmadan sayfa yarı
   * yolda takılı kalırdı.
   */
  useEffect(() => {
    if (!dragging) return;

    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [dragging, handlePointerEnd]);

  return (
    <dialog
      ref={ref}
      onClick={(e) => {
        if (e.target === ref.current) requestClose();
      }}
      className="sheet mx-auto mb-0 mt-auto w-full max-w-sm rounded-t-2xl border border-white/10 bg-neutral-900 p-0 text-neutral-200 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      style={{
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragging ? "none" : `transform ${SPRING_MS}ms cubic-bezier(0.32,0.72,0,1)`,
      }}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        className={`flex max-h-[78dvh] flex-col ${dragging ? "select-none" : ""}`}
      >
        {/*
          Sürükleme bölgesi. touch-action:none olmadan tarayıcı jesti kaydırma
          sanıp devralır; burada kaydırılacak bir şey olmadığı için sorun yok.
        */}
        <div ref={handleRef} className="shrink-0 cursor-grab touch-none active:cursor-grabbing">
          <div className="flex justify-center pt-2.5">
            <span
              aria-hidden
              className={`h-1 w-9 rounded-full transition-colors ${
                dragging ? "bg-white/40" : "bg-white/15"
              }`}
            />
          </div>

          <div className="flex items-center justify-between gap-4 px-5 pb-3 pt-3">
            <h2 className="text-sm font-semibold tracking-[0.2em] text-neutral-100">
              {t.queue.title}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              aria-label={t.queue.close}
              className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
            >
              ×
            </button>
          </div>
        </div>

        {/*
          Kaydıran kutu `flex-1 min-h-0` ile boyutlanıyor, `h-full` ile değil:
          yüzde yükseklik, üstündeki esnek kutunun belirsiz yüksekliğine karşı
          çözülemiyor ve kutu kaydırmak yerine taşıyor.
        */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={viewportRef}
            className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6"
          >
            <div ref={topRef} aria-hidden className="h-px" />
          {past.length > 0 && (
            <section>
              <SectionLabel>{t.queue.played}</SectionLabel>
              <ul>
                {/* Eskiden yeniye: göz akışı yukarıdan aşağıya zamanı takip etsin */}
                {[...past].reverse().map((entry) => (
                  <QueueRow key={`past-${entry.index}`} entry={entry} direction="past" />
                ))}
              </ul>
            </section>
          )}

          <section className="mt-4">
            <SectionLabel accent>{t.queue.nowPlaying}</SectionLabel>
            <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-2">
              <Cover track={state.track} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-100">
                  {state.track.title}
                </p>
                <p className="truncate text-xs text-neutral-500">{state.track.artist}</p>
              </div>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-500">
                {formatClock(state.offsetSec)} / {formatClock(state.track.durationSec)}
              </span>
            </div>
          </section>

          {future.length > 0 && (
            <section className="mt-4">
              <SectionLabel>{t.queue.upNext}</SectionLabel>
              <ul>
                {future.map((entry) => (
                  <QueueRow key={`future-${entry.index}`} entry={entry} direction="future" />
                ))}
              </ul>
            </section>
          )}

            <div ref={bottomRef} aria-hidden className="h-px" />
          </div>

          {/*
            Kaydırılabilir yönü bildiren solma efekti. Sayfanın zemini
            neutral-900 olduğu için gradyan oradan başlıyor.
          */}
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-neutral-900 to-transparent transition-opacity duration-200 ${
              fade.top ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-neutral-900 to-transparent transition-opacity duration-200 ${
              fade.bottom ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      </div>
    </dialog>
  );
}

function SectionLabel({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <p
      className={`mb-1.5 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.18em] ${
        accent ? "text-neutral-400" : "text-neutral-600"
      }`}
    >
      {accent && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
      {children}
    </p>
  );
}

function QueueRow({ entry, direction }: { entry: QueueEntry; direction: "past" | "future" }) {
  const t = useT();

  return (
    <li className="flex items-center gap-3 py-1.5">
      <Cover track={entry.track} dim />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-neutral-300">{entry.track.title}</p>
        <p className="truncate text-xs text-neutral-600">{entry.track.artist}</p>
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-neutral-600">
        {formatRelative(t, entry.secondsAway, direction)}
      </span>
    </li>
  );
}

function Cover({ track, dim }: { track: Track; dim?: boolean }) {
  return (
    <CoverArt
      track={track}
      width={40}
      height={40}
      className={`h-10 w-10 shrink-0 rounded-md object-cover ${dim ? "opacity-60" : ""}`}
    />
  );
}

function formatRelative(
  t: ReturnType<typeof useT>,
  seconds: number,
  direction: "past" | "future",
): string {
  if (direction === "past") {
    return seconds < 90
      ? t.queue.justPlayed
      : format(t.queue.minutesAgo, { minutes: Math.round(seconds / 60) });
  }
  return seconds < 60
    ? t.queue.startingSoon
    : format(t.queue.minutesLater, { minutes: Math.round(seconds / 60) });
}
