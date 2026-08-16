/**
 * Türkçe sözlük.
 *
 * Bu dosya sözlüğün *referansıdır*: `Dictionary` tipi buradan türetilir, yani
 * yeni bir anahtar eklendiğinde diğer diller derleme hatası verir. Böylece
 * çeviri unutmak mümkün olmuyor.
 */
export const tr = {
  player: {
    listenersHint: "Şu an dinleyen kişi sayısı (birkaç dakika gecikmeli)",
    nowPlaying: "ŞİMDİ ÇALIYOR",
    upNext: "SIRADAKİ",
    openQueue: "Akış ›",
    play: "Yayını başlat",
    pause: "Duraklat",
    mute: "Sesi kapat",
    unmute: "Sesi aç",
    volume: "Ses seviyesi",
    adBreak: "Reklam — bitince yayına geri döneceksin",
    buffering: "Bağlanıyor…",
    share: "Paylaş: {track}",
    shareOnXLabel: "X'te paylaş",
    shareOnInstagram: "Instagram story",
    sharePreparing: "Hazırlanıyor…",
    /** X gönderisinin hazır metni. */
    shareText: '{station} yayınında "{title}" dinliyorum — {artist}',
    errorSuffix: "Yayın sıradaki parçayla devam edecek.",
    builtBy: "{author} tarafından yapıldı",
    queueLink: "Yayın akışı",
    infoLink: "Hakkında",
    repoLink: "GitHub",
  },

  source: {
    liveLabel: "CANLI",
    backupLabel: "YEDEK",
    liveTitle: "Canlı yayın",
    liveBody:
      "Parça listesi canlı olarak yönetiliyor; yeni şarkılar eklendiğinde yayın anında güncellenir.",
    pinnedTitle: "Yedek liste",
    pinnedBody:
      "Yayın yedek listeden sürüyor. Şarkılar kesintisiz çalmaya devam eder, ancak liste şu anda güncellenmiyor.",
    fallbackTitle: "Yedek liste",
    fallbackBody:
      "Canlı listeye şu an ulaşılamıyor, yayın yedek listeden kesintisiz sürüyor. Liste geçici olarak güncellenmiyor.",
  },

  queue: {
    title: "YAYIN AKIŞI",
    played: "ÇALDI",
    nowPlaying: "ŞİMDİ ÇALIYOR",
    upNext: "SIRADA",
    close: "Kapat",
    justPlayed: "az önce",
    minutesAgo: "{minutes} dk önce",
    startingSoon: "birazdan",
    minutesLater: "{minutes} dk sonra",
  },

  info: {
    title: "HAKKINDA",
    close: "Kapat",
    howHeading: "BU YAYIN NASIL ÇALIŞIYOR",
    howBody: "{station}, seçilmiş YouTube videolarını",
    howApi: "YouTube IFrame Player API",
    howBodyRest:
      "üzerinden oynatan bir web oynatıcısıdır. Tüm dinleyiciler ortak bir zaman hesabıyla aynı parçanın aynı saniyesinde buluşur.",
    copyrightHeading: "TELİF HAKLARI",
    copyrightLead: "Bu sitede hiçbir ses veya video dosyası",
    copyrightEmphasis:
      "barındırılmaz, indirilmez, kopyalanmaz veya yeniden yayınlanmaz",
    copyrightRest:
      ". İçerik doğrudan YouTube'un kendi oynatıcısı ve altyapısı üzerinden, hak sahiplerinin YouTube'da yayınladığı hâliyle çalınır. Oynatma sırasında YouTube Hizmet Şartları geçerlidir.",
    copyrightOwners:
      "Tüm eserlerin hakları ilgili sanatçılara, yapımcılara ve hak sahiplerine aittir. Bu site içerik üzerinde hiçbir mülkiyet iddiasında bulunmaz ve yayından ticari gelir elde etmez.",
    takedownHeading: "KALDIRMA TALEBİ",
    takedownBody:
      "Bir eserin hak sahibiyseniz ve listeden çıkarılmasını istiyorsanız, aşağıdaki adrese eserin adını ve YouTube bağlantısını içeren bir e-posta gönderin. Talep doğrulandıktan sonra parça",
    takedownEmphasis: "gecikmeksizin",
    takedownRest: "listeden kaldırılır.",
    takedownSubject: "{station} — Kaldırma talebi",
    creditsHeading: "KÜNYE",
    creditsBody: "{author} tarafından yapıldı.",
    creditsRepo: "Kaynak kodu GitHub'da",
    supportHeading: "DESTEK OL",
    /**
     * Bağışın *neyi* desteklediği bilerek vurgulanıyor.
     *
     * İki sebeple: hemen yukarıdaki telif bölümü yayından gelir elde
     * edilmediğini söylüyor ve bu doğru kalmalı; ayrıca bağış zaten yayın
     * için değil, kodu herkese açık paylaşan proje için isteniyor. Bu yüzden
     * "barındırma" gibi yayına bakan hiçbir gerekçe geçmiyor.
     */
    supportBody:
      "OrbitCast açık kaynak: kodun tamamı paylaşılıyor, isteyen kendi radyosunu kurabiliyor. Bağışlar bu yayına değil, projenin geliştirilmesine gider — dinlemek her zaman ücretsiz.",
    supportCta: "Bana bir kahve ısmarla",
  },

  empty: {
    body: "Yayın listesi henüz boş. Parça eklendiğinde yayın kendiliğinden başlar.",
    adminLink: "Yayın yönetimi",
    setupHint: "İlk kurulum mu? Çalıştır:",
  },

  language: {
    label: "Dil",
    switchTo: "Dili değiştir: {name}",
  },

  admin: {
    title: "YAYIN YÖNETİMİ",
    loginHint: "Devam etmek için parolayı girin.",
    password: "Parola",
    signIn: "Giriş yap",
    signingIn: "Kontrol ediliyor…",
    loginFailed: "Giriş başarısız.",
    disabledTitle: "YAYIN YÖNETİMİ",
    disabledBody: "Panel kapalı. Açmak için",
    disabledBodyRest:
      "ortam değişkenini tanımlayın ve uygulamayı yeniden başlatın.",

    summary: "{count} parça · toplam {total}",
    sourceRedis: "canlı · Upstash Redis",
    sourceFile: "canlı · yerel dosya",
    sourceYouTube: "canlı · YouTube playlist",
    sourcePinned: "yedek liste (elle seçildi)",
    sourceFallback: "yedek liste (Redis'e ulaşılamıyor)",

    backToRadio: "Yayına dön",
    signOut: "Çıkış",

    sourcePanelTitle: "YAYIN KAYNAĞI",
    sourcePanelHint: "Yayının hangi listeden çıkacağını buradan seçin",
    sourceOptionRedis: "Depodaki liste",
    sourceOptionRedisHint: "Aşağıda düzenlediğiniz liste yayında",
    sourceOptionYouTube: "YouTube playlist",
    sourceOptionYouTubeHint: "Liste YouTube'da yönetilir; panel salt okunur",
    sourceOptionFile: "Yedek liste",
    sourceOptionFileHint: "Repodaki data/playlist.json yayında",
    playlistUrlLabel: "PLAYLIST ADRESİ",
    playlistUrlPlaceholder: "https://www.youtube.com/playlist?list=…",
    copyToBackup: "Yedeğe kopyala",
    copyToBackupHint:
      "Yayındaki listeyi repodaki yedek dosyaya yazar; kaynağa ulaşılamadığında bu liste devreye girer",
    copyToBackupDone: "{count} parça yedeğe kopyalandı",
    switchToBackup: "Yedeğe geç",
    switchToBackupHint:
      "Redis okumalarını durdurup repo'daki yedek listeye geç",
    switchToLive: "Canlıya dön",

    fileStoreWarning: "Playlist şu anda",
    fileStoreWarningRest:
      "dosyasında tutuluyor. Üretimde deploy almadan düzenleyebilmek için",
    fileStoreWarningEnd: "tanımlayın.",

    fallbackBannerTitle: "Redis'e ulaşılamıyor.",
    fallbackBannerBody:
      "Yayın repo'daki yedek listeden kesintisiz sürüyor, düzenleme kapalı.",
    pinnedBannerTitle: "Yedek liste yayında.",
    youtubeBannerTitle: "Yayın bir YouTube playlist'inden.",
    youtubeBannerBody: "Parçaları YouTube'daki listeden ekleyip çıkarın; yayın birkaç dakika içinde uyar. Aşağıdaki liste salt okunur.",
    pinnedBannerBody: "Redis okunmuyor — kota harcanmıyor. Yayın",
    pinnedBannerRest: "'dan çıkıyor ve düzenleme kapalı.",

    liveNowPlaying: "Şimdi çalıyor ·",
    skipNext: "Sonrakine geç",

    stationName: "İSTASYON ADI",
    tagline: "SLOGAN",
    shareTagline: "PAYLAŞIM METNİ",
    shareTaglineHint:
      "X paylaşımlarında görünen kartın alt satırı. Tek satırda kalması için " +
      "~45 karakteri geçmeyin; sonuna nokta koymayın.",

    urlPlaceholder: "YouTube linki yapıştırın",
    urlPlaceholderYouTube: "Liste YouTube'da — parçaları oradan ekleyin",
    urlPlaceholderReadOnly: "Yedek liste yayında — düzenleme kapalı",
    add: "Ekle",
    adding: "Çözümleniyor…",
    duplicate: "Bu parça listede zaten var.",
    notEmbeddable: "Gömülü oynatmaya kapalı — yayında sessiz kalır.",

    emptyList: "Liste boş. Yukarıdan bir YouTube linki ekleyin.",
    dragHint: "Sürükleyerek sıralayın",
    playFromHere: "Yayını buradan başlat",
    moveUp: "Yukarı taşı",
    moveDown: "Aşağı taşı",
    remove: "Listeden çıkar",

    unsaved: "Kaydedilmemiş değişiklikler var.",
    lastSaved: "Son kayıt: {when}",
    save: "Kaydet",
    saving: "Kaydediliyor…",

    footnote:
      "düğmesi yayını o parçanın başına çeker; “Sonrakine geç” bir sonrakine atlar. İkisi de bekleyen düzenlemeleri birlikte kaydeder. Yeni ziyaretçiler değişikliği anında görür, açık sekmeler en geç 60 saniye içinde yakalar. Parça eklemek, çıkarmak veya sıralamayı değiştirmek de yayının o anki konumunu kaydırır — senkron bozulmaz.",
  },

  errors: {
    unauthorized: "Yetkisiz.",
    invalidBody: "Geçersiz gövde.",
    invalidSource: "Geçersiz kaynak.",
    playlistUrlMissing: "Önce bir YouTube playlist adresi girin.",
    playlistUnreadable: "Bu playlist okunamadı; herkese açık olduğundan emin olun.",
    livePlaylistEmpty: "Yayındaki liste boş; kopyalanacak bir şey yok.",
    invalidStartIndex: "Geçersiz başlangıç sırası.",
    emptyLink: "Link boş.",
    wrongPassword: "Parola hatalı.",
    adminDisabled: "Admin paneli kapalı: ADMIN_PASSWORD tanımlı değil.",
    readOnlyWhileBackup:
      "Yedek liste yayındayken düzenleme kapalı. Önce canlı listeye dönün.",
    trackFieldMissing: "#{index}: videoId veya süre eksik.",

    // youtube-metadata.ts kodları
    INVALID_URL: "Geçerli bir YouTube linki veya video id'si değil.",
    VIDEO_NOT_FOUND: "Video bulunamadı (silinmiş veya gizli olabilir).",
    NO_DURATION: "Parça süresi belirlenemedi.",
    IS_LIVE: "Canlı yayınlar listeye eklenemez — sabit süresi yok.",
    DURATION_UNREADABLE:
      "Süre okunamadı. Sunucudan YouTube'a erişim kısıtlanmış olabilir — YOUTUBE_API_KEY tanımlamayı deneyin.",
    UPSTREAM_ERROR: "YouTube'a ulaşılamadı.",
    INVALID_PLAYLIST_URL: "Geçerli bir YouTube playlist adresi değil.",
    PLAYLIST_NOT_FOUND: "Playlist bulunamadı (gizli veya silinmiş olabilir).",
    PLAYLIST_EMPTY: "Playlist boş görünüyor.",

    // Oynatıcı hataları
    playerInvalidId: "Geçersiz video kimliği.",
    playerUnsupported: "Video bu oynatıcıda desteklenmiyor.",
    playerRemoved: "Video kaldırılmış veya gizli.",
    playerNotEmbeddable:
      "Telif sahibi bu videonun site içinde oynatılmasına izin vermiyor.",
    playerGeneric: "Bu parça oynatılamadı.",
    playerApiFailed: "YouTube oynatıcısı yüklenemedi.",

    storeReadOnly:
      "Playlist kaydedilemedi: dosya sistemi salt okunur. Üretimde değişiklik yapabilmek için UPSTASH_REDIS_REST_URL ve UPSTASH_REDIS_REST_TOKEN tanımlayın.",
    backupPlaylistEmpty: "Yedek liste boş — geçilseydi yayın susardı. Önce `RADIO_SOURCE=file npm run radio:add` ile doldurun.",
    sourceSwitchUnavailable:
      "Kaynak değiştirilemiyor: Upstash Redis yapılandırılmamış, zaten yerel dosya kullanılıyor.",
  },

  meta: {
    description: "{station}: {shareTagline}.",
    trackDescription: "{station} yayınında çalıyor. {shareTagline}.",
    adminTitle: "Yayın Yönetimi",
  },
} as const;
