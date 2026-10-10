-- Verkoopmodule — gedeelde DEMO-opslag (10/10/2026). Uitsluitend fictieve demogegevens.
-- Volledig gescheiden van de productiegegevens van Oxpecker:
--  * eigen schema verkoop_demo; de app (anon/authenticated) heeft er GEEN rechten op en PostgREST stelt het niet bloot;
--  * enkel drie functies (laden, bewaren, reset) zijn aanroepbaar, en alleen met een geldige toegangscode;
--  * die functies raken enkel verkoop_demo.records van de omgeving die bij de code hoort, nooit public.*.
-- De toegangscode zelf staat niet in deze repository, enkel de SHA-256-hash ervan.

create schema if not exists verkoop_demo;
revoke all on schema verkoop_demo from public;

create table verkoop_demo.toegang (
  code_hash text primary key,
  omgeving text not null,
  omschrijving text,
  actief boolean not null default true,
  aangemaakt_op timestamptz not null default now()
);

create table verkoop_demo.records (
  omgeving text not null,
  soort text not null,
  id text not null,
  data jsonb not null,
  versie int not null default 1,
  bijgewerkt_op timestamptz not null default now(),
  bijgewerkt_door text,
  primary key (omgeving, soort, id)
);

create table verkoop_demo.gebeurtenissen (
  id bigint generated always as identity primary key,
  omgeving text not null,
  wat text not null,
  door text,
  op timestamptz not null default now()
);

revoke all on all tables in schema verkoop_demo from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema verkoop_demo from anon, authenticated';
    execute 'revoke all on all tables in schema verkoop_demo from anon, authenticated';
  end if;
end $$;
alter table verkoop_demo.toegang enable row level security;
alter table verkoop_demo.records enable row level security;
alter table verkoop_demo.gebeurtenissen enable row level security;

-- Toegangscode van de demo (gedeeld via de link; hash van een willekeurige code van 12 tekens).
insert into verkoop_demo.toegang (code_hash, omgeving, omschrijving)
values ('26803c894d320876246f55461ce8a67250db41687af6d28bdaec8e8e1ecca52e', 'demo', 'Demo verkoopmodule voor Jonas en Nicolas');

-- ---------------------------------------------------------------- hulpfunctie (niet aanroepbaar door de app)

create function verkoop_demo.omgeving_voor(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v text;
begin
  select t.omgeving into v from verkoop_demo.toegang t
  where t.actief and t.code_hash = encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex');
  if v is null then
    raise exception 'Ongeldige toegangscode' using errcode = '28000';
  end if;
  return v;
end $$;
revoke all on function verkoop_demo.omgeving_voor(text) from public;

-- ---------------------------------------------------------------- laden

create function public.verkoop_demo_laad(p_code text)
returns table (soort text, id text, data jsonb, versie int, bijgewerkt_op timestamptz, bijgewerkt_door text)
language plpgsql security definer set search_path = '' as $$
declare
  v_omg text := verkoop_demo.omgeving_voor(p_code);
begin
  return query
    select r.soort, r.id, r.data, r.versie, r.bijgewerkt_op, r.bijgewerkt_door
    from verkoop_demo.records r where r.omgeving = v_omg;
end $$;

-- ---------------------------------------------------------------- bewaren (alles of niets, met versiecontrole)

create function public.verkoop_demo_bewaar(p_code text, p_door text, p_wijzigingen jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_omg text := verkoop_demo.omgeving_voor(p_code);
  w jsonb;
  v_huidig int;
  v_conflicten jsonb := '[]'::jsonb;
  v_aantal int;
  v_soorten text[] := array['kwalificatie', 'criterium', 'zoekopdracht_status', 'notitie', 'inzicht', 'vrijgave', 'kenmerk', 'prijs',
    'prijsoordeel', 'campagne', 'actie', 'contactmoment', 'afwijzing', 'contactverbod', 'instellingen', 'nazorg'];
begin
  if jsonb_typeof(p_wijzigingen) is distinct from 'array' or jsonb_array_length(p_wijzigingen) > 60 then
    raise exception 'Ongeldige of te grote wijziging';
  end if;
  -- Gelijktijdige bewaaracties van dezelfde omgeving lopen na elkaar: de versiecontrole is dan sluitend.
  perform pg_advisory_xact_lock(hashtext('verkoop_demo:' || v_omg));

  for w in select * from jsonb_array_elements(p_wijzigingen) loop
    if not ((w->>'soort') = any (v_soorten)) or length(coalesce(w->>'id', '')) not between 1 and 200
       or w->'data' is null or pg_column_size(w->'data') > 32768 then
      raise exception 'Ongeldige wijziging';
    end if;
    select r.versie into v_huidig from verkoop_demo.records r
    where r.omgeving = v_omg and r.soort = w->>'soort' and r.id = w->>'id';
    if (w->'verwachte_versie' is null or jsonb_typeof(w->'verwachte_versie') = 'null') then
      if v_huidig is not null then
        v_conflicten := v_conflicten || jsonb_build_object('soort', w->>'soort', 'id', w->>'id');
      end if;
    elsif v_huidig is distinct from (w->>'verwachte_versie')::int then
      v_conflicten := v_conflicten || jsonb_build_object('soort', w->>'soort', 'id', w->>'id');
    end if;
  end loop;
  if jsonb_array_length(v_conflicten) > 0 then
    return v_conflicten;
  end if;

  select count(*) into v_aantal from verkoop_demo.records r where r.omgeving = v_omg;
  if v_aantal + jsonb_array_length(p_wijzigingen) > 5000 then
    raise exception 'De demo-opslag is vol. Stel de demo opnieuw in.';
  end if;

  for w in select * from jsonb_array_elements(p_wijzigingen) loop
    insert into verkoop_demo.records as r (omgeving, soort, id, data, versie, bijgewerkt_op, bijgewerkt_door)
    values (v_omg, w->>'soort', w->>'id', w->'data', 1, now(), left(p_door, 40))
    on conflict (omgeving, soort, id) do update
      set data = excluded.data, versie = r.versie + 1, bijgewerkt_op = now(), bijgewerkt_door = excluded.bijgewerkt_door;
  end loop;
  return '[]'::jsonb;
end $$;

-- ---------------------------------------------------------------- reset (enkel demoresultaten van deze omgeving)

create function public.verkoop_demo_reset(p_code text, p_door text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_omg text := verkoop_demo.omgeving_voor(p_code);
begin
  perform pg_advisory_xact_lock(hashtext('verkoop_demo:' || v_omg));
  delete from verkoop_demo.records r where r.omgeving = v_omg;
  insert into verkoop_demo.gebeurtenissen (omgeving, wat, door) values (v_omg, 'reset', left(p_door, 40));
end $$;

revoke all on function public.verkoop_demo_laad(text) from public;
revoke all on function public.verkoop_demo_bewaar(text, text, jsonb) from public;
revoke all on function public.verkoop_demo_reset(text, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.verkoop_demo_laad(text) to anon, authenticated';
    execute 'grant execute on function public.verkoop_demo_bewaar(text, text, jsonb) to anon, authenticated';
    execute 'grant execute on function public.verkoop_demo_reset(text, text) to anon, authenticated';
  end if;
end $$;
