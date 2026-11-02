-- 002_multitenant.sql — Lagestion
-- Isolation des données par entreprise : appartenances, rôles, invitations, audit, RLS.
-- S'applique sur schema.sql. Rejouable sans erreur.
-- Premier passage : les tables métier doivent être vides (aucun rattachement deviné).
-- entreprise_id est envoyé par l'application (aucun remplissage automatique).

begin;

-- 0. Garde-fou : premier passage sur des tables métier vides uniquement
--    (memberships absente = migration jamais appliquée ; la transaction rend l'application atomique)
do $$
declare t text; n int;
begin
  if to_regclass('public.memberships') is null then
    foreach t in array array['clients','contacts','opportunites','factures','lignes_facture','paiements'] loop
      execute format('select count(*) from (select 1 from public.%I limit 1) s', t) into n;
      if n > 0 then
        raise exception 'Migration 002 interrompue : la table public.% contient des données. Cette migration exige des tables métier vides au premier passage (aucun rattachement à une entreprise n''est deviné).', t;
      end if;
    end loop;
  end if;
end $$;

-- 1. Rôles
do $$ begin
  create type public.app_role as enum ('admin','manager','commercial','comptable','lecture');
exception when duplicate_object then null; end $$;

-- 2. Appartenances utilisateur <-> entreprise
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'lecture',
  created_at timestamptz not null default now(),
  unique (entreprise_id, user_id)
);
create index if not exists idx_memberships_user on public.memberships(user_id);

-- 3. Invitations
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'lecture',
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists uniq_invitations_en_attente
  on public.invitations(entreprise_id, lower(email)) where accepted_at is null;

-- 4. Journal d'audit
--    Pas de clé étrangère vers entreprises : la suppression d'une entreprise déclenche
--    des événements d'audit (cascade) qui référencent l'entreprise en cours de suppression.
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  entreprise_id uuid,
  user_id uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_events_entreprise
  on public.audit_events(entreprise_id, created_at desc);

grant select, insert, update, delete on public.memberships, public.invitations to authenticated;
grant select on public.audit_events to authenticated;

-- 5. Fonctions d'autorisation (security definer : évite la récursion RLS)
create or replace function public.is_member(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.entreprise_id = e and m.user_id = auth.uid());
$$;

create or replace function public.has_role(e uuid, roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.entreprise_id = e and m.user_id = auth.uid() and m.role = any(roles));
$$;

-- 6. entreprise_id obligatoire sur les tables métier
--    (clients, opportunites, factures : colonne déjà présente ; contacts, lignes_facture, paiements : ajoutée)
do $$
declare t text;
begin
  foreach t in array array['clients','contacts','opportunites','factures','lignes_facture','paiements'] loop
    execute format('alter table public.%I add column if not exists entreprise_id uuid references public.entreprises(id) on delete cascade', t);
    execute format('alter table public.%I alter column entreprise_id set not null', t);
    execute format('create index if not exists %I on public.%I(entreprise_id)', 'idx_' || t || '_entreprise', t);
  end loop;
end $$;

-- 7. Unicités par entreprise, en ignorant les lignes supprimées
drop index if exists public.uniq_clients_email;
create unique index uniq_clients_email on public.clients (entreprise_id, lower(email))
  where email is not null and email <> '' and deleted_at is null;

drop index if exists public.uniq_clients_siren;
create unique index uniq_clients_siren on public.clients (entreprise_id, siren)
  where siren is not null and siren <> '' and deleted_at is null;

-- La contrainte unique (entreprise_id, numero) de schema.sql inclut les factures supprimées : remplacée.
do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.factures'::regclass and contype = 'u'
             and pg_get_constraintdef(oid) = 'UNIQUE (entreprise_id, numero)' loop
    execute format('alter table public.factures drop constraint %I', r.conname);
  end loop;
end $$;
drop index if exists public.uniq_factures_numero;
create unique index uniq_factures_numero on public.factures (entreprise_id, numero)
  where deleted_at is null;

