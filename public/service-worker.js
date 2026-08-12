const CACHE_NAME = 'mini-card-battle-v0.3.6';

// プリキャッシュする基本リソース
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './apple-touch-icon.png'
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

  // POST/PUT/DELETEなどの非GETリクエストや、サーバー上のPHP API、別ドメインへの通信（Firebase等）、バージョンチェック用JSON、およびサービスワーカー自身はキャッシュ対象外
  if (
    event.request.method !== 'GET' ||
    url.pathname.endsWith('.php') ||
    url.pathname.includes('version.json') ||
    url.pathname.includes('service-worker.js') ||
    !url.origin.startsWith(self.location.origin)
  ) {
    return;
  }

  // index.html、ルート(/)、およびその他のHTMLファイルへのリクエストは「Network-First」
  // サブディレクトリ配置に対応するため、末尾がスラッシュで終わる場合も含めて判定します
  const isHtmlRequest =
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('.html');

  if (isHtmlRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => {
                return cache.put(event.request, responseToCache);
              })
            );
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
    return;
  }

  // 音声・動画などの分割読み込み（Rangeリクエスト）の特別なハンドリング
  // iOS Safari は音声再生時に複数の Range リクエスト（bytes=0-1, bytes=32768- など）を送信する。
  // キャッシュキーに Range ヘッダー付きの request をそのまま使うと、Range 値ごとに別エントリとして
  // 保存されてしまい、同じファイルのフルダウンロード＆書き込みが何度も繰り返される。
  // これを防ぐため、URL のみのクリーンな Request をキャッシュキーとして使用する。
  const hasRangeHeader = event.request.headers.has('range');
  if (hasRangeHeader) {
    // Range ヘッダーを含まない一意のキャッシュキーを作成
    const cacheKey = new Request(event.request.url);
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(cacheKey).then((cachedResponse) => {
          if (cachedResponse) {
            // キャッシュ済みの完全なデータから必要な範囲のみを切り出して返す
            return createPartialResponse(event.request, cachedResponse);
          }

          // キャッシュがない場合、Rangeヘッダーを除外したフルGETで取得・一括キャッシュする
          // これにより分割読み込みを「一括取得」に昇華し、キャッシュを蓄積させます
          return fetch(cacheKey)
            .then((response) => {
              if (response && response.status === 200) {
                const responseToCache = response.clone();
                event.waitUntil(cache.put(cacheKey, responseToCache));
                return createPartialResponse(event.request, response);
              }
              // 200以外の場合は通常の分割読み込みでフォールバック
              return fetch(event.request);
            })
            .catch(() => {
              // オフライン等のエラー時は通常のフェッチエラー
              return fetch(event.request);
            });
        });
      })
    );
    return;
  }

  // JS, CSS, 画像, 音声などの静的アセットは「Cache-First」
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
              return response;
            }

            const responseToCache = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => {
                return cache.put(event.request, responseToCache);
              })
            );

            return response;
          })
          .catch(() => {
            // ネットワークエラー時の安全な代替レスポンス（503化の防止）
            return new Response('Network fetch failed', { status: 480, statusText: 'Fetch Failed' });
          });
      })
      .catch(() => {
        // キャッシュマッチ自体のエラー時のセーフガード
        return fetch(event.request).catch(() => {
          return new Response('Network fetch failed', { status: 480, statusText: 'Fetch Failed' });
        });
      })
  );
});

/**
 * 200 (完全なレスポンス) から擬似的に 206 (Partial Content) レスポンスを生成する関数
 * @param {Request} request - 元のRangeリクエスト
 * @param {Response} response - キャッシュまたは取得された完全なレスポンス
 */
async function createPartialResponse(request, response) {
  const responseBlob = await response.blob();
  const rangeHeader = request.headers.get('range');
  const matches = rangeHeader.match(/^bytes=(\d+)-(\d+)?$/);

  if (!matches) {
    return new Response(responseBlob, {
      status: 200,
      headers: response.headers
    });
  }

  const start = parseInt(matches[1], 10);
  const end = matches[2] ? parseInt(matches[2], 10) : responseBlob.size - 1;
  const slicedBlob = responseBlob.slice(start, end + 1);

  const headers = new Headers(response.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${responseBlob.size}`);
  headers.set('Content-Length', slicedBlob.size.toString());

  return new Response(slicedBlob, {
    status: 206,
    statusText: 'Partial Content',
    headers: headers
  });
}
