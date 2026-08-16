"use client";

import { useEffect, useRef, useState } from "react";

import { useT } from "@/lib/i18n/context";
import { format } from "@/lib/i18n/format";
import type { Station, Track } from "@/lib/radio";

/**
 * Paylaşım menüsü.
 *
 * İki hedef var ve ikisi bambaşka çalışıyor:
 *
 *   X         — bağlantı paylaşımı. Adres `/p/<id>` olduğu için X kendi
 *               önizleme kartını çekiyor.
 *   Instagram — story'ye bağlantı değil *görsel* gidiyor. Web'de "story'ye
 *               gönder" diye bir arayüz de yok; yapabileceğimiz en iyi şey
 *               1080x1920 kartı üretip cihazın paylaşım sayfasına dosya olarak
 *               vermek. Kullanıcı oradan Instagram'ı seçiyor.
 *
 * İkonları yan yana dizmek başlık satırını daralttığı için tek düğme +
 * açılır liste tercih edildi.
 */

type Props = { station: Station; track: Track };

export default function ShareMenu({ station, track }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Dışarı tıklama ve Esc ile kapansın.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const shareUrl = () => `${window.location.origin}/p/${track.videoId}`;

  function shareOnX() {
    const text = format(t.player.shareText, {
      station: station.name,
      title: track.title,
      artist: track.artist,
    });
    window.open(
      `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(shareUrl())}`,
      "_blank",
      "noopener,noreferrer",
    );
    setOpen(false);
  }

  /**
   * Story kartını cihazın paylaşım sayfasına verir.
   *
   * `navigator.share` yalnızca mobilde ve güvenli bağlamda çalışıyor; masaüstünde
   * kartı yeni sekmede açıyoruz ki kullanıcı kaydedebilsin.
   */
  async function shareStory() {
    setBusy(true);
    try {
      const endpoint = `/p/${track.videoId}/story`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("story");

      const blob = await res.blob();
      const file = new File([blob], `${track.videoId}.png`, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            text: format(t.player.shareText, {
              station: station.name,
              title: track.title,
              artist: track.artist,
            }),
          });
          return;
        } catch (err) {
          // Kullanıcı vazgeçtiyse iş bitti. Ama masaüstünde `canShare` true
          // deyip `share` reddedebiliyor; o durumda düğme hiçbir şey yapmamış
          // gibi görünmesin diye kartı açıyoruz.
          if ((err as Error).name === "AbortError") return;
        }
      }

      window.open(endpoint, "_blank", "noopener,noreferrer");
    } catch {
      // Kart üretilemedi (ağ hatası). Sessiz geçmek doğru: yayın sürüyor.
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative mb-1 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={format(t.player.share, { track: `${track.artist} — ${track.title}` })}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-neutral-400 transition hover:border-white/25 hover:text-neutral-100"
      >
        <ShareIcon />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-lg border border-white/10 bg-neutral-900 py-1 shadow-xl shadow-black/50"
        >
          <MenuItem onClick={shareOnX} icon={<XIcon />} label={t.player.shareOnXLabel} />
          <MenuItem
            onClick={shareStory}
            disabled={busy}
            icon={<InstagramIcon />}
            label={busy ? t.player.sharePreparing : t.player.shareOnInstagram}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  label,
  disabled,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-neutral-300 transition hover:bg-white/5 disabled:opacity-50"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400">
        {icon}
      </span>
      {label}
    </button>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" strokeLinecap="round" />
      <path d="M12 15V3m0 0L8 7m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
      <path d="M18.9 2H22l-7.1 8.1L23 22h-6.8l-5.3-6.9L4.8 22H1.7l7.6-8.7L1 2h6.9l4.8 6.4L18.9 2Zm-1.1 18h1.7L7.3 3.8H5.5L17.8 20Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
