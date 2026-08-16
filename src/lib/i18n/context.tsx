"use client";

import { createContext, useContext } from "react";

import type { Locale } from "./config";
import type { Dictionary } from "./index";

type I18nValue = { locale: Locale; t: Dictionary };

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Sözlüğü istemci bileşenlerine taşır.
 *
 * Sunucu tarafında çözülen sözlük prop olarak veriliyor; böylece istemcide
 * dil tespiti veya ikinci bir istek gerekmiyor ve ilk render doğru dille gelir.
 */
export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ locale, t: dictionary }}>{children}</I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n, I18nProvider içinde çağrılmalı.");
  return value;
}

/** Kısa kullanım: `const t = useT();` */
export function useT(): Dictionary {
  return useI18n().t;
}