-- 8. Cohérence entre entreprises (les clés étrangères ignorent la RLS)
--    - entreprise_id ne change jamais après création ;
--    - une ligne enfant appartient à la même entreprise que son parent.
--    Arguments du trigger : table parente, colonne de clé étrangère (absents pour clients).
create or replace function public.verifier_entreprise() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_parent_entreprise uuid;
begin
  if tg_op = 'UPDATE' then
    if new.entreprise_id is distinct from old.entreprise_id then
      raise exception '%.entreprise_id ne peut pas être modifié.', tg_table_name;
    end if;
  end if;
  if tg_nargs = 2 then
    execute format('select entreprise_id from public.%I where id = $1', tg_argv[0])
      into v_parent_entreprise
      using (to_jsonb(new) ->> tg_argv[1])::uuid;
    if v_parent_entreprise is distinct from new.entreprise_id then
      raise exception '%.% ne référence pas une ligne de la même entreprise.', tg_table_name, tg_argv[1];
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_clients_entreprise on public.clients;
create trigger trg_clients_entreprise before insert or update on public.clients
  for each row execute function public.verifier_entreprise();
drop trigger if exists trg_contacts_entreprise on public.contacts;
create trigger trg_contacts_entreprise before insert or update on public.contacts
  for each row execute function public.verifier_entreprise('clients', 'client_id');
drop trigger if exists trg_opportunites_entreprise on public.opportunites;
create trigger trg_opportunites_entreprise before insert or update on public.opportunites
  for each row execute function public.verifier_entreprise('clients', 'client_id');
drop trigger if exists trg_factures_entreprise on public.factures;
create trigger trg_factures_entreprise before insert or update on public.factures
  for each row execute function public.verifier_entreprise('clients', 'client_id');
drop trigger if exists trg_lignes_facture_entreprise on public.lignes_facture;
create trigger trg_lignes_facture_entreprise before insert or update on public.lignes_facture
  for each row execute function public.verifier_entreprise('factures', 'facture_id');
drop trigger if exists trg_paiements_entreprise on public.paiements;
create trigger trg_paiements_entreprise before insert or update on public.paiements
  for each row execute function public.verifier_entreprise('factures', 'facture_id');

