-- 012_taches_activites.sql — LaGestion
-- Vérifie la migration 012 (tâches, notes et activités) :
--   - droits par rôle : lecture sans écriture ; création par les rôles qui écrivent ; statut d'une tâche par tout rôle
--     qui écrit ; reste de la modification et suppression logique réservés (tâche : auteur, responsable, admin, manager ;
--     activité : auteur, admin, manager) ; aucune suppression physique ;
--   - auteur et nom figés par la base ; date de réalisation cohérente avec le statut ;
--   - liens : même entreprise, au plus un objet par tâche, opportunité du même client pour une activité ;
--   - responsable membre de l'entreprise avec un rôle qui écrit : assignation hors entreprise ou à un membre lecture refusée ;
--   - une seule tâche à faire par suggestion du tableau de bord ;
--   - isolation entre deux entreprises.
-- À lancer après migrations/012_taches_activites.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0120…)
--   entreprise A …00e1 : lecture …0001 · commercial …0002 · comptable …0003 · manager …0004 · admin …0005 · commercial …0007
--   entreprise B …00e2 : admin …0006
--   clients : A …00c1 et …00c3, B …00c2 ; opportunités : A …00a1 (client …00c1), B …00a2 ; factures : A …0f01, B …0f02 ; devis A …0d01

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role)
select ('a0120000-0000-4000-8000-00000000000' || i)::uuid, 'test-012-' || i || '@lagestion.invalid', 'authenticated', 'authenticated'
from generate_series(1, 7) i;

insert into public.profiles (id, nom) values
  ('a0120000-0000-4000-8000-000000000002', 'Camille Commerciale'),
  ('a0120000-0000-4000-8000-000000000003', 'Chris Comptable'),
  ('a0120000-0000-4000-8000-000000000007', 'Dominique Commercial')
on conflict (id) do update set nom = excluded.nom;

insert into public.entreprises (id, nom) values
  ('a0120000-0000-4000-8000-0000000000e1', 'Entreprise A (test 012)'),
  ('a0120000-0000-4000-8000-0000000000e2', 'Entreprise B (test 012)');

insert into public.memberships (entreprise_id, user_id, role) values
  ('a0120000-0000-4000-8000-0000000000e1', 'a0120000-0000-4000-8000-000000000001', 'lecture'),
  ('a0120000-0000-4000-8000-0000000000e1', 'a0120000-0000-4000-8000-000000000002', 'commercial'),
  ('a0120000-0000-4000-8000-0000000000e1', 'a0120000-0000-4000-8000-000000000003', 'comptable'),
  ('a0120000-0000-4000-8000-0000000000e1', 'a0120000-0000-4000-8000-000000000004', 'manager'),
  ('a0120000-0000-4000-8000-0000000000e1', 'a0120000-0000-4000-8000-000000000005', 'admin'),
  ('a0120000-0000-4000-8000-0000000000e1', 'a0120000-0000-4000-8000-000000000007', 'commercial'),
  ('a0120000-0000-4000-8000-0000000000e2', 'a0120000-0000-4000-8000-000000000006', 'admin');

insert into public.clients (id, entreprise_id, nom) values
  ('a0120000-0000-4000-8000-0000000000c1', 'a0120000-0000-4000-8000-0000000000e1', 'Client A'),
  ('a0120000-0000-4000-8000-0000000000c3', 'a0120000-0000-4000-8000-0000000000e1', 'Autre client A'),
  ('a0120000-0000-4000-8000-0000000000c2', 'a0120000-0000-4000-8000-0000000000e2', 'Client B');
insert into public.opportunites (id, entreprise_id, client_id, nom) values
  ('a0120000-0000-4000-8000-0000000000a1', 'a0120000-0000-4000-8000-0000000000e1', 'a0120000-0000-4000-8000-0000000000c1', 'Opportunité A'),
  ('a0120000-0000-4000-8000-0000000000a2', 'a0120000-0000-4000-8000-0000000000e2', 'a0120000-0000-4000-8000-0000000000c2', 'Opportunité B');
