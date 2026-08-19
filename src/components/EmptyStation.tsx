"use client";

import Link from "next/link";

import { useT } from "@/lib/i18n/context";
import { site } from "@/lib/site";

type Props = {
  name: string;
  /**
   * Kurulum ipucunu göster.
   *
   * Yeni klonlanmış bir repoda görülen ilk ekran burası olduğu için yalnızca
   * geliştirme ortamında sonraki adımı söylüyoruz; yayındaki bir siteyi ziyaret
   * eden dinleyicinin terminal komutuyla işi yok.
   */
  showSetupHint?: boolean;
};

/** Playlist boşken gösterilen durum. */
export default function EmptyStation({ name, showSetupHint = false }: Props) {
  const t = useT();

  return (
    <main className="flex h-full items-center justify-center overflow-hidden px-5 py-10 text-center">
      <div className="max-w-xs">
        <h1 className="text-sm font-semibold tracking-[0.2em] text-neutral-200">
          {name}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">
          {t.empty.body}
        </p>
        <Link
          href="/admin"
          className="mt-5 inline-block rounded-lg border border-white/10 px-3 py-2 text-xs text-neutral-300 transition hover:border-white/25"
        >
          {t.empty.adminLink}
        </Link>

        {showSetupHint && (
          <p className="mt-5 text-xs leading-relaxed text-neutral-600">
            {t.empty.setupHint}{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-neutral-400">
              npm run radio:setup
            </code>
          </p>
        )}
        {/* Künye şablon hâlindeyken (kurulum öncesi) boş bir bağlantı
            kalmasın: href="" geçerli bir adres değil ve satır anlamsız. */}
        {site.author.name && (
          <p className="mt-8 text-[11px] text-neutral-700">
            {site.author.url ? (
              <Link
                href={site.author.url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-neutral-500"
              >
                {site.author.name}
              </Link>
            ) : (
              site.author.name
            )}
          </p>
        )}
      </div>
    </main>
  );
}
