// ════════════════════════════════════════════════════════
//  まちがいラボ Service Worker
//  目的: PWAインストール後、機内モードでも起動できるようにする
//  - install: 起動に必要な4ファイル + esm.sh の主要モジュールを事前キャッシュ
//  - fetch:   キャッシュ優先 + 裏で更新（stale-while-revalidate）
//  - 新バージョン公開時: CACHE 名を v25, v26... と上げると旧キャッシュ自動削除
// ════════════════════════════════════════════════════════

const CACHE = 'manabi-v24';

// install で先に確実に取りに行くもの。
// esm.sh は CORS 越境なので no-cors で opaque レスポンスとして保存する。
const PRECACHE_SAME_ORIGIN = [
  './',
  './index.html',
  './icon.svg',
  './manifest.webmanifest'
];
const PRECACHE_CROSS_ORIGIN = [
  'https://esm.sh/preact@10.22.0',
  'https://esm.sh/preact@10.22.0/hooks',
  'https://esm.sh/preact@10.22.0/compat',
  'https://esm.sh/htm@3.1.1'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 同一オリジンは普通に addAll。1つでも失敗するとロールバックされるので Promise.all で個別フォールバック化。
    await Promise.all(PRECACHE_SAME_ORIGIN.map(u =>
      fetch(u).then(r => { if (r && r.ok) return c.put(u, r); }).catch(() => {})
    ));
    // esm.sh は no-cors で取得し opaque を保存（中身は検査不能だが配信は可）
    await Promise.all(PRECACHE_CROSS_ORIGIN.map(u =>
      fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r)).catch(() => {})
    ));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const ks = await caches.keys();
    await Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 新バージョン待機中に postMessage('SKIP_WAITING') が来たら即切替
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(c =>
    c.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        // opaque (type==='opaque') もそのまま保存（esm.sh の CORS 越境分）
        if (res && (res.status === 200 || res.type === 'opaque')) {
          try { c.put(e.request, res.clone()); } catch (_) {}
        }
        return res;
      }).catch(() => cached);
      // キャッシュがあれば即返し、裏でネットワーク取得して上書き（stale-while-revalidate）
      return cached || network;
    })
  ));
});
