// Pushmeldingen in de browser: toestemming vragen, abonneren en afmelden.
// iOS: enkel in de app op het beginscherm (iOS 16.4+), en de toestemming moet uit een tik van de gebruiker komen.
import type { Store } from './db/store';

export function isOpBeginscherm(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushOndersteund(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function sleutelNaarBytes(base64: string): Uint8Array {
  const opgevuld = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const ruw = atob(opgevuld);
  return Uint8Array.from(ruw, (c) => c.charCodeAt(0));
}

function naarBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function huidigAbonnement(): Promise<PushSubscription | null> {
  if (!pushOndersteund()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Vraagt toestemming en registreert dit toestel. Moet aangeroepen worden vanuit een tik. */
export async function meldingenAanzetten(store: Store): Promise<void> {
  const publiek = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!publiek) throw new Error('Meldingen zijn nog niet ingesteld (publieke sleutel ontbreekt).');
  if (!pushOndersteund()) throw new Error('Dit toestel of deze browser ondersteunt geen pushmeldingen.');
  const toestemming = await Notification.requestPermission();
  if (toestemming !== 'granted') throw new Error('Je gaf geen toestemming voor meldingen. Dat kan je later aanpassen in de iPhone-instellingen bij Oxpecker.');
  const reg = await navigator.serviceWorker.ready;
  const abonnement =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: sleutelNaarBytes(publiek) as BufferSource }));
  await store.bewaarPushAbonnement({
    endpoint: abonnement.endpoint,
    p256dh: naarBase64Url(abonnement.getKey('p256dh')),
    auth: naarBase64Url(abonnement.getKey('auth')),
    toestel: /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : 'ander toestel',
  });
}

export async function meldingenUitzetten(store: Store): Promise<void> {
  const abonnement = await huidigAbonnement();
  if (!abonnement) return;
  await store.verwijderPushAbonnement(abonnement.endpoint);
  await abonnement.unsubscribe();
}

/** Lokale testmelding (zonder server) om te zien hoe een melding eruitziet. */
export async function lokaleTestmelding(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Oxpecker', { body: 'Zo ziet een melding eruit. Je volgende belmoment komt hier.', icon: 'icon-192.png' });
}
