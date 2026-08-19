/**
 * Künye ve iletişim bilgileri — tek yerden değiştirilir.
 *
 * Buradaki değerler şablon hâlinde bilerek sahte: dosya şablonun parçası,
 * gerçek bir adres bırakılsa kurulumu tamamlamayan her fork *başkasının*
 * iletişim bilgisini yayınlar ve kaldırma talepleri yanlış gelen kutusuna
 * düşerdi.
 *
 * Neden ortam değişkeni değil: burası yapılı ve çoğalabilen veri tutuyor
 * (`socials` bir dizi). Env düz metin için; her hesap başına bir değişken
 * tanımlamak ölçeklenmez, tek bir env'e JSON tıkıştırmak da tip güvenliğini
 * kaybettirir ve hatayı derleme anından çalışma anına taşır.
 */
export const site = {
  author: {
    name: "sungur.dev",
    url: "https://sungur.dev",
    /** Künyede adın önünde görünen kullanıcı adı; boşsa yalnızca ad yazılır. */
    handle: "@tahsingibi",
  },

  /**
   * İstasyonun kendi adresi — künyede bağlantı olarak görünür.
   *
   * Ortam değişkeninden okumak yerine burada: `NEXT_PUBLIC_SITE_URL`
   * tanımlanmamış kurulumlarda adres yalnızca sunucuda biliniyor ve künye
   * istemci tarafında render ediliyor. Boş bırakılırsa bağlantı hiç çıkmaz.
   */
  stationUrl: "https://orbitcast.sungur.dev",

  /**
   * Sosyal hesaplar — "Hakkında" penceresindeki künye satırında listelenir.
   *
   * Dizi, çünkü hesaplar çoğalır: yeni bir hesap eklemek buraya bir satır
   * eklemek demek, arayüzde hiçbir değişiklik gerektirmiyor. Boş bırakılırsa
   * künye satırında hiç görünmezler.
   */
  socials: [
    { label: "@tahsingibi", url: "https://x.com/tahsingibi" },
  ] as ReadonlyArray<{ label: string; url: string }>,

  /**
   * Kaldırma taleplerinin gideceği adres.
   *
   * Yayına çıkmadan önce burayı **mutlaka** doldur: hak sahipleri senin
   * yayınladığın içerik için buraya yazacak.
   */
  contactEmail: "mtahsinsungur@gmail.com",

  /** Kaynak kodun adresi — footer'daki rozet buraya gider. */
  repoUrl: "https://github.com/tahsingibi/orbitcast",
} as const;

/**
 * Paylaşım bağlantıları ve OpenGraph görselleri için mutlak taban adres.
 *
 * Vercel'de otomatik gelir; kendi alan adınız varsa NEXT_PUBLIC_SITE_URL
 * tanımlayın (ör. https://radyom.com).
 */
export function baseUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return new URL(`https://${production}`);

  const preview = process.env.VERCEL_URL;
  if (preview) return new URL(`https://${preview}`);

  return new URL("http://localhost:3000");
}