-- 9. Création d'entreprise : l'auteur devient admin
create or replace function public.create_entreprise(p_nom text, p_siret text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  if coalesce(trim(p_nom), '') = '' then raise exception 'Le nom de l''entreprise est obligatoire'; end if;
  insert into public.entreprises(nom, siret) values (trim(p_nom), p_siret) returning id into v_id;
  insert into public.memberships(entreprise_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end $$;
revoke all on function public.create_entreprise(text, text) from public, anon;
grant execute on function public.create_entreprise(text, text) to authenticated;

-- 10. Acceptation d'une invitation
create or replace function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invitations; v_email text;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  select email into v_email from auth.users where id = auth.uid();
  select * into inv from public.invitations
   where token = p_token and accepted_at is null and expires_at > now();
  if inv.id is null then raise exception 'Invitation invalide ou expirée'; end if;
  if lower(inv.email) is distinct from lower(v_email) then
    raise exception 'Invitation destinée à une autre adresse';
  end if;
  insert into public.memberships(entreprise_id, user_id, role)
  values (inv.entreprise_id, auth.uid(), inv.role)
  on conflict (entreprise_id, user_id) do update set role = excluded.role;
  update public.invitations set accepted_at = now() where id = inv.id;
  return inv.entreprise_id;
end $$;
revoke all on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- 11. Audit automatique
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_events(entreprise_id, user_id, action, table_name, record_id, old_data, new_data)
  values ((v_row->>'entreprise_id')::uuid, auth.uid(), lower(tg_op), tg_table_name, (v_row->>'id')::uuid,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['clients','opportunites','factures','paiements'] loop
    execute format('drop trigger if exists %I on public.%I', 'audit_' || t, t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_trigger()', 'audit_' || t, t);
  end loop;
end $$;

-- 12. RLS : suppression de toutes les anciennes politiques (dont "acces_authentifies")
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('entreprises','profiles','clients','contacts','opportunites','factures',
                               'lignes_facture','paiements','memberships','invitations','audit_events') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 13. RLS : tables métier (lecture = membres ; écriture = rôles actifs ; suppression = admin/manager)
do $$
declare t text;
  ecriture constant text := '{admin,manager,commercial,comptable}';
  direction constant text := '{admin,manager}';
begin
  foreach t in array array['clients','contacts','opportunites','factures','lignes_facture','paiements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy lecture_membres on public.%I for select to authenticated
                      using (public.is_member(entreprise_id))', t);
    execute format('create policy creation_equipe on public.%1$I for insert to authenticated
                      with check (public.has_role(entreprise_id, %2$L::public.app_role[]))', t, ecriture);
    execute format('create policy modification_equipe on public.%1$I for update to authenticated
                      using (public.has_role(entreprise_id, %2$L::public.app_role[]))
                      with check (public.has_role(entreprise_id, %2$L::public.app_role[]))', t, ecriture);
    execute format('create policy suppression_direction on public.%1$I for delete to authenticated
                      using (public.has_role(entreprise_id, %2$L::public.app_role[]))', t, direction);
  end loop;
end $$;

-- 14. RLS : entreprises (création uniquement via create_entreprise)
alter table public.entreprises enable row level security;
create policy lecture_membres on public.entreprises for select to authenticated
  using (public.is_member(id));
create policy modification_admin on public.entreprises for update to authenticated
  using (public.has_role(id, '{admin}'::public.app_role[]))
  with check (public.has_role(id, '{admin}'::public.app_role[]));

-- 15. RLS : profils (soi-même + collègues)
alter table public.profiles enable row level security;
create policy lecture_profils on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.memberships m1
    join public.memberships m2 on m1.entreprise_id = m2.entreprise_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id));
create policy creation_profil on public.profiles for insert to authenticated with check (id = auth.uid());
create policy modification_profil on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 16. RLS : appartenances, invitations, audit (gérés par l'admin)
alter table public.memberships enable row level security;
create policy lecture_membres on public.memberships for select to authenticated
  using (public.is_member(entreprise_id));
create policy gestion_admin_insert on public.memberships for insert to authenticated
  with check (public.has_role(entreprise_id, '{admin}'::public.app_role[]));
create policy gestion_admin_update on public.memberships for update to authenticated
  using (public.has_role(entreprise_id, '{admin}'::public.app_role[]))
  with check (public.has_role(entreprise_id, '{admin}'::public.app_role[]));
create policy gestion_admin_delete on public.memberships for delete to authenticated
  using (public.has_role(entreprise_id, '{admin}'::public.app_role[]));

alter table public.invitations enable row level security;
create policy gestion_admin on public.invitations for all to authenticated
  using (public.has_role(entreprise_id, '{admin}'::public.app_role[]))
  with check (public.has_role(entreprise_id, '{admin}'::public.app_role[]));

-- Écriture uniquement via audit_trigger (security definer) : aucune politique insert/update/delete.
alter table public.audit_events enable row level security;
create policy lecture_admin on public.audit_events for select to authenticated
  using (public.has_role(entreprise_id, '{admin}'::public.app_role[]));

-- 17. La vue des totaux applique la RLS de l'utilisateur (PostgreSQL 15+)
alter view public.factures_totaux set (security_invoker = on);

-- 18. Contrôles finaux : la migration échoue si l'un d'eux n'est pas respecté
do $$
declare t text; n int;
begin
  foreach t in array array['clients','contacts','opportunites','factures','lignes_facture','paiements'] loop
    if not (select relrowsecurity from pg_class where oid = format('public.%I', t)::regclass) then
      raise exception 'Contrôle : RLS inactive sur public.%', t;
    end if;
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t;
    if n <> 4 then
      raise exception 'Contrôle : public.% a % politique(s) au lieu de 4', t, n;
    end if;
  end loop;

  if exists (select 1 from pg_policies where schemaname = 'public'
             and (qual = 'true' or with_check = 'true')) then
    raise exception 'Contrôle : une politique ouverte à tout utilisateur authentifié subsiste';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
             where s.nspname = 'public' and p.prosecdef
               and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                               where c like 'search_path=%')) then
    raise exception 'Contrôle : une fonction security definer n''a pas de search_path fixé';
  end if;
end $$;

commit;
