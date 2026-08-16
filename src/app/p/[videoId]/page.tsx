import type { Metadata } from "next";

import LiveRadio from "@/components/LiveRadio";
import { format } from "@/lib/i18n/format";
import { getI18n } from "@/lib/i18n/server";
import { stationTitle } from "@/lib/radio";
import { getStation } from "@/lib/station";

/**
 * Paylaşım bağlantısı.
 *
 * Ziyaretçi buraya geldiğinde canlı yayını dinler — ana sayfayla aynı akış.
 * Ayrı bir adres olmasının tek sebebi OpenGraph: X/Twitter kartları adres
 * başına önbelleğe alındığı için tek bir "/" adresi kullanılsaydı ilk taranan
 * şarkının kartı bütün paylaşımlarda donup kalırdı.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ videoId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { videoId } = await params;
  const [station, { t }] = await Promise.all([getStation(), getI18n()]);
  const track = station.tracks.find((item) => item.videoId === videoId);

  if (!track) {
    return { title: stationTitle(station.name, station.tagline) };
  }

  const heading = `${track.artist} — ${track.title}`;
  const description = format(t.meta.trackDescription, {
    station: station.name,
    shareTagline: station.shareTagline,
  });

  return {
    title: `${heading} · ${station.name}`,
    description,
    alternates: { canonical: `/p/${videoId}` },
    openGraph: {
      type: "music.song",
      url: `/p/${videoId}`,
      title: heading,
      description,
      siteName: station.name,
      locale: "tr_TR",
    },
    twitter: { card: "summary_large_image", title: heading, description },
  };
}

export default function SharePage() {
  return <LiveRadio />;
}
