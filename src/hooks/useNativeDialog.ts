"use client";

import { useEffect, useRef } from "react";

/**
 * `open` durumunu native <dialog> ile eşitler.
 *
 * Pencerenin kapandığını `close` olayından öğrenmiyoruz: bazı ortamlarda bu
 * olay hiç tetiklenmiyor ve o zaman üst bileşenin durumu `true` takılı kalıp
 * pencere **bir daha hiç açılmıyor** (durum değişmediği için efekt yeniden
 * çalışmıyor). Bunun yerine `open` niteliği MutationObserver ile izleniyor —
 * bu, kapanma hangi yolla olursa olsun (Esc, close(), backdrop, form) çalışır
 * ve hiçbir olayın tetiklenmesine bağlı değildir.
 */
export function useNativeDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    // MutationObserver geri çağrısı mikrogörev olarak çalışır; render sırasında
    // durum güncellemesi yapılmadığı için zincirleme render sorunu doğmaz.
    const observer = new MutationObserver(() => {
      if (!dialog.open) onCloseRef.current();
    });

    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return ref;
}
