/**
 * Minimal service worker — yalnızca uygulamayı kurulabilir (PWA) yapmak ve
 * değişmez varlıkları önbelleklemek için var.
 *
 * Kasıtlı olarak dar kapsamlı: sadece /_next/static/ altındaki, adı içerik
 * hash'i taşıyan dosyalar önbelleklenir. Sayfalar ve /api/* her zaman ağdan
 * gelir — aksi hâlde bayat playlist veya bayat yayın konumu servis edilebilir,
 * bu da senkronizasyonu bozardı.
 */

const CACHE = "radio-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/_next/static/")) return;

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
