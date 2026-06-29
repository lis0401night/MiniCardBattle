const CACHE_NAME = 'mini-card-battle-v1';

// プレキャッシュ（インストール時にキャッシュする基本リソース）
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
];

// インストールイベント：基本的なページをプレキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// アクティベートイベント：古いキャッシュをクリア
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

// フェッチイベント：キャッシュ優先（Cache-First）で静的アセットを返却し、未キャッシュのものはネットワークから取得してキャッシュに格納
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

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // キャッシュに存在する場合はそのまま返す（超高速）
      if (cachedResponse) {
        return cachedResponse;
      }

      // キャッシュに存在しない場合はネットワークから取得し、キャッシュに追加する
      return fetch(event.request).then((response) => {
        // レスポンスが正常でない場合はそのまま返す
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
