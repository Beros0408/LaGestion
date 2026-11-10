-- 016_multi_entreprises.sql — LaGestion
-- Vérifie le changement d'entreprise à deux entreprises (migration 016) :
--   - contrainte entreprises_logo_dossier présente et validée ; chemin d'une autre entreprise, URL, « .. »,
--     extension inconnue : refusés ; chemin du dossier de l'entreprise et logo vide : acceptés ;
--   - U, membre de A (admin) et de B (commercial), lit les deux ; V, membre de A seulement, ne lit rien de B ;
--   - écriture par id avec le filtre entreprise_id de l'autre entreprise : 0 ligne (filtre ajouté côté navigateur) ;
--   - V ne modifie ni ne supprime une donnée de B ; U, commercial dans B, ne modifie pas l'entreprise B ;
--   - create_entreprise : U devient admin de la nouvelle entreprise, V n'y voit rien.
-- La garde de la migration (arrêt si un chemin existant est hors dossier) est vérifiée par son rejeu sur une base de test.
-- À lancer après migrations/016_multi_entreprises.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0160…) : U …0001, V …0002, entreprise A …00e1, entreprise B …00e2,
-- client de A …00c1, client de B …00c2.

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role) values
  ('a0160000-0000-4000-8000-000000000001', 'test-016-u@lagestion.invalid', 'authenticated', 'authenticated'),
  ('a0160000-0000-4000-8000-000000000002', 'test-016-v@lagestion.invalid', 'authenticated', 'authenticated');
insert into public.entreprises (id, nom) values
  ('a0160000-0000-4000-8000-0000000000e1', 'Entreprise A (test 016)'),
  ('a0160000-0000-4000-8000-0000000000e2', 'Entreprise B (test 016)');
insert into public.memberships (entreprise_id, user_id, role) values
  ('a0160000-0000-4000-8000-0000000000e1', 'a0160000-0000-4000-8000-000000000001', 'admin'),
  ('a0160000-0000-4000-8000-0000000000e2', 'a0160000-0000-4000-8000-000000000001', 'commercial'),
  ('a0160000-0000-4000-8000-0000000000e1', 'a0160000-0000-4000-8000-000000000002', 'commercial');
insert into public.clients (id, entreprise_id, nom, type) values
  ('a0160000-0000-4000-8000-0000000000c1', 'a0160000-0000-4000-8000-0000000000e1', 'Client de A (test 016)', 'entreprise'),
  ('a0160000-0000-4000-8000-0000000000c2', 'a0160000-0000-4000-8000-0000000000e2', 'Client de B (test 016)', 'entreprise');

create function public._t016_refuse(p_sql text, p_extrait text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_extrait in sqlerrm) = 0 then
      raise exception 'ÉCHEC : message inattendu pour « % » : %', p_sql, sqlerrm;
    end if;
    return;
  end;
  raise exception 'ÉCHEC : refus attendu pour « % »', p_sql;
end $$;
grant execute on function public._t016_refuse(text, text) to authenticated;

-- Nombre de lignes touchées par une écriture (0 = refus silencieux de la RLS ou du filtre).
create function public._t016_lignes(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public._t016_lignes(text) to authenticated;

-- 2. Contrainte
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'entreprises_logo_dossier' and contype = 'c' and convalidated) then
    raise exception 'ÉCHEC : contrainte entreprises_logo_dossier absente ou non validée';
  end if;
end $$;

-- 3. U, admin de A : logo de A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0160000-0000-4000-8000-000000000001","role":"authenticated"}', true);

do $$
declare
  v text;