insert into public.factures (id, entreprise_id, client_id) values
  ('a0120000-0000-4000-8000-000000000f01', 'a0120000-0000-4000-8000-0000000000e1', 'a0120000-0000-4000-8000-0000000000c1'),
  ('a0120000-0000-4000-8000-000000000f02', 'a0120000-0000-4000-8000-0000000000e2', 'a0120000-0000-4000-8000-0000000000c2');
insert into public.devis (id, entreprise_id, client_id) values
  ('a0120000-0000-4000-8000-000000000d01', 'a0120000-0000-4000-8000-0000000000e1', 'a0120000-0000-4000-8000-0000000000c1');

create function public._t012_refuse(p_sql text, p_extrait text) returns void
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
grant execute on function public._t012_refuse(text, text) to authenticated;

-- Nombre de lignes touchées par une mise à jour (0 quand la RLS l'écarte)
create function public._t012_lignes(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public._t012_lignes(text) to authenticated;

set local role authenticated;

-- 2. Commercial (A) : création, auteur figé, liens, responsable, anti-doublon
select set_config('request.jwt.claims', '{"sub":"a0120000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare a record; t record;
begin
  -- Activité : l'auteur fourni par le navigateur est ignoré
  insert into public.activites (id, entreprise_id, type, client_id, commentaire, auteur, auteur_nom)
  values ('a0120000-0000-4000-8000-0000000000b1', 'a0120000-0000-4000-8000-0000000000e1', 'appel',
          'a0120000-0000-4000-8000-0000000000c1', 'Appel de suivi', 'a0120000-0000-4000-8000-000000000005', 'Faux nom');
  select * into a from public.activites where id = 'a0120000-0000-4000-8000-0000000000b1';
  if a.auteur is distinct from 'a0120000-0000-4000-8000-000000000002'::uuid or a.auteur_nom <> 'Camille Commerciale' then
    raise exception 'ÉCHEC : auteur d''activité non figé (%, %)', a.auteur, a.auteur_nom;
  end if;
  -- Activité sur l'opportunité seule, puis opportunité et son client
  insert into public.activites (entreprise_id, type, opportunite_id, commentaire)
  values ('a0120000-0000-4000-8000-0000000000e1', 'rendez_vous', 'a0120000-0000-4000-8000-0000000000a1', 'Visite du chantier');
  insert into public.activites (entreprise_id, type, client_id, opportunite_id, commentaire)
  values ('a0120000-0000-4000-8000-0000000000e1', 'email', 'a0120000-0000-4000-8000-0000000000c1', 'a0120000-0000-4000-8000-0000000000a1', 'Devis envoyé');

  perform public._t012_refuse($q$insert into public.activites (entreprise_id, type, client_id, commentaire) values ('a0120000-0000-4000-8000-0000000000e1', 'note', 'a0120000-0000-4000-8000-0000000000c2', 'Client de B')$q$, 'même entreprise');
  perform public._t012_refuse($q$insert into public.activites (entreprise_id, type, client_id, opportunite_id, commentaire) values ('a0120000-0000-4000-8000-0000000000e1', 'note', 'a0120000-0000-4000-8000-0000000000c3', 'a0120000-0000-4000-8000-0000000000a1', 'Mauvais client')$q$, 'n''appartient pas à ce client');
  perform public._t012_refuse($q$insert into public.activites (entreprise_id, type, commentaire) values ('a0120000-0000-4000-8000-0000000000e1', 'note', 'Sans objet')$q$, 'activites_objet');
  perform public._t012_refuse($q$insert into public.activites (entreprise_id, type, client_id, commentaire) values ('a0120000-0000-4000-8000-0000000000e1', 'fax', 'a0120000-0000-4000-8000-0000000000c1', 'Type inconnu')$q$, 'check');
  perform public._t012_refuse($q$insert into public.activites (entreprise_id, type, client_id, commentaire) values ('a0120000-0000-4000-8000-0000000000e1', 'note', 'a0120000-0000-4000-8000-0000000000c1', '   ')$q$, 'check');
  perform public._t012_refuse($q$insert into public.activites (entreprise_id, type, client_id, commentaire, deleted_at) values ('a0120000-0000-4000-8000-0000000000e1', 'note', 'a0120000-0000-4000-8000-0000000000c1', 'Supprimée', now())$q$, 'créée supprimée');

  -- Tâche assignée au comptable, liée à la facture de A
  insert into public.taches (id, entreprise_id, titre, echeance, responsable, facture_id, auteur, statut)
  values ('a0120000-0000-4000-8000-0000000007a1', 'a0120000-0000-4000-8000-0000000000e1', 'Rappeler le client',
          public.date_du_jour_paris(), 'a0120000-0000-4000-8000-000000000003', 'a0120000-0000-4000-8000-000000000f01',
          'a0120000-0000-4000-8000-000000000005', 'a_faire');
  select * into t from public.taches where id = 'a0120000-0000-4000-8000-0000000007a1';
  if t.auteur is distinct from 'a0120000-0000-4000-8000-000000000002'::uuid or t.faite_le is not null then
    raise exception 'ÉCHEC : tâche créée incohérente (auteur %, faite_le %)', t.auteur, t.faite_le;
  end if;
  -- Créée faite : date de réalisation posée par la base
  insert into public.taches (entreprise_id, titre, echeance, responsable, statut, faite_le)
  values ('a0120000-0000-4000-8000-0000000000e1', 'Déjà faite', public.date_du_jour_paris(), 'a0120000-0000-4000-8000-000000000002', 'faite', null);
  if (select faite_le from public.taches where titre = 'Déjà faite') is null then
    raise exception 'ÉCHEC : faite_le non posée à la création d''une tâche faite';
  end if;

  -- Responsable : membre de l'entreprise de la tâche, uniquement
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable) values ('a0120000-0000-4000-8000-0000000000e1', 'Hors entreprise', current_date, 'a0120000-0000-4000-8000-000000000006')$q$, 'membre de l''entreprise');
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable) values ('a0120000-0000-4000-8000-0000000000e1', 'Inconnu', current_date, gen_random_uuid())$q$, 'membre de l''entreprise');
  -- Membre au rôle lecture : ne pourrait pas marquer sa tâche faite
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable) values ('a0120000-0000-4000-8000-0000000000e1', 'Pour la lecture', current_date, 'a0120000-0000-4000-8000-000000000001')$q$, 'rôle qui écrit');
  -- Liens : même entreprise, un objet au plus ; échéance et titre obligatoires
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable, facture_id) values ('a0120000-0000-4000-8000-0000000000e1', 'Facture de B', current_date, 'a0120000-0000-4000-8000-000000000002', 'a0120000-0000-4000-8000-000000000f02')$q$, 'même entreprise');
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable, opportunite_id) values ('a0120000-0000-4000-8000-0000000000e1', 'Opportunité de B', current_date, 'a0120000-0000-4000-8000-000000000002', 'a0120000-0000-4000-8000-0000000000a2')$q$, 'même entreprise');
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable, client_id, devis_id) values ('a0120000-0000-4000-8000-0000000000e1', 'Deux objets', current_date, 'a0120000-0000-4000-8000-000000000002', 'a0120000-0000-4000-8000-0000000000c1', 'a0120000-0000-4000-8000-000000000d01')$q$, 'taches_un_objet');
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, responsable) values ('a0120000-0000-4000-8000-0000000000e1', 'Sans échéance', 'a0120000-0000-4000-8000-000000000002')$q$, 'echeance');
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable) values ('a0120000-0000-4000-8000-0000000000e1', '', current_date, 'a0120000-0000-4000-8000-000000000002')$q$, 'check');
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable, origine) values ('a0120000-0000-4000-8000-0000000000e1', 'Origine sans objet', current_date, 'a0120000-0000-4000-8000-000000000002', 'relance')$q$, 'taches_origine');
  insert into public.taches (entreprise_id, titre, echeance, responsable, devis_id)
  values ('a0120000-0000-4000-8000-0000000000e1', 'Relancer le devis', current_date + 3, 'a0120000-0000-4000-8000-000000000002', 'a0120000-0000-4000-8000-000000000d01');

  -- Anti-doublon : une seule tâche à faire par suggestion ; possible à nouveau une fois la première faite
  insert into public.taches (id, entreprise_id, titre, echeance, responsable, facture_id, origine)
  values ('a0120000-0000-4000-8000-0000000007a2', 'a0120000-0000-4000-8000-0000000000e1', 'Relancer la facture', current_date,
          'a0120000-0000-4000-8000-000000000002', 'a0120000-0000-4000-8000-000000000f01', 'relance');
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable, facture_id, origine) values ('a0120000-0000-4000-8000-0000000000e1', 'Doublon', current_date, 'a0120000-0000-4000-8000-000000000002', 'a0120000-0000-4000-8000-000000000f01', 'relance')$q$, 'uniq_taches_origine');
  update public.taches set statut = 'faite' where id = 'a0120000-0000-4000-8000-0000000007a2';
  insert into public.taches (entreprise_id, titre, echeance, responsable, facture_id, origine)
  values ('a0120000-0000-4000-8000-0000000000e1', 'Nouvelle relance', current_date, 'a0120000-0000-4000-8000-000000000002', 'a0120000-0000-4000-8000-000000000f01', 'relance');
  -- Une autre origine sur la même facture reste possible
  insert into public.taches (entreprise_id, titre, echeance, responsable, facture_id, origine)
  values ('a0120000-0000-4000-8000-0000000000e1', 'Finaliser', current_date, 'a0120000-0000-4000-8000-000000000002', 'a0120000-0000-4000-8000-000000000f01', 'brouillon');
