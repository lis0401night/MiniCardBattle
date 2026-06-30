const CACHE_NAME = 'mini-card-battle-v2';

// プリキャッシュする基本リソース
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // POST/PUT/DELETEなどの非GETリクエストや、サーバー上のPHP API、別ドメインへの通信（Firebase等）はキャッシュ対象外
  if (
    event.request.method !== 'GET' ||
    url.pathname.endsWith('.php') ||
    !url.origin.startsWith(self.location.origin)
  ) {
    return;
  }

  // index.html、ルート(/)、およびその他のHTMLファイルへのリクエストは「Network-First」
  const isHtmlRequest =
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname.endsWith('.html');

  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // ネットワーク取得に成功した場合はキャッシュを更新して返却
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // ネットワークエラー（オフライン等）の場合はキャッシュから返却
          return caches.match(event.request);
        })
    );
    return;
  }

  // JS, CSS, 画像, 音声などの静的アセットは「Cache-First」
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      });
    })
  );
});
