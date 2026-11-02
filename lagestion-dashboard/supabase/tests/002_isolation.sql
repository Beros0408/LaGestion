-- 002_isolation.sql — Lagestion
-- Vérifie qu'un utilisateur A ne voit, ne modifie ni ne supprime aucune ligne de l'entreprise de B.
-- À lancer après migrations/002_multitenant.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Tout se déroule dans une transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ;
-- sinon le premier test en échec lève une erreur « ÉCHEC : … ».
--
-- Identifiants fictifs
--   A : utilisateur a0000000-…-000000000001, entreprise a0000000-…-0000000000e0
--   B : utilisateur b0000000-…-000000000001, entreprise b0000000-…-0000000000e0

begin;

-- 1. Données de test (rôle postgres : la RLS ne s'applique pas)
insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-4000-8000-000000000001', 'test-a@lagestion.invalid', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-000000000001', 'test-b@lagestion.invalid', 'authenticated', 'authenticated');

insert into public.entreprises (id, nom) values
  ('a0000000-0000-4000-8000-0000000000e0', 'Entreprise A (test)'),
  ('b0000000-0000-4000-8000-0000000000e0', 'Entreprise B (test)');

insert into public.memberships (entreprise_id, user_id, role) values
  ('a0000000-0000-4000-8000-0000000000e0', 'a0000000-0000-4000-8000-000000000001', 'admin'),
  ('b0000000-0000-4000-8000-0000000000e0', 'b0000000-0000-4000-8000-000000000001', 'admin');

insert into public.clients (id, entreprise_id, nom, email) values
  ('a0000000-0000-4000-8000-0000000000c1', 'a0000000-0000-4000-8000-0000000000e0', 'Client A', 'client@a.test'),
  ('b0000000-0000-4000-8000-0000000000c1', 'b0000000-0000-4000-8000-0000000000e0', 'Client B', 'client@b.test');

insert into public.factures (id, entreprise_id, client_id, numero) values
  ('a0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-0000000000e0', 'a0000000-0000-4000-8000-0000000000c1', 'A-0001'),
  ('b0000000-0000-4000-8000-0000000000f1', 'b0000000-0000-4000-8000-0000000000e0', 'b0000000-0000-4000-8000-0000000000c1', 'B-0001');

insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire) values
  ('a0000000-0000-4000-8000-0000000000e0', 'a0000000-0000-4000-8000-0000000000f1', 'Ligne A', 100),
  ('b0000000-0000-4000-8000-0000000000e0', 'b0000000-0000-4000-8000-0000000000f1', 'Ligne B', 200);

insert into public.paiements (entreprise_id, facture_id, montant) values
  ('a0000000-0000-4000-8000-0000000000e0', 'a0000000-0000-4000-8000-0000000000f1', 50),
  ('b0000000-0000-4000-8000-0000000000e0', 'b0000000-0000-4000-8000-0000000000f1', 80);

-- Référence pour vérifier plus tard que l'audit de B n'a pas bougé
create temp table _audit_b_avant as
  select count(*) as nb from public.audit_events where entreprise_id = 'b0000000-0000-4000-8000-0000000000e0';

do $$ begin
  if (select nb from _audit_b_avant) = 0 then
    raise exception 'PRÉREQUIS : aucun audit_event pour B (triggers d''audit absents ?)';
  end if;
end $$;

-- 2. Simulation de l'utilisateur A
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- 2a. Lecture : A voit ses données, aucune de B
do $$
declare n int;
  e_b constant uuid := 'b0000000-0000-4000-8000-0000000000e0';
