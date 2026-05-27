/* eslint-disable no-restricted-globals */
/**
 * SikaBuk Service Worker — Workbox-powered offline support
 * CRA's build toolchain will inject the precacheManifest automatically.
 */
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst } from 'workbox-strategies';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

clientsClaim();

// Precache all build assets (CRA injects the manifest at build time)
precacheAndRoute(self.__WB_MANIFEST);

// ─── App Shell (SPA) ───────────────────────────────────────────────────────--
// Serve index.html for any non-API, non-asset navigation request (SPA fallback)
const fileExtensionRegexp = new RegExp('/[^/?]+\\.[^/]+$');
registerRoute(
  ({ request, url }) => {
    if (request.mode !== 'navigate') return false;
    if (url.pathname.startsWith('/_')) return false;
    if (url.pathname.match(fileExtensionRegexp)) return false;
    return true;
  },
  createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html')
);

// ─── Static Assets (CacheFirst, 30d) ──────────────────────────────────────--
registerRoute(
  ({ url }) =>
    url.origin === self.location.origin &&
    (url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.ico')),
  new CacheFirst({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
);

// ─── Google Fonts / CDN (StaleWhileRevalidate) ────────────────────────────--
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts', plugins: [new ExpirationPlugin({ maxEntries: 20 })] })
);

// ─── API Calls (NetworkFirst with offline fallback) ───────────────────────--
// Background sync queue — retries failed POST/PUT/DELETE when back online
const bgSyncPlugin = new BackgroundSyncPlugin('api-queue', {
  maxRetentionTime: 24 * 60, // retry for up to 24 hours
});

// GET requests: try network first, fall back to cache
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-responses',
    networkTimeoutSeconds: 10,
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 5 * 60 })],
  })
);

// Mutating requests (POST/PUT/PATCH/DELETE): direct fetch only — never cache
// Cache API rejects non-GET requests; use BackgroundSync on network failure instead
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method),
  {
    async handle({ request, event }) {
      try {
        return await fetch(request);
      } catch (err) {
        await bgSyncPlugin.fetchDidFail({ error: err, event, request: request.clone() });
        throw err;
      }
    },
  },
  'POST'
);

// ─── Skip waiting: activate new SW immediately ────────────────────────────--
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
