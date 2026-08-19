import { FALLBACK_COVER, type Track } from "@/lib/radio";

/**
 * Parça kapağı — yoksa parçaya özel bir görsel üretir.
 *
 * Kapaksız parçaların hepsini aynı istasyon ikonuyla göstermek listeyi okunmaz
 * hâle getiriyordu: yan yana on parça, on aynı kare. Bunun yerine kimlikten
 * türeyen bir degrade ve baş harfler çiziliyor — her parça ayırt edilebilir
 * oluyor, üstelik hiçbir ağ isteği yapılmadan.
 *
 * Üretim **deterministik**: aynı parça her yerde (oynatıcı, akış, panel) ve her
 * oturumda aynı görseli alıyor. Rastgelelik olsaydı sayfa her yenilendiğinde
 * renk değişir ve parça tanınamazdı.
 */

/** Kimliği kararlı bir sayıya indirger (FNV-1a). */
function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Görünen adın baş harfleri.
 *
 * Sanatçı ve başlıktan birer harf: tek kaynaktan iki harf almak
 * ("Suspus" → "SU") bir şey anlatmıyor, iki kaynaktan birer harf
 * ("Ceza · Suspus" → "CS") parçayı gerçekten ayırt ediyor.
 */
function initials(track: Pick<Track, "title" | "artist">): string {
  const first = (value: string) => [...value.trim()][0]?.toLocaleUpperCase("tr") ?? "";
  const artist = first(track.artist === "Bilinmeyen sanatçı" ? "" : track.artist);
  const title = first(track.title);
  return (artist + title).slice(0, 2) || "♪";
}

/** Parçaya özel degrade; okunabilirlik için doygunluk ve parlaklık sabit. */
function gradient(seed: string): string {
  const h = hash(seed);
  const hue = h % 360;
  // İkinci renk sabit bir açıyla kaydırılıyor: rastgele seçilseydi bazı
  // çiftler çamur rengi verirdi.
  const pair = (hue + 48) % 360;
  return `linear-gradient(140deg, hsl(${hue} 58% 42%), hsl(${pair} 62% 22%))`;
}

type Props = {
  track: Pick<Track, "videoId" | "title" | "artist" | "thumbnail">;
  /** `fill` kullanan yerleşimlerde konteyner ölçüyü verir. */
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  alt?: string;
  /** Baş harfleri gizler; bulanık arka plan gibi dekoratif kullanımlar için. */
  plain?: boolean;
};

/** Kapak var mı? Yedek ikon "var" sayılmıyor — asıl kapak o değil. */
export function hasCover(thumbnail: string): boolean {
  return Boolean(thumbnail) && thumbnail !== FALLBACK_COVER;
}

export default function CoverArt({
  track,
  fill,
  width,
  height,
  className = "",
  priority,
  alt = "",
  plain,
}: Props) {
  if (hasCover(track.thumbnail)) {
    return (
      // Bilinçli olarak düz <img>: `next/image` uzak görselleri yalnızca
      // `next.config` içinde izin verilen alan adlarından yüklüyor. Kapakların
      // adresi ise kullanıcının deposundan geliyor ve kurulumdan kuruluma
      // değişiyor — allowlist'i ortam değişkeninden türetmek, değişken
      // yapılandırma okunmadan önce değerlendirildiğinde oynatıcıyı çalışma
      // anında çökertiyordu. Kapaklar zaten en fazla 384px gösteriliyor ve
      // kaynakları küçük; optimizasyondan kazanılan, bu kırılganlığa değmez.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={track.videoId}
        src={track.thumbnail}
        alt={alt}
        {...(fill ? {} : { width: width ?? 48, height: height ?? 48 })}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        draggable={false}
        className={`${fill ? "absolute inset-0 h-full w-full" : ""} ${className}`}
      />
    );
  }

  return (
    <div
      key={track.videoId}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      style={{
        backgroundImage: gradient(track.videoId),
        // container-type: size kesin ölçü istiyor; fill dışındaki kullanımda
        // ölçüyü prop'lardan veriyoruz.
        ...(fill ? null : { width: width ?? 48, height: height ?? 48 }),
      }}
      className={`flex items-center justify-center [container-type:size] ${fill ? "absolute inset-0 h-full w-full" : ""} ${className}`}
    >
      {!plain && (
        <span
          // Ölçü konteynerden geliyor (üstteki container-type: size): aynı
          // bileşen 40px kuyruk satırında da 384px oynatıcı kapağında da
          // orantılı görünsün.
          style={{ fontSize: "34cqmin" }}
          className="select-none font-semibold tracking-tight text-white/80"
        >
          {initials(track)}
        </span>
      )}
    </div>
  );
}
