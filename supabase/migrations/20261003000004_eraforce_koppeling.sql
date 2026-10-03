-- Handmatige koppeling van een contact aan een ERAForce-record (Salesforce-ID), bv. voor testcontacten
-- of tijdelijke contacten vóór de mirror er is. Enkel het ID; geen andere ERAForce-gegevens.
create table public.eraforce_koppelingen (
  id uuid primary key default gen_random_uuid(),
  eigenaar_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_id uuid not null,
  salesforce_id text not null check (salesforce_id ~ '^[a-zA-Z0-9]{15}([a-zA-Z0-9]{3})?$'),
  aangemaakt_op timestamptz not null default now(),
  is_testdata boolean not null default false,
  unique (eigenaar_id, contact_id),
  foreign key (eigenaar_id, contact_id) references public.contacten (eigenaar_id, id) on delete cascade
);

alter table public.eraforce_koppelingen enable row level security;
alter table public.eraforce_koppelingen force row level security;
create policy "eigen rijen lezen" on public.eraforce_koppelingen for select to authenticated using (eigenaar_id = (select auth.uid()));
create policy "eigen rijen toevoegen" on public.eraforce_koppelingen for insert to authenticated with check (eigenaar_id = (select auth.uid()));
create policy "eigen rijen wijzigen" on public.eraforce_koppelingen for update to authenticated using (eigenaar_id = (select auth.uid())) with check (eigenaar_id = (select auth.uid()));
create policy "eigen rijen verwijderen" on public.eraforce_koppelingen for delete to authenticated using (eigenaar_id = (select auth.uid()));
revoke all on public.eraforce_koppelingen from anon;
