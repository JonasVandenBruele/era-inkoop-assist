-- Taal en aanspreking (Jonas, 6/10/2026): spreek de klant aan zoals Jonas het met die klant doet, anders met je;
-- in de taal van de klant.
-- taal: communicatietaal uit ERAForce (import). taal_whatsapp en aanspreekvorm_bron: afgeleid uit Jonas' eigen
-- WhatsApp-berichten met die klant (scripts/whatsapp-naar-oxpecker.ts). WhatsApp gaat voor.
alter table public.contacten add column if not exists taal text check (taal in ('nl', 'fr', 'en'));
alter table public.contacten add column if not exists taal_whatsapp text check (taal_whatsapp in ('nl', 'fr', 'en'));
