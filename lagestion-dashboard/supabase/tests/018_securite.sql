-- 018_securite.sql — LaGestion
-- Vérifie la migration 018 (sécurité des comptes) :
--   - utilisateur avec facteur TOTP vérifié, session aal1 : aucune ligne lue (tables métier, profils, appartenances),
--     aucune écriture, actions admin, liste de l'équipe, création d'entreprise et acceptation d'invitation refusées,
--     accès suspendus masqués ;
--   - même utilisateur en aal2 : tout redevient permis ;
--   - sans facteur vérifié (aucun, ou seulement non vérifié) : aucun changement en aal1 ;
--   - le facteur d'un collègue ne change rien pour les autres ;
--   - visiteur anonyme : aperçu d'une invitation toujours possible ;
--   - politique restrictive exige_aal2 sur chaque table de public sous RLS ;
--   - profiles.role et profiles.entreprise_id supprimées.
-- À lancer après migrations/018_securite_comptes.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0180…) : M …0001 (admin de E, facteur vérifié, suspendu dans F),
-- S …0002 (admin de E, sans facteur), N …0003 (commercial de E, facteur non vérifié) ;
-- entreprises E …00e1, F …00e2 ; client …00c1.

begin;

-- Banc local sans Supabase Auth complet : table des facteurs simulée dans cette transaction, à la forme de Supabase.
-- Sur Supabase la table existe : aucune instruction n'est alors exécutée dans le schéma auth (création interdite).
do $$
begin
  if to_regclass('auth.mfa_factors') is null then
    if to_regtype('auth.factor_type') is null then
      create type auth.factor_type as enum ('totp', 'webauthn', 'phone');
    end if;
    if to_regtype('auth.factor_status') is null then
      create type auth.factor_status as enum ('unverified', 'verified');
    end if;
    create table auth.mfa_factors (
      id uuid not null primary key,
      user_id uuid not null references auth.users (id) on delete cascade,
      friendly_name text,
      factor_type auth.factor_type not null,
      status auth.factor_status not null,
      created_at timestamptz not null,
      updated_at timestamptz not null,
      secret text
    );
  end if;
end $$;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('a0180000-0000-4000-8000-000000000001', 'test-018-m@lagestion.invalid', 'authenticated', 'authenticated', now()),
  ('a0180000-0000-4000-8000-000000000002', 'test-018-s@lagestion.invalid', 'authenticated', 'authenticated', now()),
  ('a0180000-0000-4000-8000-000000000003', 'test-018-n@lagestion.invalid', 'authenticated', 'authenticated', now());
-- Colonnes obligatoires de Supabase renseignées (id, dates) ; type et statut : littéraux convertis en types énumérés.
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values
  ('a0180000-0000-4000-8000-0000000000f1', 'a0180000-0000-4000-8000-000000000001', 'Téléphone', 'totp', 'verified', now(), now()),
  ('a0180000-0000-4000-8000-0000000000f3', 'a0180000-0000-4000-8000-000000000003', 'Inachevé', 'totp', 'unverified', now(), now());
insert into public.profiles (id, nom) values
  ('a0180000-0000-4000-8000-000000000001', 'Admin MFA'),
  ('a0180000-0000-4000-8000-000000000002', 'Admin Sans'),
  ('a0180000-0000-4000-8000-000000000003', 'Commercial Inachevé');
insert into public.entreprises (id, nom) values
  ('a0180000-0000-4000-8000-0000000000e1', 'Entreprise E (test 018)'),
  ('a0180000-0000-4000-8000-0000000000e2', 'Entreprise F (test 018)');
insert into public.memberships (entreprise_id, user_id, role) values
  ('a0180000-0000-4000-8000-0000000000e1', 'a0180000-0000-4000-8000-000000000001', 'admin'),
  ('a0180000-0000-4000-8000-0000000000e1', 'a0180000-0000-4000-8000-000000000002', 'admin'),
  ('a0180000-0000-4000-8000-0000000000e1', 'a0180000-0000-4000-8000-000000000003', 'commercial'),
  ('a0180000-0000-4000-8000-0000000000e2', 'a0180000-0000-4000-8000-000000000001', 'commercial'),
  ('a0180000-0000-4000-8000-0000000000e2', 'a0180000-0000-4000-8000-000000000002', 'admin');
