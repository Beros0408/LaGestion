-- 006_catalogue.sql — Lagestion
-- Vérifie la migration 006 (catalogue) :
--   - isolation : les membres de A ne voient, ne modifient ni ne référencent aucun article de B ;
--   - droits : lecture ne crée rien ; commercial et comptable créent et modifient mais ne suppriment pas ;
--     manager supprime (deleted_at) ; admin supprime définitivement ;
--   - référence unique parmi les articles non supprimés, facultative, réutilisable après suppression ;
--   - audit des écritures.
-- À lancer après migrations/006_catalogue.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0060…)
--   entreprise A …00e1 : lecture …0001 · commercial …0002 · comptable …0003 · manager …0004 · admin …0005
--   entreprise B …00e2 : admin …0006 ; article de B …00b2

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role)
select ('a0060000-0000-4000-8000-00000000000' || i)::uuid, 'test-006-' || i || '@lagestion.invalid', 'authenticated', 'authenticated'
from generate_series(1, 6) i;

insert into public.entreprises (id, nom) values
  ('a0060000-0000-4000-8000-0000000000e1', 'Entreprise A (test 006)'),
  ('a0060000-0000-4000-8000-0000000000e2', 'Entreprise B (test 006)');

insert into public.memberships (entreprise_id, user_id, role) values
  ('a0060000-0000-4000-8000-0000000000e1', 'a0060000-0000-4000-8000-000000000001', 'lecture'),
  ('a0060000-0000-4000-8000-0000000000e1', 'a0060000-0000-4000-8000-000000000002', 'commercial'),
  ('a0060000-0000-4000-8000-0000000000e1', 'a0060000-0000-4000-8000-000000000003', 'comptable'),
  ('a0060000-0000-4000-8000-0000000000e1', 'a0060000-0000-4000-8000-000000000004', 'manager'),
  ('a0060000-0000-4000-8000-0000000000e1', 'a0060000-0000-4000-8000-000000000005', 'admin'),
  ('a0060000-0000-4000-8000-0000000000e2', 'a0060000-0000-4000-8000-000000000006', 'admin');

insert into public.produits (id, entreprise_id, type, reference, nom, prix_unitaire_ht) values
  ('a0060000-0000-4000-8000-0000000000b2', 'a0060000-0000-4000-8000-0000000000e2', 'produit', 'B-001', 'Article de B', 50);

insert into public.clients (id, entreprise_id, nom) values
  ('a0060000-0000-4000-8000-0000000000c1', 'a0060000-0000-4000-8000-0000000000e1', 'Client A');
insert into public.factures (id, entreprise_id, client_id, numero) values
  ('a0060000-0000-4000-8000-0000000000f1', 'a0060000-0000-4000-8000-0000000000e1', 'a0060000-0000-4000-8000-0000000000c1', 'A-006');

set local role authenticated;

