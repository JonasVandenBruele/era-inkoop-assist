-- Fase 3b: contactstrategie (ossenpikker): kanalen, contactvoorkeuren en waardehaken.

-- Belpogingen worden contactmomenten: ook berichtjes en mails, en een ontvangen reactie.
alter table public.belpogingen add column kanaal text not null default 'telefoon' check (kanaal in ('telefoon', 'sms', 'whatsapp', 'mail'));
alter table public.belpogingen drop constraint belpogingen_uitkomst_check;
alter table public.belpogingen add constraint belpogingen_uitkomst_check
  check (uitkomst in ('gesproken', 'geen_antwoord', 'terugbellen', 'afspraak', 'niet_meer_bellen', 'bericht_verstuurd', 'reactie'));

-- ---------- Contactvoorkeuren (één per contact) ----------
create table public.contactvoorkeuren (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null,
  kanaal text not null default 'geen' check (kanaal in ('geen', 'bellen', 'bericht', 'mail')),
  niet_voor time,
  niet_na time,
  notitie text,
  bijgewerkt_op timestamptz not null default now(),
  is_testdata boolean not null default false,
  unique (eigenaar_id, contact_id),
  foreign key (eigenaar_id, contact_id) references public.contacten (eigenaar_id, id) on delete cascade
);

-- ---------- Waardehaken ----------
-- Een haak geldt voor een contact, een pand, een straat in een gemeente, of algemeen (alles leeg).
create table public.waardehaken (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid,
  pand_id uuid,
  straat text,
  gemeente text,
  soort text not null check (soort in ('buurt', 'dossier', 'algemeen', 'persoonlijk')),
  onderwerp text not null,
  detail text,
  bron text,
  geldig_vanaf date not null default current_date,
  geldig_tot date,
  gevoelig boolean not null default false,
  aangemaakt_op timestamptz not null default now(),
  is_testdata boolean not null default false,
  check (geldig_tot is null or geldig_tot >= geldig_vanaf),
  foreign key (eigenaar_id, contact_id) references public.contacten (eigenaar_id, id) on delete cascade,
  foreign key (eigenaar_id, pand_id) references public.panden (eigenaar_id, id) on delete cascade
);
create index waardehaken_contact on public.waardehaken (eigenaar_id, contact_id);

-- ---------- Row Level Security ----------
do $$
declare t text;
begin
  foreach t in array array['contactvoorkeuren', 'waardehaken']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$create policy "eigen rijen lezen" on public.%I for select to authenticated using (eigenaar_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "eigen rijen toevoegen" on public.%I for insert to authenticated with check (eigenaar_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "eigen rijen wijzigen" on public.%I for update to authenticated using (eigenaar_id = (select auth.uid())) with check (eigenaar_id = (select auth.uid()))$p$, t);
    execute format($p$create policy "eigen rijen verwijderen" on public.%I for delete to authenticated using (eigenaar_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

revoke all on public.contactvoorkeuren, public.waardehaken from anon;