update public.memberships set statut = 'suspendu', suspendu_le = now()
 where entreprise_id = 'a0180000-0000-4000-8000-0000000000e2' and user_id = 'a0180000-0000-4000-8000-000000000001';
insert into public.clients (id, entreprise_id, nom, type) values
  ('a0180000-0000-4000-8000-0000000000c1', 'a0180000-0000-4000-8000-0000000000e1', 'Client de E (test 018)', 'entreprise');
insert into public.invitations (entreprise_id, email, role, token) values
  ('a0180000-0000-4000-8000-0000000000e1', 'test-018-m@lagestion.invalid', 'manager', 'a0180000-0000-4000-8000-0000000000a1');

create function public._t018_refuse(p_sql text, p_extrait text) returns void
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
grant execute on function public._t018_refuse(text, text) to authenticated, anon;

create function public._t018_lignes(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public._t018_lignes(text) to authenticated;

-- Jeton simulé : utilisateur et niveau d'assurance (aal1 après le mot de passe, aal2 après le code).
create function public._t018_en(p_user text, p_aal text) returns void
language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated","aal":"%s"}', p_user, p_aal), true);
$$;
grant execute on function public._t018_en(text, text) to authenticated, anon;

-- 2. Colonnes doublons supprimées ; politique restrictive sur chaque table sous RLS
do $$
declare v_sans text;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
              and column_name in ('role', 'entreprise_id')) then
    raise exception 'ÉCHEC : profiles.role ou profiles.entreprise_id encore présente';
  end if;
  select string_agg(c.relname, ', ') into v_sans
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
                      and p.policyname = 'exige_aal2' and p.permissive = 'RESTRICTIVE' and p.cmd = 'ALL');
  if v_sans is not null then raise exception 'ÉCHEC : politique exige_aal2 absente sur : %', v_sans; end if;
  -- aal_suffisant() (security definer) lit auth.mfa_factors avec les droits de son propriétaire.
  if not (select p.prosecdef and has_table_privilege(p.proowner, 'auth.mfa_factors', 'select')
            from pg_proc p where p.oid = 'public.aal_suffisant()'::regprocedure) then
    raise exception 'ÉCHEC : le propriétaire de aal_suffisant() ne peut pas lire auth.mfa_factors (ou fonction non security definer)';
  end if;
end $$;

