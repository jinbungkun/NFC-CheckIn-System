const CACHE_NAME = 'checkin-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './ui.js',
  './manifest.json',
  './icon-512.png'
];

// 설치 시 자원 캐싱
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// 네트워크 우선 전략 (데이터 업데이트를 위해)
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});