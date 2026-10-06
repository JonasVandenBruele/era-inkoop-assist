-- Te koop gezet (6/10/2026): de woning van een contact staat te koop, zelf (particulier) of via een andere makelaar.
-- Gevonden op de Mac (scripts/marktsignalen.ts, na elke mirror-run) via Immoweb en de Marketpulse-prospects in de
-- mirror, op het genormaliseerde adres (postcode beslist, de gemeentenaam telt niet). De dag erna stuurt Jonas een
-- bericht met veel succes; de app zet zo iemand bovenaan (groep "Te koop gezet").
-- Er staan enkel gegevens van de advertentie zelf in (prijs, datum, link, kantoor), geen andere klanten.
create table if not exists public.marktsignalen (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null,
  bron text not null check (bron in ('immoweb', 'marketpulse')),
  extern_id text not null,
  verkoper text check (verkoper in ('particulier', 'makelaar', 'notaris')),
  makelaar text,
  vraagprijs integer,
  online_sinds date,
  url text,
  overeenkomst text not null default 'adres' check (overeenkomst in ('adres', 'gebouw')),
  status text not null default 'te_koop' check (status in ('te_koop', 'onder_optie', 'verkocht', 'weg')),
  eerst_gezien_op timestamptz not null default now(),
  laatst_gezien_op timestamptz not null default now(),
  afgehandeld_op timestamptz,
  unique (eigenaar_id, contact_id, bron, extern_id),
  foreign key (eigenaar_id, contact_id) references public.contacten (eigenaar_id, id) on delete cascade
);
create index if not exists marktsignalen_contact on public.marktsignalen (eigenaar_id, contact_id);

alter table public.marktsignalen enable row level security;
create policy "eigen rijen lezen" on public.marktsignalen for select to authenticated using (eigenaar_id = (select auth.uid()));
-- Jonas mag enkel "afgehandeld" zetten (knop "Niets sturen").
create policy "eigen rijen afhandelen" on public.marktsignalen for update to authenticated
  using (eigenaar_id = (select auth.uid())) with check (eigenaar_id = (select auth.uid()));
grant select on public.marktsignalen to authenticated;
grant update (afgehandeld_op) on public.marktsignalen to authenticated;

-- De Mac schrijft de signalen als de importrol, enkel bij contacten uit de mirror.
grant select, insert, update, delete on public.marktsignalen to oxpecker_import;
create policy "import: signalen bij mirror-contacten" on public.marktsignalen for all to oxpecker_import
  using (exists (select 1 from public.contacten c where c.id = contact_id and c.eigenaar_id = marktsignalen.eigenaar_id and c.bron = 'eraforce_mirror'))
  with check (exists (select 1 from public.contacten c where c.id = contact_id and c.eigenaar_id = marktsignalen.eigenaar_id and c.bron = 'eraforce_mirror'));
