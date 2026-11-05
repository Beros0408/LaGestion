-- 003_droits_lignes_et_suppression.sql — Lagestion
-- 1. Suppression des lignes de facture ouverte aux rôles qui écrivent
--    (la modification d'une facture supprime puis réinsère ses lignes).
-- 2. Suppression logique (deleted_at) réservée aux admin et manager sur clients, opportunites, factures.
-- S'applique après 002_multitenant.sql. Rejouable sans erreur.
-- À faire plus tard : suppression + réinsertion des lignes non atomique, à remplacer par une
-- fonction SQL transactionnelle lors du verrouillage des factures.

begin;

-- 1. lignes_facture : suppression par admin, manager, commercial, comptable
drop policy if exists suppression_direction on public.lignes_facture;
drop policy if exists suppression_equipe on public.lignes_facture;
create policy suppression_equipe on public.lignes_facture for delete to authenticated
  using (public.has_role(entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]));

-- 2. Renseigner ou effacer deleted_at : admin et manager uniquement
--    (la RLS autorise la mise à jour aux rôles qui écrivent ; ce trigger isole le cas de la suppression logique).
--    Sans utilisateur authentifié (SQL Editor, service_role), l'opération reste permise.
create or replace function public.verifier_suppression_logique() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deleted_at is distinct from old.deleted_at
     and auth.uid() is not null
     and not public.has_role(new.entreprise_id, '{admin,manager}'::public.app_role[]) then
    raise exception 'Suppression réservée aux administrateurs et managers.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['clients','opportunites','factures'] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_suppression_logique', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.verifier_suppression_logique()',
                   'trg_' || t || '_suppression_logique', t);
  end loop;
end $$;

-- 3. Contrôles finaux
do $$
declare n int;
begin
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'lignes_facture';
  if n <> 4 then
    raise exception 'Contrôle : public.lignes_facture a % politique(s) au lieu de 4', n;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lignes_facture'
                 and policyname = 'suppression_equipe' and cmd = 'DELETE') then
    raise exception 'Contrôle : politique suppression_equipe absente sur lignes_facture';
  end if;
  select count(*) into n from pg_trigger
   where not tgisinternal and tgname in ('trg_clients_suppression_logique',
                                         'trg_opportunites_suppression_logique',
                                         'trg_factures_suppression_logique');
  if n <> 3 then
    raise exception 'Contrôle : % trigger(s) de suppression logique au lieu de 3', n;
  end if;
end $$;

commit;
