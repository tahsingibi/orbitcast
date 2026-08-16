import { ImageResponse } from "next/og";

import { baseUrl } from "@/lib/site";
import { getStation } from "@/lib/station";

// İstasyon adı panelden değişebildiği için kart derleme anında dondurulmamalı.
export const dynamic = "force-dynamic";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Not: alt metni dile göre değişmiyor — bu fonksiyon derleme anında
// çalıştığı için çerezden dil okunamıyor, kazancı da ihmal edilebilir.
export const alt = "Synchronised radio broadcast";

/**
 * Ana sayfanın paylaşım kartı.
 *
 * Bilinçli olarak parçadan bağımsız: X kartları adres başına önbelleğe
 * alındığı için "/" adresine şarkı koymak, ilk taranan şarkının bütün
 * paylaşımlarda donup kalması demek olurdu. Parçaya özel kart /p/[videoId]
 * adresinde üretiliyor.
 */
export default async function OpengraphImage() {
  const station = await getStation();
  const host = baseUrl().host;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          color: "#f5f5f5",
        }}
      >
        {/* Uygulama ikonuyla aynı motif */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 132,
            height: 132,
            borderRadius: 999,
            background: "#f5f5f5",
          }}
        >
          {/* Satori, CSS border üçgenini desteklemiyor; SVG kullanılıyor. */}
          <svg width="58" height="66" viewBox="0 0 58 66" style={{ marginLeft: 12 }}>
            <path d="M0 3.5v59a3.5 3.5 0 0 0 5.4 2.9l50-29.5a3.5 3.5 0 0 0 0-5.8l-50-29.5A3.5 3.5 0 0 0 0 3.5Z" fill="#0a0a0a" />
          </svg>
        </div>

        <div style={{ marginTop: 48, fontSize: 76, fontWeight: 600, letterSpacing: -1 }}>
          {station.name}
        </div>

        <div style={{ marginTop: 18, fontSize: 32, color: "#a3a3a3" }}>{station.tagline}</div>

        <div style={{ marginTop: 44, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, background: "#ef4444" }} />
          <div
            style={{
              fontSize: 24,
              letterSpacing: 5,
              color: "#737373",
              textTransform: "uppercase",
            }}
          >
            {station.shareTagline}
          </div>
        </div>

        <div style={{ marginTop: 56, fontSize: 26, color: "#525252" }}>{host}</div>
      </div>
    ),
    size,
  );
}
