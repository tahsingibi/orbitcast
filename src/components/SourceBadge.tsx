"use client";

import { useEffect, useRef, useState } from "react";

import { useT } from "@/lib/i18n/context";
import { isPrimarySource, type PlaylistSource } from "@/lib/radio";

type Props = {
  source: PlaylistSource;
  /** Oynatma sürüyorsa nokta nabız atar. */
  active: boolean;
};



/**
 * Yayın kaynağı rozeti ve açıklaması.
 *
 * Native `title` niteliği dokunmatik cihazlarda hiç görünmediği için açıklama
 * tıklanabilir küçük bir kutucukla veriliyor; masaüstünde üzerine gelince de
 * açılır.
 */
export default function SourceBadge({ source, active }: Props) {
  // Fare ile üzerine gelmek geçici olarak gösterir; tıklamak sabitler.
  // İkisi ayrı tutulmazsa fare tıklamasında "hover açar, click kapatır"
  // çakışması yaşanır ve kutucuk hiç görünmez.
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const open = pinned || hovered;

  const t = useT();
  const live = isPrimarySource(source);
  const copy = {
    label: live ? t.source.liveLabel : t.source.backupLabel,
    title: live
      ? t.source.liveTitle
      : source === "fallback"
        ? t.source.fallbackTitle
        : t.source.pinnedTitle,
    body: live
      ? t.source.liveBody
      : source === "fallback"
        ? t.source.fallbackBody
        : t.source.pinnedBody,
  };

  // Dışarı tıklama ve Esc ile kapansın.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setPinned(false);
      setHovered(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinned(false);
        setHovered(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className="relative shrink-0"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setHovered(false);
      }}
    >
      <button
        type="button"
        onClick={() => setPinned((value) => !value)}
        aria-expanded={open}
        aria-label={`${copy.title}: ${copy.body}`}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[0.15em] transition ${
          live
            ? "border-red-500/30 bg-red-500/10 text-red-400 hover:border-red-500/50"
            : "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:border-amber-500/50"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${live ? "bg-red-500" : "bg-amber-500"} ${
            active ? "animate-pulse" : "opacity-50"
          }`}
        />
        {copy.label}
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-white/10 bg-neutral-900 p-3 text-left shadow-xl shadow-black/50"
        >
          <p className="text-[11px] font-semibold tracking-wide text-neutral-200">
            {copy.title}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">{copy.body}</p>
        </div>
      )}
    </div>
  );
}
