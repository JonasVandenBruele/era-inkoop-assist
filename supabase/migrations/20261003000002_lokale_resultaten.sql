-- Fase 3: lokale resultaten, planningskeuzes, dagplan en Donna-overzicht.
-- Deze tabellen bevatten enkel JOUW gegevens. Een import uit een bron raakt ze nooit aan.

-- Koppeling naar de belpoging waaruit een record ontstond, zodat "ongedaan maken" alles in één keer terugdraait.
alter table public.afspraken add column belpoging_id uuid references public.belpogingen (id) on delete set null;

-- ---------- Belverboden ----------
create table public.belverboden (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null,
  reden text,
  belpoging_id uuid references public.belpogingen (id) on delete set null,
  aangemaakt_op timestamptz not null default now(),
  ingetrokken_op timestamptz,
  is_testdata boolean not null default false,
  foreign key (eigenaar_id, contact_id) references public.contacten (eigenaar_id, id) on delete cascade
);
create index belverboden_contact on public.belverboden (eigenaar_id, contact_id);

-- ---------- Opvolgacties en lokale terugbelafspraken ----------
create table public.opvolgacties (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null,
  soort text not null check (soort in ('terugbellen', 'vervolgstap')),
  dag date not null,
  uur time,
  omschrijving text,
  status text not null default 'open' check (status in ('open', 'afgehandeld', 'vervallen')),
  belpoging_id uuid references public.belpogingen (id) on delete set null,
  aangemaakt_op timestamptz not null default now(),
  is_testdata boolean not null default false,
  foreign key (eigenaar_id, contact_id) references public.contacten (eigenaar_id, id) on delete cascade
);
create index opvolgacties_contact on public.opvolgacties (eigenaar_id, contact_id, dag);

-- ---------- Planningskeuzes (vastpinnen, overslaan, uitstellen) ----------
create table public.planningskeuzes (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null,
  soort text not null check (soort in ('vastpinnen', 'vandaag_overslaan', 'uitstellen')),
  voor_dag date,
  tot_dag date,
  aangemaakt_op timestamptz not null default now(),
  ongedaan_op timestamptz,
  is_testdata boolean not null default false,
  check ((soort = 'uitstellen') = (tot_dag is not null)),
  foreign key (eigenaar_id, contact_id) references public.contacten (eigenaar_id, id) on delete cascade
);
create index planningskeuzes_contact on public.planningskeuzes (eigenaar_id, contact_id);

-- ---------- Dagplan: de lijst zoals ze 's morgens werd vastgelegd ----------
create table public.dagplannen (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dag date not null,
  contact_ids uuid[] not null,
  uitleg jsonb not null default '{}'::jsonb,
  aangemaakt_op timestamptz not null default now(),
  is_testdata boolean not null default false,
  unique (eigenaar_id, dag)
);

-- ---------- Donna-overzicht ----------
create table public.donna_overzichten (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dag date not null,
  tekst text not null,
  belpoging_ids uuid[] not null default '{}',
  status text not null default 'klaargezet' check (status in ('klaargezet', 'doorgegeven')),
  klaargezet_op timestamptz not null default now(),
  doorgegeven_op timestamptz,
  is_testdata boolean not null default false,
  unique (eigenaar_id, dag)
);

-- ---------- Row Level Security ----------
do $$
declare t text;
begin
  foreach t in array array['belverboden', 'opvolgacties', 'planningskeuzes', 'dagplannen', 'donna_overzichten']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$create policy "eigen rijen lezen" on public.%I for select to authenticated using (eigenaar_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "eigen rijen toevoegen" on public.%I for insert to authenticated with check (eigenaar_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "eigen rijen wijzigen" on public.%I for update to authenticated using (eigenaar_id = (select auth.uid())) with check (eigenaar_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "eigen rijen verwijderen" on public.%I for delete to authenticated using (eigenaar_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

revoke all on public.belverboden, public.opvolgacties, public.planningskeuzes, public.dagplannen, public.donna_overzichten from anon;
