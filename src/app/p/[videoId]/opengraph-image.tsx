import { ImageResponse } from "next/og";

import { baseUrl } from "@/lib/site";
import { getStation } from "@/lib/station";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Not: alt metni dile göre değişmiyor — bu fonksiyon derleme anında
// çalıştığı için çerezden dil okunamıyor, kazancı da ihmal edilebilir.
export const alt = "Now playing";

type Props = { params: Promise<{ videoId: string }> };

/** Paylaşımlarda görünen kart: kapak + parça + istasyon. */
export default async function OpengraphImage({ params }: Props) {
  const { videoId } = await params;
  const station = await getStation();
  const host = baseUrl().host;
  const track = station.tracks.find((t) => t.videoId === videoId) ?? station.tracks[0];
  // Yerel parçaların kapağı göreli bir yol ("/audio/covers/…"); kart sunucu
  // tarafında çizildiği için mutlak adrese çevrilmesi gerekiyor.
  const cover = track && new URL(track.thumbnail, baseUrl()).href;

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
            fontSize: 56,
          }}
        >
          {station.name}
        </div>
      ),
      size,
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0a0a0a",
          color: "#f5f5f5",
        }}
      >
        <img
          src={cover}
          alt=""
          width={630}
          height={630}
          style={{ width: 630, height: 630, objectFit: "cover" }}
        />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 56px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: "#ef4444" }} />
            <div
              style={{
                fontSize: 22,
                letterSpacing: 6,
                color: "#a3a3a3",
                textTransform: "uppercase",
              }}
            >
              {station.name}
            </div>
          </div>

          <div style={{ marginTop: 28, fontSize: 64, lineHeight: 1.1, fontWeight: 600 }}>
            {track.title}
          </div>

          <div style={{ marginTop: 16, fontSize: 34, color: "#a3a3a3" }}>{track.artist}</div>

          <div style={{ marginTop: 40, fontSize: 22, color: "#737373" }}>
            {station.shareTagline}
          </div>

          <div style={{ marginTop: 14, fontSize: 22, color: "#525252" }}>{host}</div>
        </div>
      </div>
    ),
    size,
  );
}
