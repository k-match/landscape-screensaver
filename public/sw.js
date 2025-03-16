// public/sw.js - 改善版
const CACHE_NAME = 'landscape-screensaver-v2';
const CACHED_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/maskable-icon-192x192.png'
];

// インストール時にリソースをキャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(CACHED_URLS);
      })
      .then(() => {
        return self.skipWaiting(); // 即座に新しいサービスワーカーをアクティブにする
      })
  );
});

// アクティベーション時に古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      ).then(() => self.clients.claim()); // このサービスワーカーがすべてのクライアントをコントロール
    })
  );
});

// ネットワークリクエストをインターセプト
self.addEventListener('fetch', event => {
  // API呼び出しはネットワークを優先し、キャッシュはフォールバックとして使用
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match('/index.html');
        })
    );
    return;
  }
  
  // その他のリソースはキャッシュを優先し、なければネットワークから取得
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        
        return fetch(event.request)
          .then(response => {
            // 無効なレスポンスの場合はそのまま返す
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // レスポンスのクローンを作成してキャッシュに保存
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(error => {
            console.log('Fetch failed:', error);
            // オフライン時はホームページを返す
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            // その他のリソース取得エラーは通常のエラーとして扱う
            throw error;
          });
      })
  );
});