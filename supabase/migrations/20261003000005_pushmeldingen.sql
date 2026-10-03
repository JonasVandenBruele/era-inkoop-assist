-- Pushmeldingen: abonnementen per toestel en een logboek om dubbele meldingen te vermijden.
-- Meldingen bevatten standaard geen klantgegevens.

create table public.push_abonnementen (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  toestel text,
  aangemaakt_op timestamptz not null default now(),
  laatst_gelukt_op timestamptz,
  unique (eigenaar_id, endpoint)
);

-- Elke melding één keer: sleutel bv. "ochtend:2026-10-13" of "blok:2026-10-13:11:20".
create table public.verstuurde_meldingen (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null references auth.users (id) on delete cascade,
  sleutel text not null,
  verstuurd_op timestamptz not null default now(),
  unique (eigenaar_id, sleutel)
);

alter table public.push_abonnementen enable row level security;
alter table public.push_abonnementen force row level security;
create policy "eigen rijen lezen" on public.push_abonnementen for select to authenticated using (eigenaar_id = (select auth.uid()));
create policy "eigen rijen toevoegen" on public.push_abonnementen for insert to authenticated with check (eigenaar_id = (select auth.uid()));
create policy "eigen rijen wijzigen" on public.push_abonnementen for update to authenticated using (eigenaar_id = (select auth.uid())) with check (eigenaar_id = (select auth.uid()));
create policy "eigen rijen verwijderen" on public.push_abonnementen for delete to authenticated using (eigenaar_id = (select auth.uid()));

-- Het logboek wordt enkel door de meldingentaak (server) beschreven; gebruikers mogen het lezen.
alter table public.verstuurde_meldingen enable row level security;
alter table public.verstuurde_meldingen force row level security;
create policy "eigen rijen lezen" on public.verstuurde_meldingen for select to authenticated using (eigenaar_id = (select auth.uid()));

revoke all on public.push_abonnementen, public.verstuurde_meldingen from anon;
