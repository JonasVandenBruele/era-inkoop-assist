-- Fase 8: echte gegevens uit de ERAForce-mirror (op Jonas' SSD) in Oxpecker.
-- Enkel wat op de gebruiker van toepassing is: zijn leads, de gekoppelde contacten, zijn taken en afspraken (besluit 5/10/2026).

-- ---------- Extra statussen en labels uit ERAForce ----------
-- beeindigd: lead afgesloten in ERAForce; relatie: contact (geen prospect), bv. verkoper of kandidaat.
-- Beide verschijnen enkel op de bellijst als er een terugbeltaak openstaat.
alter table public.contacten drop constraint if exists contacten_status_bron_check;
alter table public.contacten add constraint contacten_status_bron_check
  check (status_bron in ('nieuwe_lead', 'prospect', 'langetermijn', 'beeindigd', 'relatie'));
alter table public.contacten add column if not exists status_label_bron text;   -- bv. "In Opvolging"
alter table public.bronactiviteiten add column if not exists soort_label text;  -- bv. "Uitgaande Oproep"
alter table public.afspraken add column if not exists soort_label text;         -- bv. "Afspraak prospect schatting op locatie"

-- ---------- Importgebruiker ----------
-- De import op de Mac meldt zich aan als deze rol (wachtwoord via het GitHub-geheim MIRROR_IMPORT_PASSWORD,
-- gezet door de publicatieworkflow). Hij mag enkel rijen met bron 'eraforce_mirror' lezen en schrijven;
-- lokale gegevens (belpogingen, keuzes, hooks, ...) en testdata kan hij niet aanraken.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'oxpecker_import') then
    create role oxpecker_import nologin;
  end if;
end $$;

grant usage on schema public to oxpecker_import;
grant select, insert, update, delete on public.bronnen, public.import_runs, public.contacten, public.bronactiviteiten, public.afspraken to oxpecker_import;

create policy "import: mirror-bron" on public.bronnen for all to oxpecker_import
  using (adapter = 'eraforce_mirror') with check (adapter = 'eraforce_mirror');
create policy "import: runs van de mirror" on public.import_runs for all to oxpecker_import
  using (exists (select 1 from public.bronnen b where b.id = bron_id and b.adapter = 'eraforce_mirror'))
  with check (exists (select 1 from public.bronnen b where b.id = bron_id and b.adapter = 'eraforce_mirror'));
create policy "import: mirror-contacten" on public.contacten for all to oxpecker_import
  using (bron = 'eraforce_mirror' and not is_testdata) with check (bron = 'eraforce_mirror' and not is_testdata);
create policy "import: mirror-activiteiten" on public.bronactiviteiten for all to oxpecker_import
  using (bron = 'eraforce_mirror' and not is_testdata) with check (bron = 'eraforce_mirror' and not is_testdata);
create policy "import: mirror-afspraken" on public.afspraken for all to oxpecker_import
  using (bron = 'eraforce_mirror' and not is_testdata) with check (bron = 'eraforce_mirror' and not is_testdata);

-- De import zoekt de Oxpecker-gebruiker op via zijn e-mailadres (zonder verder toegang tot auth.users).
create or replace function public.import_eigenaar(p_email text) returns uuid
  language sql stable security definer set search_path = ''
  as $$ select id from auth.users where lower(email) = lower(p_email) $$;
revoke all on function public.import_eigenaar(text) from public;
grant execute on function public.import_eigenaar(text) to oxpecker_import;

-- ---------- Opruimen (op vraag van Jonas): handmatige ERAForce-koppelingen ----------
-- Vervangen door de ERAForce-ID's uit de mirror. De tabel verdwijnt enkel als er geen echte koppelingen in staan.
do $$
begin
  if to_regclass('public.eraforce_koppelingen') is not null
     and not exists (select 1 from public.eraforce_koppelingen where not is_testdata) then
    drop table public.eraforce_koppelingen;
  end if;
end $$;