begin
  if auth.uid() is distinct from 'a0000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'ÉCHEC : auth.uid() ne renvoie pas A (simulation JWT inopérante)';
  end if;

  -- Contrôles positifs (sinon les « 0 ligne » ci-dessous ne prouvent rien)
  select count(*) into n from public.clients where id = 'a0000000-0000-4000-8000-0000000000c1';
  if n <> 1 then raise exception 'ÉCHEC : A ne voit pas son propre client'; end if;
  select count(*) into n from public.memberships where entreprise_id = 'a0000000-0000-4000-8000-0000000000e0';
  if n <> 1 then raise exception 'ÉCHEC : A ne voit pas sa propre appartenance'; end if;
  select count(*) into n from public.audit_events where entreprise_id = 'a0000000-0000-4000-8000-0000000000e0';
  if n = 0 then raise exception 'ÉCHEC : A (admin) ne voit pas l''audit de son entreprise'; end if;

  select count(*) into n from public.clients where entreprise_id = e_b;
  if n <> 0 then raise exception 'ÉCHEC lecture : A voit % client(s) de B', n; end if;
  select count(*) into n from public.factures where entreprise_id = e_b;
  if n <> 0 then raise exception 'ÉCHEC lecture : A voit % facture(s) de B', n; end if;
  select count(*) into n from public.lignes_facture where entreprise_id = e_b;
  if n <> 0 then raise exception 'ÉCHEC lecture : A voit % ligne(s) de facture de B', n; end if;
  select count(*) into n from public.paiements where entreprise_id = e_b;
  if n <> 0 then raise exception 'ÉCHEC lecture : A voit % paiement(s) de B', n; end if;
  select count(*) into n from public.memberships where entreprise_id = e_b;
  if n <> 0 then raise exception 'ÉCHEC lecture : A voit % appartenance(s) de B', n; end if;
  select count(*) into n from public.audit_events where entreprise_id = e_b;
  if n <> 0 then raise exception 'ÉCHEC lecture : A voit % événement(s) d''audit de B', n; end if;
  select count(*) into n from public.entreprises where id = e_b;
  if n <> 0 then raise exception 'ÉCHEC lecture : A voit l''entreprise B'; end if;
  select count(*) into n from public.factures_totaux where facture_id = 'b0000000-0000-4000-8000-0000000000f1';
  if n <> 0 then raise exception 'ÉCHEC lecture : la vue factures_totaux expose la facture de B'; end if;
end $$;

-- 2b. Modification : aucune ligne de B touchée
do $$
declare n int;
  e_b constant uuid := 'b0000000-0000-4000-8000-0000000000e0';
begin
  update public.clients set nom = 'Piraté' where entreprise_id = e_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC modification : A a modifié % client(s) de B', n; end if;

  update public.factures set statut = 'annulee' where entreprise_id = e_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC modification : A a modifié % facture(s) de B', n; end if;

  update public.memberships set role = 'lecture' where entreprise_id = e_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC modification : A a modifié % appartenance(s) de B', n; end if;

  begin
    update public.audit_events set action = 'falsifie' where entreprise_id = e_b;
    get diagnostics n = row_count;
  exception when insufficient_privilege then n := 0;  -- refus de droit : attendu
  end;
  if n <> 0 then raise exception 'ÉCHEC modification : A a modifié % événement(s) d''audit de B', n; end if;
end $$;

-- 2c. Suppression : aucune ligne de B supprimée
do $$
declare n int;
  e_b constant uuid := 'b0000000-0000-4000-8000-0000000000e0';
begin
  delete from public.paiements where entreprise_id = e_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC suppression : A a supprimé % paiement(s) de B', n; end if;

  delete from public.factures where entreprise_id = e_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC suppression : A a supprimé % facture(s) de B', n; end if;

  delete from public.clients where entreprise_id = e_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC suppression : A a supprimé % client(s) de B', n; end if;

  delete from public.memberships where entreprise_id = e_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC suppression : A a supprimé % appartenance(s) de B', n; end if;

  begin
    delete from public.audit_events where entreprise_id = e_b;
    get diagnostics n = row_count;
  exception when insufficient_privilege then n := 0;  -- refus de droit : attendu
  end;
  if n <> 0 then raise exception 'ÉCHEC suppression : A a supprimé % événement(s) d''audit de B', n; end if;
end $$;

