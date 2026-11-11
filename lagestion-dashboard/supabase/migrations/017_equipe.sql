-- 017_equipe.sql — LaGestion
-- Gestion de l'équipe (prompt 13, point 4) : statut des membres, garde du dernier admin, invitations par lien.
--   - memberships.statut (actif, suspendu) : is_member et has_role ne retiennent que les membres actifs ;
--     un membre suspendu ne lit plus rien de l'entreprise (toute la RLS passe par ces deux fonctions),
--     ses données restent. lecture_profils et verifier_liens (responsable d'une tâche) suivent la même règle.
--   - garde du dernier admin (trigger) : aucune modification ni suppression ne laisse l'entreprise sans
--     administrateur actif, y compris sur soi-même ; seule la suppression de l'entreprise (cascade) y échappe.
--   - écritures sur memberships uniquement par fonctions réservées à l'admin : changer_role, suspendre_membre,
--     reactiver_membre, retirer_membre (suppression de la ligne) ; réassignation facultative des tâches à faire
--     dans la même transaction. Les politiques d'écriture directe sont supprimées.
--   - membres_equipe : liste lisible par tout membre actif, e-mail renvoyé à l'admin seul.
--   - invitations : creer_invitation (refus d'un membre existant), renouveler_invitation, annulation par
--     suppression (admin) ; lire_invitation ouverte aux visiteurs (jeton) ; accept_invitation exige une adresse
--     confirmée et ne change ni le rôle ni le statut d'un membre existant. Jeton uuid à usage unique, 7 jours.
--   - mes_acces_suspendus : entreprises où l'utilisateur est suspendu (page « Votre accès … est suspendu »).
--   - audit (audit_trigger) sur memberships et invitations.
-- S'applique après 016_multi_entreprises.sql. Rejouable sans erreur.

begin;

-- 1. Statut des membres
alter table public.memberships add column if not exists statut text not null default 'actif';
alter table public.memberships add column if not exists suspendu_le timestamptz;
alter table public.memberships add column if not exists suspendu_par uuid references auth.users(id) on delete set null;
alter table public.memberships drop constraint if exists memberships_statut;
alter table public.memberships add constraint memberships_statut
  check (statut in ('actif', 'suspendu') and ((statut = 'suspendu') = (suspendu_le is not null)));

-- 2. Autorisations : membres actifs seulement
create or replace function public.is_member(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.entreprise_id = e and m.user_id = auth.uid() and m.statut = 'actif');
$$;

create or replace function public.has_role(e uuid, roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.entreprise_id = e and m.user_id = auth.uid() and m.statut = 'actif' and m.role = any(roles));
$$;

-- Profils : un membre actif lit ses collègues (actifs ou suspendus) ; un membre suspendu ne lit que le sien.
drop policy if exists lecture_profils on public.profiles;
create policy lecture_profils on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.memberships m1
    join public.memberships m2 on m1.entreprise_id = m2.entreprise_id
    where m1.user_id = auth.uid() and m1.statut = 'actif' and m2.user_id = profiles.id));

-- Responsable d'une tâche : membre actif avec un rôle qui écrit (corps de 012, condition statut ajoutée).
create or replace function public.verifier_liens() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  i int;
  v_id uuid;
  v_entreprise uuid;
  v_client uuid;