begin
  foreach v in array array[
    'a0160000-0000-4000-8000-0000000000e2/logo-1.png',            -- dossier de B
    'https://exemple.invalid/logo.png',                           -- URL
    'a0160000-0000-4000-8000-0000000000e1/../a0160000-0000-4000-8000-0000000000e2/logo-1.png',
    'a0160000-0000-4000-8000-0000000000e1/logo-1.gif',            -- extension
    'a0160000-0000-4000-8000-0000000000e1/logo-abc.png',          -- horodatage
    'A0160000-0000-4000-8000-0000000000E1/logo-1.png',            -- casse
    '/a0160000-0000-4000-8000-0000000000e1/logo-1.png'
  ] loop
    perform public._t016_refuse(format($q$update public.entreprises set logo_url = %L
      where id = 'a0160000-0000-4000-8000-0000000000e1'$q$, v), 'entreprises_logo_dossier');
  end loop;

  if public._t016_lignes($q$update public.entreprises set logo_url = 'a0160000-0000-4000-8000-0000000000e1/logo-1731250000000.jpg'
       where id = 'a0160000-0000-4000-8000-0000000000e1'$q$) <> 1 then
    raise exception 'ÉCHEC : chemin du dossier de A refusé';
  end if;
  if public._t016_lignes($q$update public.entreprises set logo_url = null
       where id = 'a0160000-0000-4000-8000-0000000000e1'$q$) <> 1 then
    raise exception 'ÉCHEC : retrait du logo de A refusé';
  end if;

  -- U lit A et B ; une écriture filtrée sur l'autre entreprise ne touche rien.
  if (select count(*) from public.clients where id in ('a0160000-0000-4000-8000-0000000000c1', 'a0160000-0000-4000-8000-0000000000c2')) <> 2 then
    raise exception 'ÉCHEC : U ne lit pas les clients de ses deux entreprises';
  end if;
  if public._t016_lignes($q$update public.clients set notes = 'x' where id = 'a0160000-0000-4000-8000-0000000000c2'
       and entreprise_id = 'a0160000-0000-4000-8000-0000000000e1'$q$) <> 0 then
    raise exception 'ÉCHEC : écriture sur le client de B avec le filtre de A';
  end if;
  if public._t016_lignes($q$update public.clients set notes = 'x' where id = 'a0160000-0000-4000-8000-0000000000c2'
       and entreprise_id = 'a0160000-0000-4000-8000-0000000000e2'$q$) <> 1 then
    raise exception 'ÉCHEC : U, commercial dans B, ne modifie pas un client de B';
  end if;

  -- Commercial dans B : l'entreprise B reste réservée à son admin.
  if public._t016_lignes($q$update public.entreprises set nom = 'Renommée'
       where id = 'a0160000-0000-4000-8000-0000000000e2'$q$) <> 0 then
    raise exception 'ÉCHEC : U, commercial dans B, modifie l''entreprise B';
  end if;
end $$;

-- 4. V, membre de A seulement
select set_config('request.jwt.claims', '{"sub":"a0160000-0000-4000-8000-000000000002","role":"authenticated"}', true);

do $$
begin
  if (select count(*) from public.clients where entreprise_id = 'a0160000-0000-4000-8000-0000000000e2') <> 0
     or (select count(*) from public.entreprises where id = 'a0160000-0000-4000-8000-0000000000e2') <> 0
     or (select count(*) from public.memberships where entreprise_id = 'a0160000-0000-4000-8000-0000000000e2') <> 0 then
    raise exception 'ÉCHEC : V lit des données de B';
  end if;
  if public._t016_lignes($q$update public.clients set notes = 'x' where id = 'a0160000-0000-4000-8000-0000000000c2'$q$) <> 0
     or public._t016_lignes($q$update public.clients set deleted_at = now() where id = 'a0160000-0000-4000-8000-0000000000c2'$q$) <> 0 then
    raise exception 'ÉCHEC : V modifie un client de B';
  end if;
  if (select count(*) from public.clients where id = 'a0160000-0000-4000-8000-0000000000c1') <> 1 then
    raise exception 'ÉCHEC : V ne lit pas le client de A';
  end if;
end $$;

-- 5. U crée une troisième entreprise
select set_config('request.jwt.claims', '{"sub":"a0160000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('t016.nouvelle', public.create_entreprise('Entreprise C (test 016)', null)::text, true);

do $$
declare
  v_id uuid := current_setting('t016.nouvelle')::uuid;
begin
  if (select role from public.memberships
       where entreprise_id = v_id and user_id = 'a0160000-0000-4000-8000-000000000001') is distinct from 'admin' then
    raise exception 'ÉCHEC : U n''est pas admin de l''entreprise créée';
  end if;
  if (select count(*) from public.memberships where entreprise_id = v_id) <> 1 then
    raise exception 'ÉCHEC : l''entreprise créée a d''autres membres que U';
  end if;
end $$;

select set_config('request.jwt.claims', '{"sub":"a0160000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.entreprises where id = current_setting('t016.nouvelle')::uuid) <> 0 then
    raise exception 'ÉCHEC : V lit l''entreprise créée par U';
  end if;
end $$;

reset role;
rollback;
