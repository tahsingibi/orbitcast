"use client";

import { useNativeDialog } from "@/hooks/useNativeDialog";
import { useT } from "@/lib/i18n/context";
import { format } from "@/lib/i18n/format";
import { site } from "@/lib/site";
import Link from "next/link";

type Props = {
  open: boolean;
  onClose: () => void;
  stationName: string;
};

/**
 * Telif bildirimi ve iletişim penceresi.
 *
 * Native <dialog> kullanılıyor: odak tuzağı, Esc ile kapanma ve arka plan
 * inertliği tarayıcıdan geliyor — kendi implementasyonumuzu yazmıyoruz.
 */
export default function InfoDialog({ open, onClose, stationName }: Props) {
  const t = useT();
  const ref = useNativeDialog(open, onClose);

  return (
    <dialog
      ref={ref}
      // Backdrop'a tıklayınca kapat: tıklama hedefi dialog'un kendisiyse
      // basılan yer içerik kutusunun dışı demektir.
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2.5rem))] rounded-2xl border border-white/10 bg-neutral-900 p-0 text-neutral-200 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div className="max-h-[80dvh] overflow-y-auto p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-sm font-semibold tracking-[0.2em] text-neutral-100">
            {t.info.title}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t.info.close}
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-white/5 hover:text-neutral-200"
          >
            ×
          </button>
        </div>

        <div className="mt-5 space-y-5 text-sm leading-relaxed text-neutral-400">
          <section>
            <h3 className="text-xs font-medium tracking-[0.15em] text-neutral-300">
              {t.info.howHeading}
            </h3>
            <p className="mt-2">
              {format(t.info.howBody, { station: stationName })}{" "}
              <strong className="font-medium text-neutral-300">
                {t.info.howApi}
              </strong>
              {t.info.howBodyRest}
            </p>
          </section>

          <section>
            <h3 className="text-xs font-medium tracking-[0.15em] text-neutral-300">
              {t.info.copyrightHeading}
            </h3>
            <p className="mt-2">
              {t.info.copyrightLead}{" "}
              <strong className="font-medium text-neutral-300">
                {t.info.copyrightEmphasis}
              </strong>
              {t.info.copyrightRest}
            </p>
            <p className="mt-2">{t.info.copyrightOwners}</p>
          </section>

          <section>
            <h3 className="text-xs font-medium tracking-[0.15em] text-neutral-300">
              {t.info.takedownHeading}
            </h3>
            <p className="mt-2">
              {t.info.takedownBody}{" "}
              <strong className="font-medium text-neutral-300">
                {t.info.takedownEmphasis}
              </strong>{" "}
              {t.info.takedownRest}
            </p>
            <Link
              href={`mailto:${site.contactEmail}?subject=${encodeURIComponent(
                format(t.info.takedownSubject, { station: stationName }),
              )}`}
              className="mt-3 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-neutral-200 transition hover:border-white/25"
            >
              {site.contactEmail}
            </Link>
          </section>
          <hr className="border-neutral-700"/>
          <section>
            <h3 className="text-xs font-medium tracking-[0.15em] text-neutral-300">
              {t.info.creditsHeading}
            </h3>
            <p className="mt-2">
              {format(t.info.creditsBody, { author: site.author.name })}
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={site.author.url}
                target="_blank"
                rel="noreferrer"
                className="text-neutral-300 underline decoration-white/15 underline-offset-4 transition hover:decoration-white/40"
              >
                {site.author.name}
              </Link>
              {/* Hesaplar diziden geliyor: yeni bir hesap eklemek site.ts'e
                  bir satır eklemek demek, burada değişiklik gerekmiyor. */}
              {site.socials.map((social) => (
                <Link
                  key={social.url}
                  href={social.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neutral-300 underline decoration-white/15 underline-offset-4 transition hover:decoration-white/40"
                >
                  {social.label}
                </Link>
              ))}
              <Link
                href={site.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-neutral-300 underline decoration-white/15 underline-offset-4 transition hover:decoration-white/40"
              >
                {t.info.creditsRepo}
              </Link>
            </p>
          </section>

          {/* Bağış adresi boşsa bölüm hiç çizilmiyor: fork'lar istemedikleri
              hâlde bir bağış düğmesi yayınlamak zorunda kalmasın. */}
          {site.supportUrl && (
            <section>
              <h3 className="text-xs font-medium tracking-[0.15em] text-neutral-300">
                {t.info.supportHeading}
              </h3>
              <p className="mt-2">{t.info.supportBody}</p>
              <Link
                href={site.supportUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-neutral-200 transition hover:border-white/25"
              >
                {t.info.supportCta}
              </Link>
            </section>
          )}
        </div>
      </div>
    </dialog>
  );
}
