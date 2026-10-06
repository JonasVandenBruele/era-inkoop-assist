-- Hooks en kanalen (6/10/2026): naast bellen ook flyer, brief, WhatsApp en langsgaan; en een AI-hook per contact.

-- ---------- Gepland kanaal van een taak uit ERAForce ----------
-- Uit het onderwerp of het type, bv. "langsgaan met flyer" → bezoek. Null bij administratieve taken.
alter table public.bronactiviteiten add column if not exists kanaal text
  check (kanaal in ('bellen', 'bericht', 'whatsapp', 'mail', 'flyer', 'brief', 'bezoek'));

-- ---------- Geregistreerde pogingen: ook flyer, brief en bezoek ----------
alter table public.belpogingen drop constraint if exists belpogingen_kanaal_check;
alter table public.belpogingen add constraint belpogingen_kanaal_check
  check (kanaal in ('telefoon', 'sms', 'whatsapp', 'mail', 'flyer', 'brief', 'bezoek'));

-- ---------- Hook van de dag per contact ----------
-- Gemaakt op de Mac (scripts/hooks-maken.ts, na elke mirror-run) met Claude, op basis van de evaluaties,
-- buurtfeiten uit de mirror en het nieuws. Er staan geen gegevens van andere klanten in: enkel de hook zelf.
create table if not exists public.contacthooks (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null,
  dag date not null,
  onderwerp text not null,
  detail text,
  openingszin text,
  kanaal text check (kanaal in ('bellen', 'bericht', 'whatsapp', 'mail', 'flyer', 'brief', 'bezoek')),
  kanaal_reden text,
  conceptbericht text,
  bronlinks jsonb not null default '[]'::jsonb,
  model text,
  aangemaakt_op timestamptz not null default now(),
  unique (eigenaar_id, contact_id, dag),
  foreign key (eigenaar_id, contact_id) references public.contacten (eigenaar_id, id) on delete cascade
);
create index if not exists contacthooks_dag on public.contacthooks (eigenaar_id, dag);

alter table public.contacthooks enable row level security;
create policy "eigen rijen lezen" on public.contacthooks for select to authenticated using (eigenaar_id = (select auth.uid()));
create policy "eigen rijen verwijderen" on public.contacthooks for delete to authenticated using (eigenaar_id = (select auth.uid()));

-- De import op de Mac schrijft de hooks, enkel voor contacten uit de mirror.
grant select, insert, update, delete on public.contacthooks to oxpecker_import;
create policy "import: hooks bij mirror-contacten" on public.contacthooks for all to oxpecker_import
  using (exists (select 1 from public.contacten c where c.id = contact_id and c.eigenaar_id = contacthooks.eigenaar_id and c.bron = 'eraforce_mirror'))
  with check (exists (select 1 from public.contacten c where c.id = contact_id and c.eigenaar_id = contacthooks.eigenaar_id and c.bron = 'eraforce_mirror'));

-- Vingerafdruk van wat Claude kreeg: een ongewijzigde context maakt de hook niet opnieuw (spaart het abonnement).
alter table public.contacthooks add column if not exists invoer_hash text;

-- Het hooks-script berekent de bellijst met dezelfde domeincode als de app. Daarvoor mag de importrol je eigen
-- belresultaten, keuzes en instellingen LEZEN (niet wijzigen), zodat hij weet wie er vandaag aan de beurt is.
grant select on public.belpogingen, public.opvolgacties, public.planningskeuzes, public.belverboden,
  public.contactvoorkeuren, public.waardehaken, public.instellingen to oxpecker_import;
create policy "import: lezen" on public.belpogingen for select to oxpecker_import using (not is_testdata);
create policy "import: lezen" on public.opvolgacties for select to oxpecker_import using (not is_testdata);
create policy "import: lezen" on public.planningskeuzes for select to oxpecker_import using (not is_testdata);
create policy "import: lezen" on public.belverboden for select to oxpecker_import using (not is_testdata);
create policy "import: lezen" on public.contactvoorkeuren for select to oxpecker_import using (not is_testdata);
create policy "import: lezen" on public.waardehaken for select to oxpecker_import using (not is_testdata);
create policy "import: lezen" on public.instellingen for select to oxpecker_import using (true);