end $$;

-- 3. Lecture (A) : voit, n'écrit rien
select set_config('request.jwt.claims', '{"sub":"a0120000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.taches) < 5 or (select count(*) from public.activites) <> 3 then
    raise exception 'ÉCHEC : le rôle lecture ne voit pas les tâches et activités de son entreprise';
  end if;
  perform public._t012_refuse($q$insert into public.activites (entreprise_id, type, client_id, commentaire) values ('a0120000-0000-4000-8000-0000000000e1', 'note', 'a0120000-0000-4000-8000-0000000000c1', 'Lecture')$q$, 'row-level security');
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable) values ('a0120000-0000-4000-8000-0000000000e1', 'Lecture', current_date, 'a0120000-0000-4000-8000-000000000002')$q$, 'row-level security');
  if public._t012_lignes($q$update public.taches set statut = 'faite' where id = 'a0120000-0000-4000-8000-0000000007a1'$q$) <> 0
     or public._t012_lignes($q$update public.activites set commentaire = 'Modifié' where id = 'a0120000-0000-4000-8000-0000000000b1'$q$) <> 0 then
    raise exception 'ÉCHEC : le rôle lecture a modifié une ligne';
  end if;
end $$;

-- 4. Autre commercial (A), ni auteur ni responsable : statut seulement
select set_config('request.jwt.claims', '{"sub":"a0120000-0000-4000-8000-000000000007","role":"authenticated"}', true);
do $$
declare t record;
begin
  update public.taches set statut = 'faite' where id = 'a0120000-0000-4000-8000-0000000007a1';
  select * into t from public.taches where id = 'a0120000-0000-4000-8000-0000000007a1';
  if t.statut <> 'faite' or t.faite_le is null then raise exception 'ÉCHEC : statut non changé par un autre commercial'; end if;
  update public.taches set statut = 'a_faire' where id = 'a0120000-0000-4000-8000-0000000007a1';
  if (select faite_le from public.taches where id = 'a0120000-0000-4000-8000-0000000007a1') is not null then
    raise exception 'ÉCHEC : faite_le non effacée au retour à faire';
  end if;
  -- faite_le ne se force pas
  update public.taches set faite_le = now() where id = 'a0120000-0000-4000-8000-0000000007a1';
  if (select faite_le from public.taches where id = 'a0120000-0000-4000-8000-0000000007a1') is not null then
    raise exception 'ÉCHEC : faite_le forcée sans changement de statut';
  end if;
  perform public._t012_refuse($q$update public.taches set titre = 'Autre titre' where id = 'a0120000-0000-4000-8000-0000000007a1'$q$, 'Seuls l''auteur, le responsable');
  perform public._t012_refuse($q$update public.taches set echeance = echeance + 1 where id = 'a0120000-0000-4000-8000-0000000007a1'$q$, 'Seuls l''auteur, le responsable');
  perform public._t012_refuse($q$update public.taches set responsable = 'a0120000-0000-4000-8000-000000000007' where id = 'a0120000-0000-4000-8000-0000000007a1'$q$, 'Seuls l''auteur, le responsable');
  perform public._t012_refuse($q$update public.taches set deleted_at = now() where id = 'a0120000-0000-4000-8000-0000000007a1'$q$, 'Seuls l''auteur, le responsable');
  perform public._t012_refuse($q$update public.activites set commentaire = 'Modifié' where id = 'a0120000-0000-4000-8000-0000000000b1'$q$, 'Seuls l''auteur, un administrateur');
  perform public._t012_refuse($q$update public.activites set deleted_at = now() where id = 'a0120000-0000-4000-8000-0000000000b1'$q$, 'Seuls l''auteur, un administrateur');
