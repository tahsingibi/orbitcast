import { ImageResponse } from "next/og";

import { baseUrl } from "@/lib/site";
import { getStation } from "@/lib/station";

/**
 * Instagram story kartı — 1080x1920.
 *
 * X'ten farkı biçim değil, *yöntem*: X bir bağlantıyı önizlemeye çeviriyor,
 * Instagram story'sine ise bağlantı değil görsel gidiyor. Bu yüzden dikey bir
 * kart üretip paylaşım sayfasına dosya olarak veriyoruz.
 *
 * OpenGraph kartıyla aynı görsel dili kullanıyor ama düzeni dikey: kapak
 * üstte kare, metin altta, en altta alan adı.
 */
export const dynamic = "force-dynamic";

const SIZE = { width: 1080, height: 1920 };

type Props = { params: Promise<{ videoId: string }> };

export async function GET(_request: Request, { params }: Props) {
  const { videoId } = await params;
  const station = await getStation();
  const track =
    station.tracks.find((t) => t.videoId === videoId) ?? station.tracks[0];

  if (!track) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0a",
            color: "#f5f5f5",
            fontSize: 72,
          }}
        >
          {station.name}
        </div>
      ),
      SIZE,
    );
  }

  // Yerel parçaların kapağı göreli bir yol; kart sunucuda çizildiği için
  // mutlak adrese çevriliyor.
  const cover = new URL(track.thumbnail, baseUrl()).href;
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
          padding: "0 90px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 20, height: 20, borderRadius: 999, background: "#ef4444" }} />
          <div
            style={{
              fontSize: 34,
              letterSpacing: 10,
              color: "#a3a3a3",
              textTransform: "uppercase",
            }}
          >
            {station.name}
          </div>
        </div>

        {/* Satori next/image'ı çalıştırmıyor; kart sunucuda çizildiği için
            düz <img> tek seçenek. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt=""
          width={900}
          height={900}
          style={{
            width: 900,
            height: 900,
            objectFit: "cover",
            borderRadius: 40,
            marginTop: 90,
          }}
        />

        <div
          style={{
            marginTop: 90,
            fontSize: 82,
            lineHeight: 1.15,
            fontWeight: 600,
            textAlign: "center",
            // Uzun başlıklar kartı taşırmasın.
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {track.title}
        </div>

        <div style={{ marginTop: 28, fontSize: 46, color: "#a3a3a3" }}>{track.artist}</div>

        <div style={{ marginTop: 110, fontSize: 32, color: "#737373", textAlign: "center" }}>
          {station.shareTagline}
        </div>
        <div style={{ marginTop: 18, fontSize: 32, color: "#525252" }}>{host}</div>
      </div>
    ),
    SIZE,
  );
}
