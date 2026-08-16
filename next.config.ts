import type { NextConfig } from "next";

/**
 * Geliştirme sırasında telefondan/başka cihazdan test edebilmek için.
 *
 * Next, dev sunucusunun `/_next/*` kaynaklarını tanımadığı origin'lere
 * vermeyi güvenlik gereği reddeder; izin verilmezse sayfa açılır ama istemci
 * JS'i yüklenmediği için hiçbir şey çalışmaz. LAN IP'si gibi ek adresleri
 * ALLOWED_DEV_ORIGINS ile virgülle ayırarak ekleyebilirsiniz.
 */
const extraDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.local", "*.localhost", ...extraDevOrigins],
  images: {
    // Parça kapakları YouTube thumbnail'lerinden geliyor.
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }],
  },
};

export default nextConfig;