begin
  for i in 0 .. tg_nargs - 1 by 2 loop
    v_id := (to_jsonb(new) ->> tg_argv[i + 1])::uuid;
    if v_id is not null then
      execute format('select entreprise_id from public.%I where id = $1', tg_argv[i]) into v_entreprise using v_id;
      if v_entreprise is distinct from new.entreprise_id then
        raise exception '%.% ne référence pas une ligne de la même entreprise.', tg_table_name, tg_argv[i + 1];
      end if;
    end if;
  end loop;
  if tg_table_name = 'taches' then
    if (tg_op = 'INSERT' or new.responsable is distinct from old.responsable)
       and not exists (select 1 from public.memberships m where m.entreprise_id = new.entreprise_id and m.user_id = new.responsable
                         and m.statut = 'actif' and m.role in ('admin', 'manager', 'commercial', 'comptable')) then
      raise exception 'Le responsable doit être membre de l''entreprise, actif, avec un rôle qui écrit (admin, manager, commercial, comptable).';
    end if;
  elsif tg_table_name = 'activites' then
    if new.client_id is not null and new.opportunite_id is not null then
      select client_id into v_client from public.opportunites where id = new.opportunite_id;
      if v_client is distinct from new.client_id then
        raise exception 'L''opportunité liée n''appartient pas à ce client.';
      end if;
    end if;
  end if;
  return new;
end $$;

-- 3. Garde du dernier admin. Verrou sur la ligne de l'entreprise : deux changements simultanés passent l'un après
--    l'autre, le second compte les admins après le premier. Entreprise absente (suppression en cascade) : permis.
create or replace function public.garde_dernier_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not (old.role = 'admin' and old.statut = 'actif') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and new.role = 'admin' and new.statut = 'actif' then
    return new;
  end if;
  perform 1 from public.entreprises where id = old.entreprise_id for no key update;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if not exists (select 1 from public.memberships m
                  where m.entreprise_id = old.entreprise_id and m.id <> old.id
                    and m.role = 'admin' and m.statut = 'actif') then
    raise exception 'Impossible : l''entreprise doit garder au moins un administrateur actif. Nommez d''abord un autre administrateur.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_memberships_dernier_admin on public.memberships;
create trigger trg_memberships_dernier_admin before update or delete on public.memberships
  for each row execute function public.garde_dernier_admin();

-- 4. Plus d'écriture directe sur memberships (droits SQL conservés : sans politique, la RLS refuse tout)
drop policy if exists gestion_admin_insert on public.memberships;
drop policy if exists gestion_admin_update on public.memberships;
drop policy if exists gestion_admin_delete on public.memberships;

