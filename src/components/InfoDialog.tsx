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
  /**
   * Yayında kendi ses dosyalarımız var mı?
   *
   * Metin buna göre değişmek zorunda: varsayılan bildirim "hiçbir ses dosyası
   * barındırılmaz" diyor ve YouTube'dan yayın yapan bir istasyonda bu doğru.
   * Kendi mp3'lerini servis eden bir kurulumda ise **yanlış** olurdu — üstelik
   * hak sahiplerine gösterilen bir beyan olduğu için yanlış olması ciddi.
   */
  selfHosted: boolean;
};

/**
 * Telif bildirimi ve iletişim penceresi.
 *
 * Native <dialog> kullanılıyor: odak tuzağı, Esc ile kapanma ve arka plan
 * inertliği tarayıcıdan geliyor — kendi implementasyonumuzu yazmıyoruz.
 */
export default function InfoDialog({ open, onClose, stationName, selfHosted }: Props) {
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
            {selfHosted ? (
              <p className="mt-2">
                {format(t.info.howBodySelfHosted, { station: stationName })}
              </p>
            ) : (
              <p className="mt-2">
                {format(t.info.howBody, { station: stationName })}{" "}
                <strong className="font-medium text-neutral-300">
                  {t.info.howApi}
                </strong>
                {t.info.howBodyRest}
              </p>
            )}
          </section>

          <section>
            <h3 className="text-xs font-medium tracking-[0.15em] text-neutral-300">
              {t.info.copyrightHeading}
            </h3>
            {selfHosted ? (
              <p className="mt-2">{t.info.copyrightSelfHosted}</p>
            ) : (
              <p className="mt-2">
                {t.info.copyrightLead}{" "}
                <strong className="font-medium text-neutral-300">
                  {t.info.copyrightEmphasis}
                </strong>
                {t.info.copyrightRest}
              </p>
            )}
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
              {/*
                Adres metnin *içinde*: hak sahibi bu paragrafı okurken nereye
                yazacağını aynı cümlede görüyor, ayrı bir düğmeye bakmak
                zorunda kalmıyor. Doldurulmamışsa (şablon hâli) hiç yazılmıyor
                — boş bir mailto talebi hiçbir yere göndermez.
              */}
              {site.contactEmail && (
                <>
                  {" "}
                  {t.info.takedownContactLead}{" "}
                  <Link
                    href={`mailto:${site.contactEmail}?subject=${encodeURIComponent(
                      format(t.info.takedownSubject, { station: stationName }),
                    )}`}
                    className="whitespace-nowrap text-neutral-200 underline decoration-white/25 underline-offset-4 transition hover:decoration-white/60"
                  >
                    {site.contactEmail}
                  </Link>
                </>
              )}
            </p>
          </section>
          <hr className="border-neutral-700" />
          <section>
            <h3 className="text-xs font-medium tracking-[0.15em] text-neutral-300">
              {t.info.creditsHeading}
            </h3>
            {site.author.name && (
              <p className="mt-2">
                {/*
                  Şablon `{author}` etrafından bölünüyor: İngilizce "Built by X."
                  derken Türkçe "X tarafından yapıldı." diyor. Tek bir ön ek
                  metni iki dilde de doğru olamazdı.
                */}
                {(() => {
                  const [before, after] = t.info.creditsBody.split("{author}");
                  return (
                    <>
                      {before}
                      {site.author.handle && (
                        <>
                          <Link
                            href={site.socials[0]?.url ?? site.author.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-neutral-300 underline decoration-white/15 underline-offset-4 transition hover:decoration-white/40"
                          >
                            {site.author.handle}
                          </Link>{" "}
                        </>
                      )}
                      <span className="text-neutral-500">
                        (
                        <Link
                          href={site.author.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-white/15 underline-offset-4 transition hover:decoration-white/40"
                        >
                          {site.author.name}
                        </Link>
                        )
                      </span>
                      {after}
                    </>
                  );
                })()}
              </p>
            )}

            {/* Bağlantılar ayrı satırda: üstteki cümle "kim yaptı"yı, bu satır
                "nereye bakılır"ı cevaplıyor. */}
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              {site.stationUrl && (
                <Link
                  href={site.stationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neutral-300 underline decoration-white/15 underline-offset-4 transition hover:decoration-white/40"
                >
                  {site.stationUrl.replace(/^https?:\/\//, "")}
                </Link>
              )}
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
        </div>
      </div>
    </dialog>
  );
}
