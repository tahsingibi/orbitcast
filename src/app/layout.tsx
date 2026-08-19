import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import { I18nProvider } from "@/lib/i18n/context";
import { format } from "@/lib/i18n/format";
import { getI18n } from "@/lib/i18n/server";
import { stationTitle } from "@/lib/radio";
import { baseUrl, site } from "@/lib/site";
import { getStation } from "@/lib/station";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
  // Tam ekran düzenin çentikli ekranlarda da kenara dayanması için.
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const [station, { t }] = await Promise.all([getStation(), getI18n()]);
  const description = format(t.meta.description, {
    station: station.name,
    shareTagline: station.shareTagline,
  });

  return {
    metadataBase: baseUrl(),
    title: stationTitle(station.name, station.tagline),
    // Künye şablon hâlindeyken (kurulum öncesi) boş yazar alanları
    // metadata'ya sızmasın: "Built by ." gibi bir açıklama üretilirdi.
    description: site.author.name
      ? `${description} ${format(t.player.builtBy, { author: site.author.name })}.`
      : description,
    ...(site.author.name
      ? {
          authors: [{ name: site.author.name, url: site.author.url || undefined }],
          creator: site.author.name,
        }
      : {}),
    applicationName: station.name,
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: "/apple-touch-icon.png",
    },
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: "/",
      title: stationTitle(station.name, station.tagline),
      description,
      siteName: station.name,
      locale: "tr_TR",
    },
    twitter: {
      card: "summary_large_image",
      title: stationTitle(station.name, station.tagline),
      description,
    },
    // Ana ekrana eklendiğinde tarayıcı arayüzü olmadan açılsın.
    appleWebApp: {
      capable: true,
      title: station.name,
      statusBarStyle: "black-translucent",
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, t } = await getI18n();

  return (
    // Sayfalar viewport'a tam oturacak şekilde tasarlandı: hiçbir yerde sayfa
    // kaydırması olmamalı. Yükseklik zinciri html(100dvh) → body → sayfa(h-full)
    // olarak kuruluyor; böylece mobilde dvh/% farkından kaynaklanan taşma olmaz.
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-dvh overflow-hidden antialiased`}
    >
      <body className="h-full overflow-hidden overscroll-none bg-neutral-950 font-sans">
        <I18nProvider locale={locale} dictionary={t}>
          {children}
        </I18nProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