end $$;

-- 5. Comptable (A), responsable de la tâche : la modifie
select set_config('request.jwt.claims', '{"sub":"a0120000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
begin
  update public.taches set titre = 'Rappeler le client (comptable)', echeance = echeance + 1 where id = 'a0120000-0000-4000-8000-0000000007a1';
  -- Le comptable n'est pas l'auteur de l'activité
  perform public._t012_refuse($q$update public.activites set commentaire = 'Modifié' where id = 'a0120000-0000-4000-8000-0000000000b1'$q$, 'Seuls l''auteur, un administrateur');
end $$;

-- 6. Commercial (A), auteur : modifie sa tâche et son activité ; réassignation dans l'entreprise seulement
select set_config('request.jwt.claims', '{"sub":"a0120000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare a record;
begin
  update public.taches set responsable = 'a0120000-0000-4000-8000-000000000004' where id = 'a0120000-0000-4000-8000-0000000007a1';
  perform public._t012_refuse($q$update public.taches set responsable = 'a0120000-0000-4000-8000-000000000006' where id = 'a0120000-0000-4000-8000-0000000007a1'$q$, 'membre de l''entreprise');
  perform public._t012_refuse($q$update public.taches set responsable = 'a0120000-0000-4000-8000-000000000001' where id = 'a0120000-0000-4000-8000-0000000007a1'$q$, 'rôle qui écrit');
  perform public._t012_refuse($q$update public.taches set client_id = 'a0120000-0000-4000-8000-0000000000c2', facture_id = null where id = 'a0120000-0000-4000-8000-0000000007a1'$q$, 'même entreprise');
  perform public._t012_refuse($q$update public.taches set entreprise_id = 'a0120000-0000-4000-8000-0000000000e2' where id = 'a0120000-0000-4000-8000-0000000007a1'$q$, '');
  update public.activites set commentaire = 'Appel de suivi, rappel prévu', auteur = 'a0120000-0000-4000-8000-000000000005'
   where id = 'a0120000-0000-4000-8000-0000000000b1';
  select * into a from public.activites where id = 'a0120000-0000-4000-8000-0000000000b1';
  if a.auteur is distinct from 'a0120000-0000-4000-8000-000000000002'::uuid or a.commentaire <> 'Appel de suivi, rappel prévu' then
    raise exception 'ÉCHEC : modification de l''auteur incohérente (%, %)', a.auteur, a.commentaire;
  end if;
end $$;

-- 7. Manager (A) : suppression logique d'une tâche dont il n'est ni auteur ni responsable… puis plus aucune modification
select set_config('request.jwt.claims', '{"sub":"a0120000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
begin
  update public.taches set deleted_at = now() where titre = 'Relancer le devis';
  perform public._t012_refuse($q$update public.taches set titre = 'Après suppression' where titre = 'Relancer le devis'$q$, 'supprimée');
end $$;

-- 8. Admin (A) : modifie et supprime l'activité d'un autre ; aucune suppression physique
select set_config('request.jwt.claims', '{"sub":"a0120000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
begin
  update public.activites set commentaire = 'Corrigé par l''admin' where id = 'a0120000-0000-4000-8000-0000000000b1';
  update public.activites set deleted_at = now() where id = 'a0120000-0000-4000-8000-0000000000b1';
  perform public._t012_refuse($q$update public.activites set commentaire = 'Après suppression' where id = 'a0120000-0000-4000-8000-0000000000b1'$q$, 'supprimée');
  perform public._t012_refuse($q$delete from public.taches where id = 'a0120000-0000-4000-8000-0000000007a1'$q$, 'permission denied');
  perform public._t012_refuse($q$delete from public.activites where id = 'a0120000-0000-4000-8000-0000000000b1'$q$, 'permission denied');
end $$;

-- 9. Admin de B : isolation
select set_config('request.jwt.claims', '{"sub":"a0120000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.taches) <> 0 or (select count(*) from public.activites) <> 0 then
    raise exception 'ÉCHEC : l''entreprise B voit des tâches ou activités de A';
  end if;
  if public._t012_lignes($q$update public.taches set statut = 'faite'$q$) <> 0
     or public._t012_lignes($q$update public.activites set commentaire = 'B'$q$) <> 0 then
    raise exception 'ÉCHEC : l''entreprise B a modifié une ligne de A';
  end if;
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable) values ('a0120000-0000-4000-8000-0000000000e1', 'Intrusion', current_date, 'a0120000-0000-4000-8000-000000000002')$q$, 'row-level security');
  perform public._t012_refuse($q$insert into public.activites (entreprise_id, type, client_id, commentaire) values ('a0120000-0000-4000-8000-0000000000e1', 'note', 'a0120000-0000-4000-8000-0000000000c1', 'Intrusion')$q$, 'row-level security');
  -- Dans sa propre entreprise, B ne peut assigner un membre de A ni lier un objet de A
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable) values ('a0120000-0000-4000-8000-0000000000e2', 'Membre de A', current_date, 'a0120000-0000-4000-8000-000000000002')$q$, 'membre de l''entreprise');
  perform public._t012_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable, client_id) values ('a0120000-0000-4000-8000-0000000000e2', 'Client de A', current_date, 'a0120000-0000-4000-8000-000000000006', 'a0120000-0000-4000-8000-0000000000c1')$q$, 'même entreprise');
  insert into public.taches (entreprise_id, titre, echeance, responsable, client_id)
  values ('a0120000-0000-4000-8000-0000000000e2', 'Tâche de B', current_date, 'a0120000-0000-4000-8000-000000000006', 'a0120000-0000-4000-8000-0000000000c2');
end $$;

-- 10. Contrôle final (rôle postgres) : B n'a qu'une tâche, A n'en voit pas d'autre entreprise
reset role;
do $$
begin
  if (select count(*) from public.taches where entreprise_id = 'a0120000-0000-4000-8000-0000000000e2') <> 1 then
    raise exception 'ÉCHEC : tâches de B inattendues';
  end if;
  if exists (select 1 from public.taches t where t.responsable not in (select user_id from public.memberships m where m.entreprise_id = t.entreprise_id and m.role <> 'lecture')) then
    raise exception 'ÉCHEC : une tâche a un responsable hors de son entreprise ou au rôle lecture';
  end if;
end $$;

do $$ begin raise notice 'Tests 012 : tous passés.'; end $$;

rollback;