-- 3. M (facteur vérifié) en aal1 : rien lu, rien écrit, actions sensibles refusées
set local role authenticated;
select public._t018_en('a0180000-0000-4000-8000-000000000001', 'aal1');
do $$
begin
  if public.aal_suffisant() then raise exception 'ÉCHEC : aal1 jugé suffisant avec un facteur vérifié'; end if;
  if (select count(*) from public.clients) <> 0
     or (select count(*) from public.entreprises) <> 0
     or (select count(*) from public.memberships) <> 0
     or (select count(*) from public.profiles) <> 0 then
    raise exception 'ÉCHEC : données lues en aal1 malgré un facteur vérifié';
  end if;
  perform public._t018_refuse($q$insert into public.clients (entreprise_id, nom) values
    ('a0180000-0000-4000-8000-0000000000e1', 'Écrit en aal1')$q$, 'row-level security');
  if public._t018_lignes($q$update public.clients set nom = 'Modifié en aal1' where id = 'a0180000-0000-4000-8000-0000000000c1'$q$) <> 0 then
    raise exception 'ÉCHEC : modification en aal1';
  end if;
  if public._t018_lignes($q$update public.profiles set nom = 'Modifié en aal1' where id = 'a0180000-0000-4000-8000-000000000001'$q$) <> 0 then
    raise exception 'ÉCHEC : profil modifié en aal1';
  end if;
  perform public._t018_refuse($q$select * from public.membres_equipe('a0180000-0000-4000-8000-0000000000e1')$q$, 'Double authentification requise');
  perform public._t018_refuse($q$select public.changer_role('a0180000-0000-4000-8000-0000000000e1', 'a0180000-0000-4000-8000-000000000003', 'manager')$q$, 'Double authentification requise');
  perform public._t018_refuse($q$select public.suspendre_membre('a0180000-0000-4000-8000-0000000000e1', 'a0180000-0000-4000-8000-000000000003')$q$, 'Double authentification requise');
  perform public._t018_refuse($q$select public.creer_invitation('a0180000-0000-4000-8000-0000000000e1', 'nouveau-018@lagestion.invalid', 'commercial')$q$, 'Double authentification requise');
  perform public._t018_refuse($q$select public.create_entreprise('Créée en aal1')$q$, 'Double authentification requise');
  perform public._t018_refuse($q$select public.accept_invitation('a0180000-0000-4000-8000-0000000000a1')$q$, 'Double authentification requise');
  if (select count(*) from public.mes_acces_suspendus()) <> 0 then
    raise exception 'ÉCHEC : accès suspendus lus en aal1';
  end if;
  -- Sans aal dans le jeton (ancienne session) : même refus.
  perform set_config('request.jwt.claims', '{"sub":"a0180000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  if public.aal_suffisant() or (select count(*) from public.clients) <> 0 then
    raise exception 'ÉCHEC : jeton sans aal accepté malgré un facteur vérifié';
  end if;
end $$;

-- 4. M en aal2 : tout redevient permis
select public._t018_en('a0180000-0000-4000-8000-000000000001', 'aal2');
do $$
begin
  if not public.aal_suffisant() then raise exception 'ÉCHEC : aal2 jugé insuffisant'; end if;
  if (select count(*) from public.clients where entreprise_id = 'a0180000-0000-4000-8000-0000000000e1') <> 1
     or (select count(*) from public.profiles where id = 'a0180000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'ÉCHEC : données non lues en aal2';
  end if;
  insert into public.clients (entreprise_id, nom) values ('a0180000-0000-4000-8000-0000000000e1', 'Écrit en aal2');
  if (select count(*) from public.membres_equipe('a0180000-0000-4000-8000-0000000000e1') where email is not null) <> 3 then
    raise exception 'ÉCHEC : liste de l''équipe en aal2';
  end if;
  perform public.changer_role('a0180000-0000-4000-8000-0000000000e1', 'a0180000-0000-4000-8000-000000000003', 'manager');
  if (select count(*) from public.mes_acces_suspendus()) <> 1 then
    raise exception 'ÉCHEC : accès suspendus non lus en aal2';
  end if;
  if public.accept_invitation('a0180000-0000-4000-8000-0000000000a1') <> 'a0180000-0000-4000-8000-0000000000e1' then
    raise exception 'ÉCHEC : acceptation en aal2';
  end if;
  if public.create_entreprise('Créée en aal2 (test 018)') is null then
    raise exception 'ÉCHEC : création d''entreprise en aal2';
  end if;
end $$;

-- 5. S (aucun facteur) en aal1 : aucun changement
select public._t018_en('a0180000-0000-4000-8000-000000000002', 'aal1');
do $$
begin
  if not public.aal_suffisant() then raise exception 'ÉCHEC : compte sans facteur jugé insuffisant'; end if;
  if (select count(*) from public.clients where entreprise_id = 'a0180000-0000-4000-8000-0000000000e1') <> 2 then
    raise exception 'ÉCHEC : compte sans facteur privé de données (le facteur d''un collègue ne doit rien changer)';
  end if;
  insert into public.clients (entreprise_id, nom) values ('a0180000-0000-4000-8000-0000000000e1', 'Écrit sans facteur');
  if (select count(*) from public.membres_equipe('a0180000-0000-4000-8000-0000000000e1')) <> 3 then
    raise exception 'ÉCHEC : liste de l''équipe sans facteur';
  end if;
  perform public.changer_role('a0180000-0000-4000-8000-0000000000e1', 'a0180000-0000-4000-8000-000000000003', 'commercial');
end $$;

-- 6. N (facteur non vérifié seulement) en aal1 : aucun changement
select public._t018_en('a0180000-0000-4000-8000-000000000003', 'aal1');
do $$
begin
  if not public.aal_suffisant() or (select count(*) from public.clients where entreprise_id = 'a0180000-0000-4000-8000-0000000000e1') <> 3 then
    raise exception 'ÉCHEC : un facteur non vérifié bloque l''accès';
  end if;
end $$;

-- 7. Visiteur anonyme : aperçu d'une invitation toujours possible
reset role;
insert into public.invitations (entreprise_id, email, role, token) values
  ('a0180000-0000-4000-8000-0000000000e1', 'visiteur-018@lagestion.invalid', 'lecture', 'a0180000-0000-4000-8000-0000000000a2');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  if (select etat from public.lire_invitation('a0180000-0000-4000-8000-0000000000a2')) is distinct from 'valide' then
    raise exception 'ÉCHEC : aperçu anonyme d''une invitation';
  end if;
end $$;

rollback;
