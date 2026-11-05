-- 003_droits.sql — Lagestion
-- Vérifie la migration 003 :
--   - un commercial peut supprimer une ligne de facture de son entreprise ;
--   - un commercial ne peut ni renseigner ni effacer deleted_at (clients, opportunites, factures) ;
--   - un manager le peut.
-- À lancer après migrations/003_droits_lignes_et_suppression.sql, dans le SQL Editor (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (entreprise D)
--   commercial d0000000-…-000000000001 · manager d0000000-…-000000000002 · entreprise d0000000-…-0000000000e0

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role) values
  ('d0000000-0000-4000-8000-000000000001', 'test-commercial@lagestion.invalid', 'authenticated', 'authenticated'),
  ('d0000000-0000-4000-8000-000000000002', 'test-manager@lagestion.invalid', 'authenticated', 'authenticated');

insert into public.entreprises (id, nom) values
  ('d0000000-0000-4000-8000-0000000000e0', 'Entreprise D (test)');

insert into public.memberships (entreprise_id, user_id, role) values
  ('d0000000-0000-4000-8000-0000000000e0', 'd0000000-0000-4000-8000-000000000001', 'commercial'),
  ('d0000000-0000-4000-8000-0000000000e0', 'd0000000-0000-4000-8000-000000000002', 'manager');

insert into public.clients (id, entreprise_id, nom) values
  ('d0000000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-0000000000e0', 'Client actif'),
  ('d0000000-0000-4000-8000-0000000000c2', 'd0000000-0000-4000-8000-0000000000e0', 'Client archivé');
update public.clients set deleted_at = now() where id = 'd0000000-0000-4000-8000-0000000000c2';

insert into public.opportunites (id, entreprise_id, client_id, nom) values
  ('d0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000e0', 'd0000000-0000-4000-8000-0000000000c1', 'Opportunité D');

insert into public.factures (id, entreprise_id, client_id, numero) values
  ('d0000000-0000-4000-8000-0000000000f1', 'd0000000-0000-4000-8000-0000000000e0', 'd0000000-0000-4000-8000-0000000000c1', 'D-0001');

insert into public.lignes_facture (id, entreprise_id, facture_id, description, prix_unitaire) values
  ('d0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000e0', 'd0000000-0000-4000-8000-0000000000f1', 'Ligne 1', 100),
  ('d0000000-0000-4000-8000-0000000000b2', 'd0000000-0000-4000-8000-0000000000e0', 'd0000000-0000-4000-8000-0000000000f1', 'Ligne 2', 200);

-- 2. Simulation du commercial
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}';

do $$
declare n int; refuse boolean;
begin
  if auth.uid() is distinct from 'd0000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'ÉCHEC : auth.uid() ne renvoie pas le commercial (simulation JWT inopérante)';
  end if;

  -- Le commercial supprime une ligne de facture de son entreprise
  delete from public.lignes_facture where id = 'd0000000-0000-4000-8000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : le commercial n''a pas pu supprimer la ligne de facture (% ligne supprimée)', n; end if;

  -- Contrôle positif : il peut toujours modifier les autres champs
  update public.clients set nom = 'Client actif (modifié)' where id = 'd0000000-0000-4000-8000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : le commercial ne peut plus modifier un client'; end if;

  -- Il ne peut pas renseigner deleted_at
  refuse := false;
  begin
    update public.clients set deleted_at = now() where id = 'd0000000-0000-4000-8000-0000000000c1';
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : le commercial a supprimé (deleted_at) un client'; end if;

  refuse := false;
  begin
    update public.opportunites set deleted_at = now() where id = 'd0000000-0000-4000-8000-0000000000a1';
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : le commercial a supprimé (deleted_at) une opportunité'; end if;

  refuse := false;
  begin
    update public.factures set deleted_at = now() where id = 'd0000000-0000-4000-8000-0000000000f1';
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : le commercial a supprimé (deleted_at) une facture'; end if;

  -- Il ne peut pas non plus effacer deleted_at (restauration)
  refuse := false;
  begin
    update public.clients set deleted_at = null where id = 'd0000000-0000-4000-8000-0000000000c2';
  exception when insufficient_privilege then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : le commercial a restauré un client supprimé'; end if;
end $$;

-- 3. Simulation du manager
set local request.jwt.claims = '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}';

do $$
declare n int;
begin
  if auth.uid() is distinct from 'd0000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'ÉCHEC : auth.uid() ne renvoie pas le manager';
  end if;

  update public.clients set deleted_at = now() where id = 'd0000000-0000-4000-8000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : le manager n''a pas pu supprimer (deleted_at) le client'; end if;

  update public.opportunites set deleted_at = now() where id = 'd0000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : le manager n''a pas pu supprimer (deleted_at) l''opportunité'; end if;

  update public.factures set deleted_at = now() where id = 'd0000000-0000-4000-8000-0000000000f1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : le manager n''a pas pu supprimer (deleted_at) la facture'; end if;

  update public.clients set deleted_at = null where id = 'd0000000-0000-4000-8000-0000000000c2';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : le manager n''a pas pu restaurer le client'; end if;
end $$;

-- 4. Retour en postgres : état attendu
reset role;

do $$
declare n int;
begin
  select count(*) into n from public.lignes_facture where facture_id = 'd0000000-0000-4000-8000-0000000000f1';
  if n <> 1 then raise exception 'ÉCHEC état final : % ligne(s) de facture au lieu de 1', n; end if;
  select count(*) into n from public.clients
   where id = 'd0000000-0000-4000-8000-0000000000c1' and deleted_at is not null and nom = 'Client actif (modifié)';
  if n <> 1 then raise exception 'ÉCHEC état final : client actif dans un état inattendu'; end if;
  select count(*) into n from public.clients
   where id = 'd0000000-0000-4000-8000-0000000000c2' and deleted_at is null;
  if n <> 1 then raise exception 'ÉCHEC état final : client archivé non restauré'; end if;
end $$;

do $$ begin
  raise notice 'Tous les tests de droits 003 sont passés.';
end $$;

rollback;
