/**
 * Künye ve iletişim bilgileri — tek yerden değiştirilir.
 *
 * Buradaki değerler bilerek sahte. Bu dosya şablonun bir parçası ve fork alan
 * herkes onu miras alıyor; gerçek bir adres bırakılsa, kurulumu tamamlamayan
 * her sitede *başkasının* iletişim bilgisi yayınlanır ve kaldırma talepleri
 * yanlış gelen kutusuna düşerdi. Sahte değerler en kötü ihtimalle işe yaramaz;
 * gerçek değerler yanlış kişiye zarar verir.
 *
 * Neden ortam değişkeni değil: burası yapılı ve çoğalabilen veri tutuyor
 * (`socials` bir dizi). Env düz metin için; her hesap başına bir değişken
 * tanımlamak ölçeklenmez, tek bir env'e JSON tıkıştırmak da tip güvenliğini
 * kaybettirir ve hatayı derleme anından çalışma anına taşır.
 */
export const site = {
  author: {
    name: "example.com",
    url: "https://example.com",
  },

  /**
   * Sosyal hesaplar — "Hakkında" penceresindeki künye satırında listelenir.
   *
   * Dizi, çünkü hesaplar çoğalır: yeni bir hesap eklemek buraya bir satır
   * eklemek demek, arayüzde hiçbir değişiklik gerektirmiyor. Boş bırakılırsa
   * künye satırında hiç görünmezler.
   */
  socials: [] as ReadonlyArray<{ label: string; url: string }>,

  /**
   * Kaldırma taleplerinin gideceği adres.
   *
   * Fork'unu yayınlıyorsan burayı **mutlaka** değiştir: hak sahipleri
   * senin yayınladığın içerik için buraya yazacak.
   */
  contactEmail: "you@example.com",

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
  supportUrl: "" as string,
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
