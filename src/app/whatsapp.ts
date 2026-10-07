// WhatsApp openen met een klaar bericht (7/10/2026: Jonas wil altijd WhatsApp Business, zijn zakelijke nummer).
// WhatsApp Business heeft op de iPhone een eigen link (whatsapp-smb://). Die is niet officieel gedocumenteerd: opent
// Business niet binnen ±1,5 s (de app blijft zichtbaar), dan valt de app terug op de gewone wa.me-link.

/** "0470 12 34 56" / "+32 470…" → "32470123456" (zoals WhatsApp het wil). */
export function waNummerVoorLink(nummer: string): string {
  const d = nummer.replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  return d.startsWith('0') ? `32${d.slice(1)}` : d;
}

export function whatsappLinks(nummer: string, tekst: string) {
  const n = waNummerVoorLink(nummer);
  const t = encodeURIComponent(tekst);
  return { business: `whatsapp-smb://send?phone=${n}&text=${t}`, gewoon: `https://wa.me/${n}?text=${t}` };
}

/** Opent WhatsApp Business (of de gewone WhatsApp) met het bericht klaar. */
export function openWhatsapp(nummer: string, tekst: string, app: 'business' | 'gewoon'): void {
  const l = whatsappLinks(nummer, tekst);
  if (app === 'gewoon') {
    window.location.href = l.gewoon;
    return;
  }
  let weg = false;
  const opWeg = () => {
    if (document.visibilityState === 'hidden') weg = true;
  };
  document.addEventListener('visibilitychange', opWeg);
  window.location.href = l.business;
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', opWeg);
    if (!weg && document.visibilityState === 'visible') window.location.href = l.gewoon;
  }, 1500);
}
