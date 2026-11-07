-- 012_taches_activites.sql — LaGestion
-- Tâches, notes et activités (CRM-01 du PRD, FR-005).
--   - activites : appel, rendez-vous, e-mail ou note, liés à un client et/ou à une opportunité de la même entreprise ;
--     auteur et nom figés par la base ; modification et suppression logique réservées à l'auteur, à l'admin et au manager ;
--   - taches : titre, échéance obligatoire, responsable membre de l'entreprise avec un rôle qui écrit (admin, manager,
--     commercial, comptable : un membre au rôle lecture ne pourrait pas marquer sa tâche faite), statut a_faire ou faite ;
--     au plus un objet lié (client, opportunité, devis ou facture), facultatif ;
--     tout rôle d'écriture crée une tâche et change son statut ; le reste de la modification et la suppression logique
--     sont réservés à l'auteur, au responsable, à l'admin et au manager ;
--     origine (relance, brouillon, opportunite_inactive) : tâche créée depuis une suggestion du tableau de bord,
--     une seule tâche à faire par suggestion (index unique partiel) ;
--   - le retard d'une tâche se calcule à la lecture (échéance passée, pas le jour même), comme celui des factures ;
--   - le rôle lecture voit sans modifier (RLS) ; aucune suppression physique pour les utilisateurs.
-- Comme les migrations 003, 007 à 011, les règles ne s'appliquent qu'à un utilisateur authentifié : le SQL Editor
-- (rôle postgres, seed) reste libre, sauf les contraintes.
-- S'applique après 011_reglements_relances.sql. Rejouable sans erreur.

begin;

-- 1. Activités
create table if not exists public.activites (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  type text not null check (type in ('appel', 'rendez_vous', 'email', 'note')),
  client_id uuid references public.clients(id) on delete cascade,
  opportunite_id uuid references public.opportunites(id) on delete cascade,
  date_activite timestamptz not null default now(),
  commentaire text not null check (trim(commentaire) <> ''),
  auteur uuid references auth.users(id) on delete set null,
  auteur_nom text not null default 'Utilisateur',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint activites_objet check (client_id is not null or opportunite_id is not null)
);
create index if not exists idx_activites_entreprise on public.activites(entreprise_id);
create index if not exists idx_activites_client on public.activites(client_id, date_activite desc);
create index if not exists idx_activites_opportunite on public.activites(opportunite_id, date_activite desc);

-- 2. Tâches
create table if not exists public.taches (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  titre text not null check (trim(titre) <> '' and char_length(titre) <= 200),
  echeance date not null,
  responsable uuid not null references auth.users(id),
  statut text not null default 'a_faire' check (statut in ('a_faire', 'faite')),
  faite_le timestamptz,
  client_id uuid references public.clients(id) on delete cascade,
  opportunite_id uuid references public.opportunites(id) on delete cascade,
  devis_id uuid references public.devis(id) on delete cascade,
  facture_id uuid references public.factures(id) on delete cascade,
  origine text check (origine in ('relance', 'brouillon', 'opportunite_inactive')),
  auteur uuid references auth.users(id) on delete set null,
  auteur_nom text not null default 'Utilisateur',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint taches_un_objet check (num_nonnulls(client_id, opportunite_id, devis_id, facture_id) <= 1),
  constraint taches_faite_le check ((statut = 'faite') = (faite_le is not null)),
  constraint taches_origine check (
    origine is null
    or (origine in ('relance', 'brouillon') and facture_id is not null)
    or (origine = 'opportunite_inactive' and opportunite_id is not null))
);
create index if not exists idx_taches_entreprise on public.taches(entreprise_id);
create index if not exists idx_taches_responsable on public.taches(responsable, statut, echeance);
-- Une seule tâche à faire par suggestion du tableau de bord
create unique index if not exists uniq_taches_origine on public.taches
  (entreprise_id, origine, coalesce(facture_id, opportunite_id))
  where origine is not null and statut = 'a_faire' and deleted_at is null;

