import type { MetadataRoute } from "next";

import { stationTitle } from "@/lib/radio";
import { getStation } from "@/lib/station";

// İstasyon adı çalışma zamanında değişebildiği için manifest de dinamik.
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const station = await getStation();

  return {
    name: stationTitle(station.name, station.tagline),
    short_name: station.name,
    description: `${station.name}: herkesin aynı anda aynı parçayı dinlediği senkron radyo yayını.`,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "tr",
    categories: ["music", "entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
