"use client";

import { useTransition } from "react";

import { LOCALE_LABELS, LOCALES } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/context";
import { isLocale } from "@/lib/i18n/config";
import { setLocale } from "@/lib/i18n/actions";

/**
 * Dil değiştirici.
 *
 * Tercih bir server action ile çereze yazılır ve sayfa sunucudan yeniden
 * render edilir; böylece metinler tek bir yerde (sunucuda çözülen sözlük)
 * kalır ve istemciye iki dil birden gönderilmez.
 *
 * Neden native `<select>`: dilleri yan yana düğme olarak dizmek her yeni dilde
 * alt satırı biraz daha şişiriyordu. Kendi açılır menümüzü yazmak yerine
 * tarayıcınınkini kullanıyoruz — klavye gezinme, mobilde yerel seçici ve
 * erişilebilirlik bedavaya geliyor. Görünen genişlik seçili dilin kodu kadar;
 * `<select>` saydam ve üstte, altındaki metin de gerçek genişliği belirliyor.
 */
export default function LanguageSwitch() {
  const { locale, t } = useI18n();
  const [pending, startTransition] = useTransition();

  return (
    <span
      className={`border-l border-l-neutral-800 pl-3 relative inline-flex items-center gap-1 text-neutral-500 transition hover:text-neutral-300 ${
        pending ? "opacity-50" : ""
      }`}
    >
      <span aria-hidden className="uppercase">
        {locale}
      </span>
      <ChevronIcon />

      <select
        value={locale}
        disabled={pending}
        aria-label={t.language.label}
        onChange={(e) => {
          const next = e.target.value;
          if (isLocale(next) && next !== locale) startTransition(() => setLocale(next));
        }}
        // Görsel olarak gizli ama tıklanabilir: kutunun kendisi üstte duruyor,
        // altındaki metin görünümü sağlıyor.
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABELS[code]}
          </option>
        ))}
      </select>
    </span>
  );
}

function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="h-2.5 w-2.5"
    >
      <path d="M3 4.5 6 7.5 9 4.5" />
    </svg>
  );
}