-- 3. Liens et responsable, contrôlés sans RLS (une clé étrangère l'ignore) : trigger security definer,
--    sur le modèle de verifier_entreprise ; une fonction trigger ne s'appelle pas directement.
--    Arguments : paires (table parente, colonne) ; un lien nul (facultatif) n'est pas vérifié.
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
  -- Champs propres à chaque table : conditions imbriquées (PL/pgSQL évalue toute l'expression).
  if tg_table_name = 'taches' then
    if (tg_op = 'INSERT' or new.responsable is distinct from old.responsable)
       and not exists (select 1 from public.memberships m where m.entreprise_id = new.entreprise_id and m.user_id = new.responsable
                         and m.role in ('admin', 'manager', 'commercial', 'comptable')) then
      raise exception 'Le responsable doit être membre de l''entreprise avec un rôle qui écrit (admin, manager, commercial, comptable).';
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

drop trigger if exists trg_activites_liens on public.activites;
create trigger trg_activites_liens before insert or update on public.activites
  for each row execute function public.verifier_liens('clients', 'client_id', 'opportunites', 'opportunite_id');
drop trigger if exists trg_taches_liens on public.taches;
create trigger trg_taches_liens before insert or update on public.taches
  for each row execute function public.verifier_liens('clients', 'client_id', 'opportunites', 'opportunite_id',
                                                      'devis', 'devis_id', 'factures', 'facture_id');

-- 4. Règles des activités
create or replace function public.verifier_activite() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.entreprise_id is distinct from old.entreprise_id then
    raise exception 'activites.entreprise_id ne peut pas être modifié.';
  end if;

  if auth.uid() is null then
    return new;
  end if;
  -- Sans droit d'écriture : la RLS refuse.
  if not public.has_role(new.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.deleted_at is not null then
      raise exception 'Une activité ne peut pas être créée supprimée.';
    end if;
    new.auteur := auth.uid();
    new.auteur_nom := coalesce((select nullif(trim(p.nom), '') from public.profiles p where p.id = auth.uid()), 'Utilisateur');
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- Modification ou suppression logique : auteur, admin, manager
  if old.deleted_at is not null then
    raise exception 'Cette activité est supprimée.';
  end if;
  if old.auteur is distinct from auth.uid()
     and not public.has_role(new.entreprise_id, '{admin,manager}'::public.app_role[]) then
    raise exception 'Seuls l''auteur, un administrateur ou un manager peuvent modifier ou supprimer cette activité.'
      using errcode = 'insufficient_privilege';
  end if;
  new.auteur := old.auteur;
  new.auteur_nom := old.auteur_nom;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_activites_regles on public.activites;
create trigger trg_activites_regles before insert or update on public.activites
  for each row execute function public.verifier_activite();
drop trigger if exists audit_activites on public.activites;
create trigger audit_activites after insert or update or delete on public.activites
  for each row execute function public.audit_trigger();

-- 5. Règles des tâches
create or replace function public.verifier_tache() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.entreprise_id is distinct from old.entreprise_id then
    raise exception 'taches.entreprise_id ne peut pas être modifié.';
  end if;
  -- Statut et date de réalisation, toujours cohérents
  if tg_op = 'INSERT' or new.statut is distinct from old.statut then
    new.faite_le := case when new.statut = 'faite' then now() end;
  else
    new.faite_le := old.faite_le;
  end if;

  if auth.uid() is null then
    return new;
  end if;
  if not public.has_role(new.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.deleted_at is not null then
      raise exception 'Une tâche ne peut pas être créée supprimée.';
    end if;
    new.auteur := auth.uid();
    new.auteur_nom := coalesce((select nullif(trim(p.nom), '') from public.profiles p where p.id = auth.uid()), 'Utilisateur');
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'Cette tâche est supprimée.';
  end if;
  new.auteur := old.auteur;
  new.auteur_nom := old.auteur_nom;
  new.created_at := old.created_at;
  new.updated_at := now();
  -- Tout rôle d'écriture change le statut ; le reste : auteur, responsable, admin, manager
  if (to_jsonb(new) - '{statut,faite_le,updated_at}'::text[]) is distinct from (to_jsonb(old) - '{statut,faite_le,updated_at}'::text[])
     and auth.uid() is distinct from old.auteur and auth.uid() is distinct from old.responsable
     and not public.has_role(new.entreprise_id, '{admin,manager}'::public.app_role[]) then
    raise exception 'Seuls l''auteur, le responsable, un administrateur ou un manager peuvent modifier ou supprimer cette tâche.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists trg_taches_regles on public.taches;
create trigger trg_taches_regles before insert or update on public.taches
  for each row execute function public.verifier_tache();
drop trigger if exists audit_taches on public.taches;
create trigger audit_taches after insert or update or delete on public.taches
  for each row execute function public.audit_trigger();

-- 6. Droits : lecture pour tout membre ; écriture pour les rôles qui écrivent ; aucune suppression physique
revoke all on public.activites, public.taches from anon, authenticated;
grant select, insert, update on public.activites, public.taches to authenticated;

alter table public.activites enable row level security;
alter table public.taches enable row level security;
do $$
declare t text;
begin
  foreach t in array array['activites', 'taches'] loop
    execute format('drop policy if exists lecture_membres on public.%I', t);
    execute format('drop policy if exists creation_equipe on public.%I', t);
    execute format('drop policy if exists modification_equipe on public.%I', t);
    execute format('create policy lecture_membres on public.%I for select to authenticated using (public.is_member(entreprise_id))', t);
    execute format('create policy creation_equipe on public.%I for insert to authenticated with check (public.has_role(entreprise_id, ''{admin,manager,commercial,comptable}''::public.app_role[]))', t);
    execute format('create policy modification_equipe on public.%I for update to authenticated using (public.has_role(entreprise_id, ''{admin,manager,commercial,comptable}''::public.app_role[])) with check (public.has_role(entreprise_id, ''{admin,manager,commercial,comptable}''::public.app_role[]))', t);
  end loop;
end $$;

-- 7. Contrôles finaux
do $$
declare t text; n int;
begin
  foreach t in array array['activites', 'taches'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'Contrôle : RLS inactive sur public.%', t;
    end if;
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t;
    if n <> 3 then raise exception 'Contrôle : public.% a % politique(s) au lieu de 3', t, n; end if;
    select count(*) into n from pg_trigger where not tgisinternal and tgrelid = ('public.' || t)::regclass
      and tgname in ('trg_' || t || '_liens', 'trg_' || t || '_regles', 'audit_' || t);
    if n <> 3 then raise exception 'Contrôle : % trigger(s) sur public.% au lieu de 3', n, t; end if;
    if has_table_privilege('authenticated', 'public.' || t, 'DELETE') then
      raise exception 'Contrôle : suppression physique ouverte sur public.%', t;
    end if;
  end loop;
  if to_regclass('public.uniq_taches_origine') is null then
    raise exception 'Contrôle : index uniq_taches_origine absent';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.verifier_tache()'::regprocedure)
     or (select prosecdef from pg_proc where oid = 'public.verifier_activite()'::regprocedure) then
    raise exception 'Contrôle : les triggers de règles ne doivent pas être en security definer';
  end if;
end $$;

-- 8. Supabase : nouvelles tables visibles immédiatement par l'API (cache de schéma)
notify pgrst, 'reload schema';

commit;