-- 2d. Création : A ne peut rien écrire chez B (ni s'y rattacher)
do $$
declare refuse boolean;
  e_a constant uuid := 'a0000000-0000-4000-8000-0000000000e0';
  e_b constant uuid := 'b0000000-0000-4000-8000-0000000000e0';
begin
  refuse := false;
  begin
    insert into public.clients (entreprise_id, nom) values (e_b, 'Intrus');
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC création : A a créé un client chez B'; end if;

  refuse := false;
  begin
    insert into public.memberships (entreprise_id, user_id, role)
    values (e_b, 'a0000000-0000-4000-8000-000000000001', 'admin');
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC création : A s''est ajouté comme membre de B'; end if;

  refuse := false;
  begin
    insert into public.audit_events (entreprise_id, action, table_name)
    values (e_b, 'insert', 'clients');
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC création : A a écrit dans l''audit de B'; end if;

  -- Correction 16 : rattacher une ligne « de A » à une facture de B
  refuse := false;
  begin
    insert into public.lignes_facture (entreprise_id, facture_id, description)
    values (e_a, 'b0000000-0000-4000-8000-0000000000f1', 'Ligne glissée chez B');
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC création : A a ajouté une ligne à une facture de B'; end if;

  -- Correction 16 : facture de A sur un client de B
  refuse := false;
  begin
    insert into public.factures (entreprise_id, client_id, numero)
    values (e_a, 'b0000000-0000-4000-8000-0000000000c1', 'A-INTRUS');
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC création : A a créé une facture sur un client de B'; end if;

  -- Contrôle positif : A peut toujours créer chez lui
  insert into public.clients (entreprise_id, nom) values (e_a, 'Nouveau client A');
end $$;

-- 3. Retour en postgres : l'état de B est intact
reset role;

do $$
declare n int;
  e_b constant uuid := 'b0000000-0000-4000-8000-0000000000e0';
begin
  select count(*) into n from public.clients where entreprise_id = e_b and nom = 'Client B';
  if n <> 1 then raise exception 'ÉCHEC état final : client de B modifié ou supprimé'; end if;
  select count(*) into n from public.factures where entreprise_id = e_b and statut = 'brouillon';
  if n <> 1 then raise exception 'ÉCHEC état final : facture de B modifiée ou supprimée'; end if;
  select count(*) into n from public.lignes_facture where entreprise_id = e_b;
  if n <> 1 then raise exception 'ÉCHEC état final : lignes de B modifiées (% au lieu de 1)', n; end if;
  select count(*) into n from public.paiements where entreprise_id = e_b;
  if n <> 1 then raise exception 'ÉCHEC état final : paiements de B modifiés (% au lieu de 1)', n; end if;
  select count(*) into n from public.memberships where entreprise_id = e_b and role = 'admin';
  if n <> 1 then raise exception 'ÉCHEC état final : appartenance de B modifiée ou supprimée'; end if;
  select count(*) into n from public.memberships where entreprise_id = e_b;
  if n <> 1 then raise exception 'ÉCHEC état final : % appartenance(s) chez B au lieu de 1', n; end if;
  if (select count(*) from public.audit_events where entreprise_id = e_b) <> (select nb from _audit_b_avant) then
    raise exception 'ÉCHEC état final : l''audit de B a changé';
  end if;
end $$;

-- 4. Correction 16 (même sans RLS) : entreprise_id ne peut pas être modifié
do $$
declare refuse boolean := false;
begin
  begin
    update public.clients set entreprise_id = 'b0000000-0000-4000-8000-0000000000e0'
     where id = 'a0000000-0000-4000-8000-0000000000c1';
  exception when others then refuse := true;
  end;
  if not refuse then raise exception 'ÉCHEC : le client de A a pu être déplacé vers B'; end if;
end $$;

-- 5. Correction 15 : supprimer une entreprise dont les clients sont audités ne bloque pas
insert into public.entreprises (id, nom) values ('c0000000-0000-4000-8000-0000000000e0', 'Entreprise C (test)');
insert into public.clients (entreprise_id, nom) values ('c0000000-0000-4000-8000-0000000000e0', 'Client C');
delete from public.entreprises where id = 'c0000000-0000-4000-8000-0000000000e0';

do $$ begin
  raise notice 'Tous les tests d''isolation 002 sont passés.';
end $$;

rollback;
