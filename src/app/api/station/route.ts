import { NextResponse } from "next/server";

import { getStation } from "@/lib/station";

/**
 * Yayının güncel hâli. Açık sayfalar bunu düzenli olarak yoklayıp playlist
 * değiştiğinde kendini yeniler — dinleyicinin sayfayı yenilemesi gerekmez.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const station = await getStation();

  return NextResponse.json(
    { now: Date.now(), station },
    {
      headers: {
        "cache-control": "no-store, max-age=0",
        /*
         * Başka origin'lerden okunabilsin: tanıtım sayfası, bir blog yazısı ya
         * da bir Discord botu "şu an ne çalıyor" gösterebilsin diye.
         *
         * Yeni bir şey ifşa etmiyor — aynı veri zaten sayfanın kendisinde
         * herkese açık olarak render ediliyor. Uç nokta salt okunur ve
         * kimlik doğrulama taşımıyor, dolayısıyla `*` burada güvenli.
         *
         * Yanıtla birlikte dönen `now` alanı sayesinde okuyan taraf kendi
         * saatinin sapmasını düzeltebiliyor; parça listesini bir kez alıp
         * konumu yerelde hesaplamak yeterli oluyor.
         */
        "access-control-allow-origin": "*",
      },
    },
  );
}
