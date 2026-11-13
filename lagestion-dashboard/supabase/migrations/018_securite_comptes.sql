-- 018_securite_comptes.sql — LaGestion (étape 13 temps 5)
-- 1. Double authentification (TOTP de Supabase Auth) vérifiée en base : dès qu'un utilisateur a un facteur
--    vérifié, sa session doit être de niveau aal2 pour lire ou écrire des données. Sans facteur vérifié :
--    aucun changement. La MFA reste facultative (obligation des admins : temps suivant, feuille de route).
--    - aal_suffisant() : vrai si le jeton est aal2, ou si l'utilisateur n'a aucun facteur vérifié ;
--    - politique restrictive exige_aal2 sur toutes les tables de public sous RLS, évaluée une fois par requête
--      (forme (select public.aal_suffisant())) ;
--    - fonctions security definer (hors RLS) : _exiger_admin (toutes les actions admin), membres_equipe,
--      create_entreprise, accept_invitation refusent ; mes_acces_suspendus renvoie une liste vide ;
--      lire_invitation reste publique (aperçu d'un lien avant connexion) ;
--    - logos (storage.objects) : mêmes conditions.
-- 2. Nettoyage : suppression des colonnes doublons profiles.role et profiles.entreprise_id
--    (memberships est la seule source de vérité), après contrôles ; sans cascade.
-- Rejouable. À lancer dans le SQL Editor de Supabase (rôle postgres), après 017.
-- Une seule transaction : un contrôle en échec annule toute la migration.

begin;

-- 1. Niveau d'assurance suffisant
-- PL/pgSQL : auth.mfa_factors n'est lue qu'à l'appel. Si elle manque, l'appel échoue (refus, jamais d'accès).
-- Jeton lu dans request.jwt.claims (posé par PostgREST) ; rôle postgres sans jeton : aucun utilisateur, vrai.
create or replace function public.aal_suffisant() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
begin
  if auth.uid() is null then return true; end if;
  if v_claims ->> 'aal' = 'aal2' then return true; end if;
  return not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
end $$;
revoke all on function public.aal_suffisant() from public;
grant execute on function public.aal_suffisant() to anon, authenticated;

create or replace function public._exiger_aal() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.aal_suffisant() then
    raise exception 'Double authentification requise : saisissez le code de votre application d''authentification.'
      using errcode = 'insufficient_privilege';
  end if;
end $$;
revoke all on function public._exiger_aal() from public, anon, authenticated;

-- 2. Politique restrictive sur toutes les tables de public sous RLS (s'ajoute aux politiques existantes)
do $$
declare t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity order by 1 loop
    execute format('drop policy if exists exige_aal2 on public.%I', t);
    execute format('create policy exige_aal2 on public.%I as restrictive for all to authenticated
                      using ((select public.aal_suffisant())) with check ((select public.aal_suffisant()))', t);
  end loop;
end $$;

-- 3. Fonctions security definer (la RLS ne s'y applique pas)
create or replace function public._exiger_admin(p_entreprise uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  perform public._exiger_aal();
  if not public.has_role(p_entreprise, '{admin}'::public.app_role[]) then
    raise exception 'Seul un administrateur peut gérer l''équipe.' using errcode = 'insufficient_privilege';
  end if;
end $$;

create or replace function public.membres_equipe(p_entreprise uuid)
returns table (user_id uuid, nom text, email text, role public.app_role, statut text,
               suspendu_le timestamptz, membre_depuis timestamptz, taches_a_faire int)
language plpgsql stable security definer set search_path = public as $$
declare v_admin boolean;
begin
  perform public._exiger_aal();
  if not public.is_member(p_entreprise) then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  v_admin := public.has_role(p_entreprise, '{admin}'::public.app_role[]);
  return query
    select m.user_id, nullif(trim(p.nom), ''), case when v_admin then u.email::text end, m.role, m.statut,
           m.suspendu_le, m.created_at,
           (select count(*)::int from public.taches t
             where t.entreprise_id = p_entreprise and t.responsable = m.user_id
               and t.statut = 'a_faire' and t.deleted_at is null)
      from public.memberships m
      left join public.profiles p on p.id = m.user_id
      left join auth.users u on u.id = m.user_id
     where m.entreprise_id = p_entreprise
     order by lower(coalesce(nullif(trim(p.nom), ''), u.email::text, '')), m.created_at;
end $$;

create or replace function public.mes_acces_suspendus()
returns table (entreprise_id uuid, nom text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nom from public.memberships m join public.entreprises e on e.id = m.entreprise_id
   where m.user_id = auth.uid() and m.statut = 'suspendu' and e.deleted_at is null
     and public.aal_suffisant()
   order by e.nom;
$$;

create or replace function public.create_entreprise(p_nom text, p_siret text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  perform public._exiger_aal();
  if coalesce(trim(p_nom), '') = '' then raise exception 'Le nom de l''entreprise est obligatoire'; end if;
  insert into public.entreprises(nom, siret) values (trim(p_nom), p_siret) returning id into v_id;
  insert into public.memberships(entreprise_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end $$;

create or replace function public.accept_invitation(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.invitations; v_email text; v_confirmee timestamptz;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  perform public._exiger_aal();
  select email, email_confirmed_at into v_email, v_confirmee from auth.users where id = auth.uid();
  select * into inv from public.invitations where token = p_token for update;
  if inv.id is null or inv.accepted_at is not null then
    raise exception 'Invitation invalide ou déjà utilisée.';
  end if;
  if inv.expires_at <= now() then
    raise exception 'Invitation expirée. Demandez un nouveau lien à l''administrateur.';
  end if;
  if lower(inv.email) is distinct from lower(v_email) then
    raise exception 'Cette invitation est destinée à une autre adresse e-mail.';
  end if;
  if v_confirmee is null then
    raise exception 'Confirmez d''abord votre adresse e-mail.';
  end if;
  if not exists (select 1 from public.entreprises where id = inv.entreprise_id and deleted_at is null) then
    raise exception 'Invitation invalide ou déjà utilisée.';
  end if;
  insert into public.memberships (entreprise_id, user_id, role)
  values (inv.entreprise_id, auth.uid(), inv.role)
  on conflict (entreprise_id, user_id) do nothing;
  update public.invitations set accepted_at = now() where id = inv.id;
  return inv.entreprise_id;
end $$;

-- 4. Logos (bucket privé, migration 013) : mêmes politiques, niveau d'assurance en plus. Ignoré sans Storage.
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Storage absent : politiques des logos inchangées.';
    return;
  end if;
  drop policy if exists logos_lecture_membres on storage.objects;
  drop policy if exists logos_ajout_admin on storage.objects;
  drop policy if exists logos_modification_admin on storage.objects;
  drop policy if exists logos_suppression_admin on storage.objects;
  create policy logos_lecture_membres on storage.objects for select to authenticated
    using (bucket_id = 'logos' and public.is_member(public.entreprise_du_chemin(name)) and (select public.aal_suffisant()));
  create policy logos_ajout_admin on storage.objects for insert to authenticated
    with check (bucket_id = 'logos' and public.has_role(public.entreprise_du_chemin(name), '{admin}'::public.app_role[])
                and (select public.aal_suffisant()));
  create policy logos_modification_admin on storage.objects for update to authenticated
    using (bucket_id = 'logos' and public.has_role(public.entreprise_du_chemin(name), '{admin}'::public.app_role[])
           and (select public.aal_suffisant()))
    with check (bucket_id = 'logos' and public.has_role(public.entreprise_du_chemin(name), '{admin}'::public.app_role[])
                and (select public.aal_suffisant()));
  create policy logos_suppression_admin on storage.objects for delete to authenticated
    using (bucket_id = 'logos' and public.has_role(public.entreprise_du_chemin(name), '{admin}'::public.app_role[])
           and (select public.aal_suffisant()));
end $$;

-- 5. Nettoyage de profiles : contrôles, puis suppression sans cascade (memberships fait foi)
do $$
declare v_objets text;
begin
  -- Fonctions qui citent profiles : seules celles connues, qui ne lisent que id et nom.
  select string_agg(n.nspname || '.' || p.proname, ', ' order by 1) into v_objets
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where p.prosrc ilike '%profiles%'
     and n.nspname not in ('pg_catalog', 'information_schema')
     and n.nspname || '.' || p.proname not in
       ('public.membres_equipe', 'public.verifier_activite', 'public.verifier_relance', 'public.verifier_tache');
  if v_objets is not null then
    raise exception 'Migration 018 arrêtée : fonction(s) citant profiles à vérifier avant suppression des colonnes : %', v_objets;
  end if;
  -- Fonctions connues : aucune lecture de role ou d'entreprise_id sur l'alias p de profiles, ni profiles.role.
  select string_agg(p.proname, ', ') into v_objets
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('membres_equipe', 'verifier_activite', 'verifier_relance', 'verifier_tache')
     and (p.prosrc ~* '\mp\.(role|entreprise_id)\M' or p.prosrc ~* 'profiles\.(role|entreprise_id)');
  if v_objets is not null then
    raise exception 'Migration 018 arrêtée : lecture possible de profiles.role ou profiles.entreprise_id dans : %', v_objets;
  end if;
  -- Vues, politiques, déclencheurs, contraintes d'autres tables : dépendances « normales » (deptype n).
  -- Partent avec la colonne : l'index idx_profiles_entreprise (deptype a) et les contraintes de profiles
  -- elle-même (vérification du rôle, clé étrangère vers entreprises).
  select string_agg(distinct pg_describe_object(d.classid, d.objid, d.objsubid), ', ') into v_objets
    from pg_depend d
    join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
   where d.refclassid = 'pg_class'::regclass and d.refobjid = 'public.profiles'::regclass
     and a.attname in ('role', 'entreprise_id') and d.deptype = 'n'
     and not (d.classid = 'pg_constraint'::regclass
              and (select c.conrelid from pg_constraint c where c.oid = d.objid) = 'public.profiles'::regclass);
  if v_objets is not null then
    raise exception 'Migration 018 arrêtée : objet(s) dépendant de profiles.role ou profiles.entreprise_id : %', v_objets;
  end if;
end $$;

alter table public.profiles drop column if exists role;
alter table public.profiles drop column if exists entreprise_id;

-- 6. Contrôles de fin
do $$
declare n int;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
              and column_name in ('role', 'entreprise_id')) then
    raise exception 'Contrôle : colonne doublon encore présente sur profiles';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and policyname = 'exige_aal2' and permissive = 'RESTRICTIVE';
  if n <> (select count(*) from pg_class c join pg_namespace s on s.oid = c.relnamespace
            where s.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity) then
    raise exception 'Contrôle : politique exige_aal2 absente d''une table sous RLS (% posée(s))', n;
  end if;
end $$;

commit;
