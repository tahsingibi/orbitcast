"use client";

import { useEffect } from "react";

/**
 * Service worker'ı yalnızca üretimde kaydeder.
 *
 * Geliştirmede kaydedilmez: HMR ile çakışır ve hata ayıklarken bayat varlık
 * servis edilmesine yol açar.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Kayıt başarısız olursa uygulama normal web sayfası olarak çalışmaya devam eder.
    });
  }, []);

  return null;
}
