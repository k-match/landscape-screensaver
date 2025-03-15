const CACHE_NAME = 'landscape-screensaver-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  // アイコンなどの追加アセット
];

// インストール時にリソースをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// ネットワークリクエストをインターセプト
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュがあればそれを返す
        if (response) {
          return response;
        }
        
        // キャッシュがなければネットワークリクエスト
        return fetch(event.request).then(
          response => {
            // 無効なレスポンスはキャッシュしない
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // レスポンスをクローンしてキャッシュに追加
            let responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseToCache);
            });
            
            return response;
          }
        );
      })
    );
});