-- 5. Gestion des membres (admin)
create or replace function public._exiger_admin(p_entreprise uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  if not public.has_role(p_entreprise, '{admin}'::public.app_role[]) then
    raise exception 'Seul un administrateur peut gérer l''équipe.' using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Membre visé, verrouillé ; absent : erreur.
create or replace function public._membre(p_entreprise uuid, p_user uuid) returns public.memberships
language plpgsql security definer set search_path = public as $$
declare m public.memberships;
begin
  select * into m from public.memberships where entreprise_id = p_entreprise and user_id = p_user for update;
  if m.id is null then raise exception 'Ce membre n''appartient plus à l''entreprise.'; end if;
  return m;
end $$;

-- Tâches à faire de p_user confiées à p_vers (contrôle du nouveau responsable : verifier_liens). Renvoie leur nombre.
create or replace function public._reassigner_taches(p_entreprise uuid, p_user uuid, p_vers uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if p_vers is null then return 0; end if;
  if p_vers = p_user then raise exception 'Choisissez un autre membre pour reprendre les tâches.'; end if;
  update public.taches set responsable = p_vers
   where entreprise_id = p_entreprise and responsable = p_user and statut = 'a_faire' and deleted_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.changer_role(p_entreprise uuid, p_user uuid, p_role public.app_role, p_reassigner_a uuid default null)
returns int language plpgsql security definer set search_path = public as $$
begin
  perform public._exiger_admin(p_entreprise);
  perform public._membre(p_entreprise, p_user);
  update public.memberships set role = p_role where entreprise_id = p_entreprise and user_id = p_user;
  return public._reassigner_taches(p_entreprise, p_user, p_reassigner_a);
end $$;

create or replace function public.suspendre_membre(p_entreprise uuid, p_user uuid, p_reassigner_a uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare m public.memberships;
begin
  perform public._exiger_admin(p_entreprise);
  m := public._membre(p_entreprise, p_user);
  if m.statut = 'suspendu' then raise exception 'Ce membre est déjà suspendu.'; end if;
  update public.memberships set statut = 'suspendu', suspendu_le = now(), suspendu_par = auth.uid()
   where id = m.id;
  return public._reassigner_taches(p_entreprise, p_user, p_reassigner_a);
end $$;

create or replace function public.reactiver_membre(p_entreprise uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m public.memberships;
begin
  perform public._exiger_admin(p_entreprise);
  m := public._membre(p_entreprise, p_user);
  if m.statut = 'actif' then raise exception 'Ce membre est déjà actif.'; end if;
  update public.memberships set statut = 'actif', suspendu_le = null, suspendu_par = null where id = m.id;
end $$;

-- Retrait : la ligne d'appartenance est supprimée ; les données du membre (auteur, tâches) restent.
create or replace function public.retirer_membre(p_entreprise uuid, p_user uuid, p_reassigner_a uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare m public.memberships; n int;
begin
  perform public._exiger_admin(p_entreprise);
  m := public._membre(p_entreprise, p_user);
  n := public._reassigner_taches(p_entreprise, p_user, p_reassigner_a);
  delete from public.memberships where id = m.id;
  return n;
end $$;

-- Liste de l'équipe : tout membre actif ; e-mail pour l'admin seul.
create or replace function public.membres_equipe(p_entreprise uuid)
returns table (user_id uuid, nom text, email text, role public.app_role, statut text,
               suspendu_le timestamptz, membre_depuis timestamptz, taches_a_faire int)
language plpgsql stable security definer set search_path = public as $$
declare v_admin boolean;
begin
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

-- Entreprises où l'utilisateur est suspendu (la RLS les lui masque).
create or replace function public.mes_acces_suspendus()
returns table (entreprise_id uuid, nom text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nom from public.memberships m join public.entreprises e on e.id = m.entreprise_id
   where m.user_id = auth.uid() and m.statut = 'suspendu' and e.deleted_at is null
   order by e.nom;
$$;

-- 6. Invitations
--    Lecture et annulation (suppression) par l'admin ; création et renouvellement par fonctions.
drop policy if exists gestion_admin on public.invitations;
drop policy if exists lecture_admin on public.invitations;
drop policy if exists annulation_admin on public.invitations;
create policy lecture_admin on public.invitations for select to authenticated
  using (public.has_role(entreprise_id, '{admin}'::public.app_role[]));
create policy annulation_admin on public.invitations for delete to authenticated
  using (public.has_role(entreprise_id, '{admin}'::public.app_role[]) and accepted_at is null);

create or replace function public.creer_invitation(p_entreprise uuid, p_email text, p_role public.app_role)
returns public.invitations language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, ''))); inv public.invitations;
begin
  perform public._exiger_admin(p_entreprise);
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Adresse e-mail invalide.';
  end if;
  if exists (select 1 from public.memberships m join auth.users u on u.id = m.user_id
              where m.entreprise_id = p_entreprise and lower(u.email) = v_email) then
    raise exception 'Cette personne est déjà membre de l''entreprise.';
  end if;
  -- Une invitation expirée à la même adresse laisse la place à la nouvelle.
  delete from public.invitations
   where entreprise_id = p_entreprise and lower(email) = v_email and accepted_at is null and expires_at <= now();
  if exists (select 1 from public.invitations
              where entreprise_id = p_entreprise and lower(email) = v_email and accepted_at is null) then
    raise exception 'Une invitation est déjà en attente pour cette adresse.';
  end if;
  insert into public.invitations (entreprise_id, email, role, invited_by)
  values (p_entreprise, v_email, p_role, auth.uid())
  returning * into inv;
  return inv;
end $$;

-- Nouveau jeton (l'ancien lien cesse de fonctionner) et nouvelle échéance à 7 jours.
create or replace function public.renouveler_invitation(p_id uuid)
returns public.invitations language plpgsql security definer set search_path = public as $$
declare inv public.invitations;
begin
  select * into inv from public.invitations where id = p_id for update;
  if inv.id is null then raise exception 'Cette invitation n''existe plus.'; end if;
  perform public._exiger_admin(inv.entreprise_id);
  if inv.accepted_at is not null then raise exception 'Cette invitation a déjà été acceptée.'; end if;
  update public.invitations set token = gen_random_uuid(), expires_at = now() + interval '7 days'
   where id = p_id returning * into inv;
  return inv;
end $$;

-- Aperçu pour la page ouverte par le lien (visiteur non connecté compris). Jeton inconnu : aucune ligne.
create or replace function public.lire_invitation(p_token uuid)
returns table (entreprise_nom text, email text, role public.app_role, expires_at timestamptz, etat text)
language sql stable security definer set search_path = public as $$
  select e.nom, i.email, i.role, i.expires_at,
         case when i.accepted_at is not null then 'acceptee'
              when i.expires_at <= now() then 'expiree'
              else 'valide' end
    from public.invitations i join public.entreprises e on e.id = i.entreprise_id
   where i.token = p_token and e.deleted_at is null;
$$;

-- Acceptation : adresse du compte identique et confirmée ; un membre existant garde son rôle et son statut.
create or replace function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invitations; v_email text; v_confirmee timestamptz;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
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

-- 7. Droits d'exécution
do $$
declare f text;
begin
  foreach f in array array[
    'public._exiger_admin(uuid)', 'public._membre(uuid, uuid)', 'public._reassigner_taches(uuid, uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.changer_role(uuid, uuid, public.app_role, uuid)', 'public.suspendre_membre(uuid, uuid, uuid)',
    'public.reactiver_membre(uuid, uuid)', 'public.retirer_membre(uuid, uuid, uuid)',
    'public.membres_equipe(uuid)', 'public.mes_acces_suspendus()',
    'public.creer_invitation(uuid, text, public.app_role)', 'public.renouveler_invitation(uuid)',
    'public.accept_invitation(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke all on function public.lire_invitation(uuid) from public;
grant execute on function public.lire_invitation(uuid) to anon, authenticated;
revoke all on function public.garde_dernier_admin() from public, anon, authenticated;

-- 8. Audit
drop trigger if exists audit_memberships on public.memberships;
create trigger audit_memberships after insert or update or delete on public.memberships
  for each row execute function public.audit_trigger();
drop trigger if exists audit_invitations on public.invitations;
create trigger audit_invitations after insert or update or delete on public.invitations
  for each row execute function public.audit_trigger();

-- 9. Contrôles finaux
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'memberships' and cmd <> 'SELECT') then
    raise exception 'Contrôle : une politique d''écriture directe subsiste sur public.memberships';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invitations' and cmd not in ('SELECT', 'DELETE')) then
    raise exception 'Contrôle : une politique d''écriture directe subsiste sur public.invitations';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.memberships'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.invitations'::regclass) then
    raise exception 'Contrôle : RLS inactive sur memberships ou invitations';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_memberships_dernier_admin' and not tgisinternal) then
    raise exception 'Contrôle : garde du dernier admin absente';
  end if;
  if position('statut' in pg_get_functiondef('public.is_member(uuid)'::regprocedure)) = 0
     or position('statut' in pg_get_functiondef('public.has_role(uuid, public.app_role[])'::regprocedure)) = 0 then
    raise exception 'Contrôle : is_member ou has_role ignore le statut';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
             where s.nspname = 'public' and p.prosecdef
               and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')) then
    raise exception 'Contrôle : une fonction security definer n''a pas de search_path fixé';
  end if;
  if has_function_privilege('anon', 'public.accept_invitation(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public._reassigner_taches(uuid, uuid, uuid)', 'EXECUTE') then
    raise exception 'Contrôle : droit d''exécution trop large';
  end if;
end $$;

commit;
