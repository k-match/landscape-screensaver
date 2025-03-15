const CACHE_NAME = 'landscape-screensaver-v1';
const BASE_PATH = location.pathname.includes('github.io') ? '/landscape-screensaver' : '';
const urlsToCache = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/manifest.json`
  // 画像ファイルを追加する場合はここに追加します
  // `${BASE_PATH}/images/landscape1.jpg`,
  // `${BASE_PATH}/images/landscape2.jpg`
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
        ).catch(error => {
          // ネットワークエラー時、オフライン表示用のフォールバック
          console.log('Fetch failed; returning offline page instead.', error);
          // カスタムオフラインページがある場合はそれを返す
          // return caches.match('offline.html');
        });
      })
    );
});

// 古いキャッシュを削除
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});