-- 2. Lecture (A) : voit le catalogue de A uniquement, ne crée rien
select set_config('request.jwt.claims', '{"sub":"a0060000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare refuse boolean := false; n int;
begin
  select count(*) into n from public.produits where entreprise_id = 'a0060000-0000-4000-8000-0000000000e2';
  if n <> 0 then raise exception 'ÉCHEC : un membre de A voit % article(s) de B', n; end if;
  begin
    insert into public.produits (entreprise_id, nom) values ('a0060000-0000-4000-8000-0000000000e1', 'Interdit');
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : le rôle lecture a créé un article'; end if;
end $$;

-- 3. Commercial (A) : crée et modifie, ne supprime pas, n'atteint pas B
select set_config('request.jwt.claims', '{"sub":"a0060000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare refuse boolean; n int;
begin
  insert into public.produits (id, entreprise_id, type, reference, nom, unite, prix_unitaire_ht, taux_tva) values
    ('a0060000-0000-4000-8000-0000000000a1', 'a0060000-0000-4000-8000-0000000000e1', 'service', 'MO-H', 'Main-d''œuvre', 'h', 45, 10);
  -- Référence facultative : plusieurs articles sans référence
  insert into public.produits (entreprise_id, nom) values
    ('a0060000-0000-4000-8000-0000000000e1', 'Sans référence 1'),
    ('a0060000-0000-4000-8000-0000000000e1', 'Sans référence 2');

  update public.produits set prix_unitaire_ht = 48, actif = false where id = 'a0060000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : le commercial ne peut pas modifier un article'; end if;

  refuse := false;
  begin
    insert into public.produits (entreprise_id, reference, nom) values ('a0060000-0000-4000-8000-0000000000e1', 'MO-H', 'Doublon');
  exception when unique_violation then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : référence en double acceptée'; end if;

  refuse := false;
  begin
    update public.produits set deleted_at = now() where id = 'a0060000-0000-4000-8000-0000000000a1';
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : le commercial a supprimé (deleted_at) un article'; end if;

  delete from public.produits where id = 'a0060000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC : le commercial a supprimé définitivement un article'; end if;

  -- Isolation : B est invisible, non modifiable, non créable
  update public.produits set nom = 'Piraté' where id = 'a0060000-0000-4000-8000-0000000000b2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC : un membre de A a modifié un article de B'; end if;

  refuse := false;
  begin
    insert into public.produits (entreprise_id, nom) values ('a0060000-0000-4000-8000-0000000000e2', 'Intrus');
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : un membre de A a créé un article dans B'; end if;

  -- Ligne de facture : article de A accepté, article de B refusé
  insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire, produit_id) values
    ('a0060000-0000-4000-8000-0000000000e1', 'a0060000-0000-4000-8000-0000000000f1', 'Main-d''œuvre', 48,
     'a0060000-0000-4000-8000-0000000000a1');

  refuse := false;
  begin
    insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire, produit_id) values
      ('a0060000-0000-4000-8000-0000000000e1', 'a0060000-0000-4000-8000-0000000000f1', 'Article de B', 50,
       'a0060000-0000-4000-8000-0000000000b2');
  exception when raise_exception then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : une ligne de A référence un article de B'; end if;

  -- Ligne sans article : toujours acceptée
  insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire) values
    ('a0060000-0000-4000-8000-0000000000e1', 'a0060000-0000-4000-8000-0000000000f1', 'Ligne libre', 10);
end $$;

-- 4. Comptable (A) : crée
select set_config('request.jwt.claims', '{"sub":"a0060000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  insert into public.produits (id, entreprise_id, type, reference, nom) values
    ('a0060000-0000-4000-8000-0000000000a3', 'a0060000-0000-4000-8000-0000000000e1', 'produit', 'PLI-ML', 'Plinthe');
end $$;

-- 5. Manager (A) : suppression logique ; la référence redevient disponible
select set_config('request.jwt.claims', '{"sub":"a0060000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.produits set deleted_at = now() where id = 'a0060000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : le manager n''a pas pu supprimer (deleted_at) l''article'; end if;
  insert into public.produits (entreprise_id, reference, nom) values
    ('a0060000-0000-4000-8000-0000000000e1', 'MO-H', 'Main-d''œuvre (nouvel article)');
end $$;

-- 6. Admin (A) : suppression définitive
select set_config('request.jwt.claims', '{"sub":"a0060000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
declare n int;
begin
  delete from public.produits where id = 'a0060000-0000-4000-8000-0000000000a3';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : l''admin n''a pas pu supprimer définitivement l''article'; end if;
end $$;

-- 7. Retour en postgres : état attendu
reset role;
do $$
declare n int;
begin
  select count(*) into n from public.produits
   where id = 'a0060000-0000-4000-8000-0000000000b2' and nom = 'Article de B' and deleted_at is null;
  if n <> 1 then raise exception 'ÉCHEC état final : l''article de B a été modifié'; end if;

  select count(*) into n from public.lignes_facture
   where facture_id = 'a0060000-0000-4000-8000-0000000000f1' and produit_id = 'a0060000-0000-4000-8000-0000000000a1';
  if n <> 1 then raise exception 'ÉCHEC état final : la ligne n''a pas gardé son article d''origine'; end if;

  select count(*) into n from public.audit_events
   where table_name = 'produits' and entreprise_id = 'a0060000-0000-4000-8000-0000000000e1';
  if n < 6 then raise exception 'ÉCHEC : % événement(s) d''audit sur produits au lieu d''au moins 6', n; end if;
end $$;

do $$ begin
  raise notice 'Tous les tests du catalogue 006 sont passés.';
end $$;

rollback;
