-- WhatsApp: te beantwoorden (7/10/2026, toestemming Jonas). Per open 1-op-1-chat op het zakelijke nummer (de klant
-- schreef het laatst): de laatste klantberichten (max. 3, ingekort) en een voorgesteld antwoord van Claude.
-- Gemaakt op de Mac (scripts/whatsapp-open.ts, elk half uur 8–20u). Een rij verdwijnt zodra Jonas geantwoord heeft.
create table if not exists public.whatsapp_open (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null references auth.users (id) on delete cascade,
  nummer text not null,                     -- "32470123456"
  contact_id uuid,                          -- ERAForce-contact in Oxpecker, als het nummer gekend is
  naam text,                                -- naam uit ERAForce, anders de WhatsApp-naam
  laatste_op timestamptz not null,          -- laatste bericht van de klant
  klant_berichten jsonb not null default '[]'::jsonb,  -- [{ "tijd": "...", "tekst": "..." }]
  nodig boolean not null default true,      -- false: Claude vindt dat er geen antwoord nodig is (bv. "Top, dank je!")
  antwoord text,                            -- voorgesteld antwoord in Jonas' stijl
  taal text,
  reden text,                               -- korte uitleg voor Jonas
  invoer_hash text,                         -- ongewijzigde chat = antwoord niet opnieuw laten maken
  afgehandeld_op timestamptz,               -- "Niet nodig" in de app (tot er een nieuw klantbericht komt)
  bijgewerkt_op timestamptz not null default now(),
  unique (eigenaar_id, nummer)
);

alter table public.whatsapp_open enable row level security;
create policy "eigen rijen lezen" on public.whatsapp_open for select to authenticated using (eigenaar_id = (select auth.uid()));
create policy "eigen rijen afhandelen" on public.whatsapp_open for update to authenticated
  using (eigenaar_id = (select auth.uid())) with check (eigenaar_id = (select auth.uid()));
grant select on public.whatsapp_open to authenticated;
grant update (afgehandeld_op) on public.whatsapp_open to authenticated;

-- De Mac schrijft de rijen als de importrol.
grant select, insert, update, delete on public.whatsapp_open to oxpecker_import;
create policy "import: whatsapp open" on public.whatsapp_open for all to oxpecker_import using (true) with check (true);
