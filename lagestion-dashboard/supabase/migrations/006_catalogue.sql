-- 006_catalogue.sql — Lagestion
-- Catalogue d'articles (produits et services) réutilisables dans les lignes de facture (FR-006).
--   - table produits, mêmes règles que les tables métier de 002 et 003 :
--     RLS (lecture = membres ; création et modification = admin, manager, commercial, comptable ;
--     suppression définitive = admin, manager), entreprise_id figé, audit, suppression logique
--     (deleted_at) réservée aux admin et manager ;
--   - référence facultative, unique par entreprise parmi les articles non supprimés ;
--   - lignes_facture.produit_id (facultatif) : trace de l'article d'origine, de la même entreprise.
-- S'applique après 005_totaux_remises.sql. Rejouable sans erreur.

begin;

-- 1. Table
create table if not exists public.produits (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  type text not null default 'service' check (type in ('produit', 'service')),
  reference text,
  nom text not null check (btrim(nom) <> ''),
  description text,
  unite text,
  prix_unitaire_ht numeric(12,2) not null default 0 check (prix_unitaire_ht >= 0),
  taux_tva numeric(4,2) not null default 20 check (taux_tva >= 0),
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
grant select, insert, update, delete on public.produits to authenticated;

create index if not exists idx_produits_entreprise on public.produits(entreprise_id) where deleted_at is null;
-- Unicité des références renseignées, parmi les articles non supprimés
create unique index if not exists uniq_produits_reference on public.produits (entreprise_id, reference)
  where deleted_at is null and reference is not null;

-- 2. Triggers : updated_at, entreprise figée, suppression logique, audit
drop trigger if exists trg_produits_updated on public.produits;
create trigger trg_produits_updated before update on public.produits
  for each row execute function public.set_updated_at();

drop trigger if exists trg_produits_entreprise on public.produits;
create trigger trg_produits_entreprise before insert or update on public.produits
  for each row execute function public.verifier_entreprise();

drop trigger if exists trg_produits_suppression_logique on public.produits;
create trigger trg_produits_suppression_logique before update on public.produits
  for each row execute function public.verifier_suppression_logique();

drop trigger if exists audit_produits on public.produits;
create trigger audit_produits after insert or update or delete on public.produits
  for each row execute function public.audit_trigger();

-- 3. RLS
alter table public.produits enable row level security;
drop policy if exists lecture_membres on public.produits;
drop policy if exists creation_equipe on public.produits;
drop policy if exists modification_equipe on public.produits;
drop policy if exists suppression_direction on public.produits;
create policy lecture_membres on public.produits for select to authenticated
  using (public.is_member(entreprise_id));
create policy creation_equipe on public.produits for insert to authenticated
  with check (public.has_role(entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]));
create policy modification_equipe on public.produits for update to authenticated
  using (public.has_role(entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]))
  with check (public.has_role(entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]));
create policy suppression_direction on public.produits for delete to authenticated
  using (public.has_role(entreprise_id, '{admin,manager}'::public.app_role[]));

-- 4. Lignes de facture : article d'origine (facultatif, même entreprise que la ligne)
alter table public.lignes_facture
  add column if not exists produit_id uuid references public.produits(id) on delete set null;
create index if not exists idx_lignes_facture_produit on public.lignes_facture(produit_id)
  where produit_id is not null;

drop trigger if exists trg_lignes_facture_produit on public.lignes_facture;
create trigger trg_lignes_facture_produit before insert or update of produit_id, entreprise_id on public.lignes_facture
  for each row when (new.produit_id is not null)
  execute function public.verifier_entreprise('produits', 'produit_id');

-- 5. Contrôles finaux
do $$
declare n int;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.produits'::regclass) then
    raise exception 'Contrôle : RLS inactive sur public.produits';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'produits';
  if n <> 4 then
    raise exception 'Contrôle : public.produits a % politique(s) au lieu de 4', n;
  end if;
  select count(*) into n from pg_trigger
   where not tgisinternal and tgrelid = 'public.produits'::regclass
     and tgname in ('trg_produits_updated', 'trg_produits_entreprise',
                    'trg_produits_suppression_logique', 'audit_produits');
  if n <> 4 then
    raise exception 'Contrôle : % trigger(s) sur public.produits au lieu de 4', n;
  end if;
  if not exists (select 1 from pg_trigger where not tgisinternal
                 and tgrelid = 'public.lignes_facture'::regclass and tgname = 'trg_lignes_facture_produit') then
    raise exception 'Contrôle : trigger trg_lignes_facture_produit absent';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'uniq_produits_reference') then
    raise exception 'Contrôle : index uniq_produits_reference absent';
  end if;
end $$;

commit;
