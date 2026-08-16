/**
 * Künye ve iletişim bilgileri — tek yerden değiştirilir.
 *
 * DİKKAT: bu dosya `production` branch'inde gerçek değerleri taşıyor; `main`
 * ise nötr placeholder'larla duruyor. İkisi bilerek ayrı — `main` şablon ve
 * fork alan herkes onu miras alıyor. Buradaki değerleri asla `main`'e merge
 * etme; ters yönde (main -> production) merge güvenli.
 *
 * `main`'de bu alanlar bilerek sahte: dosya şablonun parçası, gerçek bir adres
 * bırakılsa kurulumu tamamlamayan her fork *başkasının* iletişim bilgisini
 * yayınlar ve kaldırma talepleri yanlış gelen kutusuna düşerdi.
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
  },

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
   * Fork'unu yayınlıyorsan burayı **mutlaka** değiştir: hak sahipleri
   * senin yayınladığın içerik için buraya yazacak.
   */
  contactEmail: "mtahsinsungur@gmail.com",

  /** Kaynak kodun adresi — footer'daki GitHub bağlantısı buraya gider. */
  repoUrl: "https://github.com/tahsingibi/orbitcast",

  /**
   * Bağış bağlantısı.
   *
   * Boş bırakılırsa "Hakkında" penceresindeki destek bölümü hiç render
   * edilmez. Şablonda boş: kimse istemeden başkası adına bağış toplamasın.
   *
   * Tip `string`'e genişletiliyor: `as const` altında değişmez metin tipi
   * çıksa koşul derleme anında hep doğru görünür, boş bırakma senaryosu
   * tipten kaybolurdu.
   */
  supportUrl: "https://buymeacoffee.com/tahsingibi" as string,
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
