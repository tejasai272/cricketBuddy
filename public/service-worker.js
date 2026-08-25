/* Service Worker for CricketBuddy - Offline-First PWA Support */

const CACHE_NAME = 'cricketbuddy-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install: Cache essential files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.error('[SW] Cache installation failed:', err);
      })
  );
  self.skipWaiting(); // Activate immediately
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Take control of all clients
});

// Fetch: Network-first for API calls, cache-first for assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Firebase and external API calls - network only
  if (
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebase.google.com')
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() => {
          // If offline and it's API call, silently fail
          console.log('[SW] API call failed (offline):', url.hostname);
          return new Response(JSON.stringify({ offline: true }), {
            status: 503,
            statusText: 'Service Unavailable (Offline)',
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // For app assets: cache-first with network fallback
  event.respondWith(
    caches.match(request)
      .then((response) => {
        // Return cached version if available
        if (response) {
          console.log('[SW] Serving from cache:', request.url);
          return response;
        }

        // Otherwise, fetch from network
        console.log('[SW] Fetching from network:', request.url);
        return fetch(request)
          .then((response) => {
            // Only cache successful responses for GET requests
            if (
              response.status === 200 &&
              request.method === 'GET' &&
              !url.pathname.includes('/static/js/') // Don't cache JS yet, it changes
            ) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(request, responseToCache);
                });
            }
            return response;
          })
          .catch(() => {
            // Offline fallback for assets
            console.log('[SW] Network failed, no cache available:', request.url);
            if (request.destination === 'document') {
              // For HTML pages, return a fallback
              return caches.match('/index.html');
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// Background Sync for offline match data
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-matches') {
    console.log('[SW] Background sync: syncing offline matches');
    event.waitUntil(
      // This will be handled by the app's sync logic
      Promise.resolve()
    );
  }
});

// Message handler for cache clearing
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[SW] Clearing all caches');
    caches.keys().then((cacheNames) => {
      cacheNames.forEach((cacheName) => {
        caches.delete(cacheName);
      });
    });
  }
});
