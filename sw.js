const CACHE_NAME = '8a8-portal-v1.0.0';

// Các tài nguyên tĩnh cần cache khi cài đặt Service Worker
const STATIC_ASSETS = [
  './',
  './index.html',
  './admin.html',
  './manifest.webmanifest',
  './seasonal-theme.css',
  // CDN bên ngoài
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@500;600;700&display=swap',
  'https://unpkg.com/aos@2.3.4/dist/aos.css',
  'https://unpkg.com/aos@2.3.4/dist/aos.js',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js',
  'https://unpkg.com/lucide@latest'
];

// 1. Cài đặt Service Worker và lưu Cache tài nguyên tĩnh
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Kích hoạt và dọn dẹp các cache cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Xử lý yêu cầu mạng (Fetch strategy)
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Bỏ qua không cache các request tới Firebase API, Firestore, Google Auth, Railway Backend
  if (
    requestUrl.hostname.includes('firestore.googleapis.com') ||
    requestUrl.hostname.includes('identitytoolkit.googleapis.com') ||
    requestUrl.hostname.includes('firebase') ||
    requestUrl.pathname.includes('/api/')
  ) {
    return;
  }

  // Chiến lược: Stale-While-Revalidate cho các file tĩnh & CDN
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Trường hợp mất mạng (Offline fallback)
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});
