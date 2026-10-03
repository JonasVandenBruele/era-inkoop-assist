/// <reference lib="webworker" />
// Servicewerker van Oxpecker: offline-cache (Workbox) en pushmeldingen.
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

interface PushInhoud {
  titel: string;
  tekst: string;
  url?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let inhoud: PushInhoud = { titel: 'Oxpecker', tekst: 'Er is iets nieuws in je Dagplanner.' };
  try {
    if (event.data) inhoud = { ...inhoud, ...(event.data.json() as Partial<PushInhoud>) };
  } catch {
    /* geen geldige JSON: standaardtekst */
  }
  event.waitUntil(
    self.registration.showNotification(inhoud.titel, {
      body: inhoud.tekst,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: inhoud.tag,
      data: { url: inhoud.url ?? './' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const doel = new URL((event.notification.data as { url?: string })?.url ?? './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const vensters = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = vensters.find((v) => v.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(doel);
    })(),
  );
});
