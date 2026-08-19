import Link from "next/link";

import LanguageSwitch from "@/components/LanguageSwitch";
import { useT } from "@/lib/i18n/context";
import { site } from "@/lib/site";

/**
 * Alt satır: dil, akış, hakkında ve "neyle yapıldı" rozeti.
 *
 * Künye burada değil, "Hakkında" penceresinde — satır okunur kalsın diye
 * yalnızca dört giriş tutuluyor.
 */
export default function PlayerFooter({
  onOpenQueue,
  onOpenInfo,
}: {
  onOpenQueue: () => void;
  onOpenInfo: () => void;
}) {
  const t = useT();

  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-neutral-600">
      <Link
        href={site.repoUrl}
        target="_blank"
        rel="noreferrer"
        title={t.player.poweredByTitle}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium tracking-wide text-neutral-400 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-neutral-200"
      >
        Powered by
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-emerald-400/80"
        />
        {t.player.poweredBy}
      </Link>
      <span className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenQueue}
          className="text-neutral-500 underline decoration-white/15 underline-offset-4 transition hover:text-neutral-300 hover:decoration-white/40"
        >
          {t.player.queueLink}
        </button>
        <button
          type="button"
          onClick={onOpenInfo}
          className="text-neutral-500 underline decoration-white/15 underline-offset-4 transition hover:text-neutral-300 hover:decoration-white/40"
        >
          {t.player.infoLink}
        </button>
        <LanguageSwitch />
      </span>
    </footer>
  );
}
