"use client";

import { useTransition } from "react";

import { LOCALE_LABELS, LOCALES } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/context";
import { format } from "@/lib/i18n/format";
import { setLocale } from "@/lib/i18n/actions";

/**
 * Dil değiştirici.
 *
 * Tercih bir server action ile çereze yazılır ve sayfa sunucudan yeniden
 * render edilir; böylece metinler tek bir yerde (sunucuda çözülen sözlük)
 * kalır ve istemciye iki dil birden gönderilmez.
 */
export default function LanguageSwitch() {
  const { locale, t } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <span className={`inline-flex items-center gap-1.5 ${pending ? "opacity-50" : ""}`}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          disabled={pending || code === locale}
          onClick={() => startTransition(() => setLocale(code))}
          aria-label={format(t.language.switchTo, { name: LOCALE_LABELS[code] })}
          aria-current={code === locale}
          className={`uppercase transition ${
            code === locale ? "text-neutral-400" : "text-neutral-600 hover:text-neutral-300"
          }`}
        >
          {code}
        </button>
      ))}
    </span>
  );
}
