-- Fase 1: basistabellen van de Dagplanner.
-- Elke rij hoort bij één gebruiker (eigenaar_id). Row Level Security zorgt dat je enkel eigen rijen ziet en wijzigt.
-- Verwijzingen tussen tabellen gebruiken (eigenaar_id, id), zodat je nooit naar rijen van een andere gebruiker kunt verwijzen.

-- ---------- Bronnen en imports ----------

create table public.bronnen (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  soort text not null check (soort in ('crm', 'agenda', 'gesprekken')),
  adapter text not null check (adapter in ('fictief', 'eraforce_mirror', 'microsoft_graph', 'plaud', 'handmatig')),
  naam text not null,
  is_testdata boolean not null default false,
  laatst_succesvol_op timestamptz,
  laatste_fout text,
  aangemaakt_op timestamptz not null default now(),
  unique (eigenaar_id, soort, adapter)
);

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bron_id uuid not null references public.bronnen (id) on delete cascade,
  gestart_op timestamptz not null default now(),
  beeindigd_op timestamptz,
  status text not null default 'bezig' check (status in ('bezig', 'gelukt', 'mislukt')),
  aantal_nieuw int not null default 0,
  aantal_gewijzigd int not null default 0,
  aantal_ongewijzigd int not null default 0,
  aantal_genegeerd int not null default 0,
  fout text
);

-- ---------- Contacten, panden en relaties ----------

create table public.contacten (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- herkomst
  bron text not null default 'lokaal',
  extern_id text,
  gebeurd_op timestamptz,
  gewijzigd_in_bron_op timestamptz,
  geimporteerd_op timestamptz not null default now(),
  is_testdata boolean not null default false,
  -- inhoud
  aanhef text,
  voornaam text,
  achternaam text not null,
  telefoons jsonb not null default '[]'::jsonb,
  email text,
  straat text,
  postcode text,
  gemeente text,
  status_bron text not null default 'prospect' check (status_bron in ('nieuwe_lead', 'prospect', 'langetermijn')),
  fase_bron text check (fase_bron in ('koud', 'lauw', 'warm')),
  tijdshorizon_bron text,
  aanspreekvorm_bron text check (aanspreekvorm_bron in ('u', 'je')),
  herkomst_contact text,
  niet_bellen_bron boolean not null default false,
  aangemaakt_in_bron_op timestamptz,
  is_lokaal_tijdelijk boolean not null default false,
  unique (eigenaar_id, id)
);
create unique index contacten_bron_extern on public.contacten (eigenaar_id, bron, extern_id) where extern_id is not null;

create table public.panden (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bron text not null default 'lokaal',
  extern_id text,
  gebeurd_op timestamptz,
  gewijzigd_in_bron_op timestamptz,
  geimporteerd_op timestamptz not null default now(),
  is_testdata boolean not null default false,
  straat text not null,
  postcode text not null,
  gemeente text not null,
  type text not null default 'woning' check (type in ('woning', 'appartement', 'bouwgrond', 'handelspand', 'opbrengsteigendom', 'ander')),
  omschrijving text,
  unique (eigenaar_id, id)
);
create unique index panden_bron_extern on public.panden (eigenaar_id, bron, extern_id) where extern_id is not null;

create table public.contact_pand (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null,
  pand_id uuid not null,
  rol text not null check (rol in ('eigenaar', 'mede_eigenaar', 'beslisser', 'erfgenaam', 'huurder', 'ander')),
  is_testdata boolean not null default false,
  foreign key (eigenaar_id, contact_id) references public.contacten (eigenaar_id, id) on delete cascade,
  foreign key (eigenaar_id, pand_id) references public.panden (eigenaar_id, id) on delete cascade,
  unique (contact_id, pand_id, rol)
);

-- ---------- Bronactiviteiten en afspraken ----------

create table public.bronactiviteiten (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bron text not null,
  extern_id text,
  gebeurd_op timestamptz,
  gewijzigd_in_bron_op timestamptz,
  geimporteerd_op timestamptz not null default now(),
  is_testdata boolean not null default false,
  type text not null check (type in ('taak', 'notitie', 'evaluatie', 'gesprek')),
  contact_id uuid,
  pand_id uuid,
  taak_soort text check (taak_soort in ('terugbellen', 'algemeen')),
  vervalt_op date,
  vervalt_uur time,
  taak_afgerond boolean not null default false,
  auteur text,
  tekst text not null,
  inhoud_hash text,
  foreign key (eigenaar_id, contact_id) references public.contacten (eigenaar_id, id) on delete cascade,
  foreign key (eigenaar_id, pand_id) references public.panden (eigenaar_id, id) on delete set null (pand_id)
);
create unique index bronactiviteiten_bron_extern on public.bronactiviteiten (eigenaar_id, bron, extern_id) where extern_id is not null;
create index bronactiviteiten_contact on public.bronactiviteiten (eigenaar_id, contact_id);

create table public.afspraken (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bron text not null default 'lokaal',
  extern_id text,
  gebeurd_op timestamptz,
  gewijzigd_in_bron_op timestamptz,
  geimporteerd_op timestamptz not null default now(),
  is_testdata boolean not null default false,
  titel text not null,
  start_op timestamptz not null,
  einde_op timestamptz not null,
  hele_dag boolean not null default false,
  locatie text,
  contact_id uuid,
  koppel_status text not null default 'geen' check (koppel_status in ('bevestigd', 'voorgesteld', 'geen')),
  omschrijving text,
  check (einde_op >= start_op),
  foreign key (eigenaar_id, contact_id) references public.contacten (eigenaar_id, id) on delete set null (contact_id)
);
create unique index afspraken_bron_extern on public.afspraken (eigenaar_id, bron, extern_id) where extern_id is not null;
create index afspraken_start on public.afspraken (eigenaar_id, start_op);

-- ---------- Lokale belpogingen (import raakt deze nooit aan) ----------

create table public.belpogingen (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null,
  tijdstip timestamptz not null default now(),
  uitkomst text not null check (uitkomst in ('gesproken', 'geen_antwoord', 'terugbellen', 'afspraak', 'niet_meer_bellen')),
  is_inhoudelijk boolean not null,
  notitie text,
  volgende_stap text,
  ongedaan_op timestamptz,
  is_testdata boolean not null default false,
  aangemaakt_op timestamptz not null default now(),
  foreign key (eigenaar_id, contact_id) references public.contacten (eigenaar_id, id) on delete cascade
);
create index belpogingen_contact on public.belpogingen (eigenaar_id, contact_id, tijdstip desc);

-- ---------- Instellingen (één document per gebruiker) ----------

create table public.instellingen (
  eigenaar_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  document jsonb not null default '{}'::jsonb,
  bijgewerkt_op timestamptz not null default now()
);

-- ---------- Row Level Security ----------

do $$
declare t text;
begin
  foreach t in array array['bronnen', 'import_runs', 'contacten', 'panden', 'contact_pand', 'bronactiviteiten', 'afspraken', 'belpogingen', 'instellingen']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$create policy "eigen rijen lezen" on public.%I for select to authenticated using (eigenaar_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "eigen rijen toevoegen" on public.%I for insert to authenticated with check (eigenaar_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "eigen rijen wijzigen" on public.%I for update to authenticated using (eigenaar_id = (select auth.uid())) with check (eigenaar_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "eigen rijen verwijderen" on public.%I for delete to authenticated using (eigenaar_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- Anonieme bezoekers (niet ingelogd) krijgen geen enkele toegang.
revoke all on all tables in schema public from anon;
