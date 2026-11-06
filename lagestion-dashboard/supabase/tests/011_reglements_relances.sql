-- 011_reglements_relances.sql — Lagestion
-- Vérifie la migration 011 (règlements et relances) :
--   - statuts calculés : payée, partiellement payée, en retard, à la lecture ; aucun ne se pose à la main ;
--   - plafond des encaissements : TTC − avoirs, trop-perçu et remboursement conservés ;
--   - relances : facture échue et impayée, niveau sans saut, mise en demeure réservée, trace non modifiable ;
--   - isolation entre entreprises et droits par rôle.
-- La concurrence réelle se vérifie à part : supabase/tests/011_concurrence.mjs.
-- À lancer après migrations/011_reglements_relances.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0110…)
--   entreprise A …00e1 : lecture …0001 · commercial …0002 · comptable …0003 · manager …0004 · admin …0005
--   entreprise B …00e2 : admin …0006 ; client de B …00c2 ; facture de B …0f20

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role)
select ('a0110000-0000-4000-8000-00000000000' || i)::uuid, 'test-011-' || i || '@lagestion.invalid', 'authenticated', 'authenticated'
from generate_series(1, 6) i;

insert into public.profiles (id, nom) values
  ('a0110000-0000-4000-8000-000000000002', 'Camille Commerciale'),
  ('a0110000-0000-4000-8000-000000000003', 'Chris Comptable')
on conflict (id) do update set nom = excluded.nom;

insert into public.entreprises (id, nom, siret, adresse) values
  ('a0110000-0000-4000-8000-0000000000e1', 'Entreprise A (test 011)', '11111111100011', '1 rue de A, 75001 Paris'),
  ('a0110000-0000-4000-8000-0000000000e2', 'Entreprise B (test 011)', '22222222200022', '2 rue de B, 69001 Lyon');

insert into public.memberships (entreprise_id, user_id, role) values
  ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000001', 'lecture'),
  ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000002', 'commercial'),
  ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000003', 'comptable'),
  ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000004', 'manager'),
  ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000005', 'admin'),
  ('a0110000-0000-4000-8000-0000000000e2', 'a0110000-0000-4000-8000-000000000006', 'admin');

insert into public.clients (id, entreprise_id, nom) values
  ('a0110000-0000-4000-8000-0000000000c1', 'a0110000-0000-4000-8000-0000000000e1', 'Client A'),
  ('a0110000-0000-4000-8000-0000000000c2', 'a0110000-0000-4000-8000-0000000000e2', 'Client B');

-- Factures émises à 120 € TTC. L'échéance est posée en postgres, seule façon de créer une facture déjà échue :
-- une finalisation exige une échéance à venir.
create function public._t011_facture(p_id uuid, p_entreprise uuid, p_client uuid) returns void
language plpgsql as $$
begin
  insert into public.factures (id, entreprise_id, client_id, date_echeance)
  values (p_id, p_entreprise, p_client, public.date_du_jour_paris() + 30);
  insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire, taux_tva)
  values (p_entreprise, p_id, 'Ligne', 100, 20);
  perform public.finaliser_facture(p_id);
end $$;
grant execute on function public._t011_facture(uuid, uuid, uuid) to authenticated;

create function public._t011_refuse(p_sql text, p_extrait text) returns void
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
grant execute on function public._t011_refuse(text, text) to authenticated;

create function public._t011_statut(p_id uuid) returns text
language sql stable as $$ select statut_calcule from public.factures_soldes where facture_id = p_id $$;
grant execute on function public._t011_statut(uuid) to authenticated;

-- 2. Fonction de calcul : table de vérité, mêmes cas que tests/relances.test.js
do $$
declare
  c record;
  j constant date := '2026-11-10';
begin
  for c in select * from (values
    ('brouillon', 'facture', date '2026-01-01', 100, 0, 0, 'brouillon'),
    ('annulee',   'facture', date '2026-01-01', 100, 100, 0, 'annulee'),
    ('finalisee', 'avoir',   date '2026-01-01', -100, 0, 0, 'finalisee'),
    ('finalisee', 'facture', date '2026-12-01', 100, 0, 0, 'finalisee'),
    ('envoyee',   'facture', date '2026-12-01', 100, 0, 0, 'envoyee'),
    ('envoyee',   'acompte', date '2026-12-01', 100, 0, 40, 'partiellement_payee'),
    ('envoyee',   'solde',   date '2026-12-01', 100, 0, 100, 'payee'),
    ('envoyee',   'facture', date '2026-11-09', 100, 0, 0, 'en_retard'),
    ('envoyee',   'facture', date '2026-11-09', 100, 0, 40, 'en_retard'),
    ('envoyee',   'facture', date '2026-11-10', 100, 0, 0, 'envoyee'),
    ('envoyee',   'facture', date '2026-11-09', 100, 0, 100, 'payee'),
    ('envoyee',   'facture', date '2026-11-09', 100, 30, 70, 'payee'),
    ('envoyee',   'facture', date '2026-11-09', 100, 30, 100, 'payee'),
    ('envoyee',   'facture', null, 100, 0, 0, 'envoyee'),
    ('finalisee', 'facture', null, 100, 0, 10, 'partiellement_payee'),
    ('envoyee',   'facture', date '2026-12-01', 0, 0, 0, 'payee')
  ) as v(statut, type, echeance, ttc, avoirs, encaisse, attendu)
  loop
    if public.statut_paiement(c.statut, c.type, c.echeance, c.ttc, c.avoirs, c.encaisse, j) is distinct from c.attendu then
      raise exception 'ÉCHEC : statut_paiement(%, %, %, %, %, %) = % au lieu de %', c.statut, c.type, c.echeance, c.ttc, c.avoirs, c.encaisse,
        public.statut_paiement(c.statut, c.type, c.echeance, c.ttc, c.avoirs, c.encaisse, j), c.attendu;
    end if;
  end loop;
end $$;

set local role authenticated;

-- 3. Admin de B : une facture, échue plus bas
select set_config('request.jwt.claims', '{"sub":"a0110000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select public._t011_facture('a0110000-0000-4000-8000-000000000f20', 'a0110000-0000-4000-8000-0000000000e2', 'a0110000-0000-4000-8000-0000000000c2');

-- 4. Commercial (A) : statuts calculés et plafond des encaissements
select set_config('request.jwt.claims', '{"sub":"a0110000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare s record; n int; v_paiement uuid;
begin
  perform public._t011_facture('a0110000-0000-4000-8000-000000000f01', 'a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-0000000000c1');
  if public._t011_statut('a0110000-0000-4000-8000-000000000f01') is distinct from 'finalisee' then
    raise exception 'ÉCHEC : statut initial %', public._t011_statut('a0110000-0000-4000-8000-000000000f01');
  end if;

  -- Aucun statut de paiement ne se pose à la main, en brouillon comme après finalisation
  perform public._t011_refuse($q$update public.factures set statut = 'payee' where id = 'a0110000-0000-4000-8000-000000000f01'$q$, 'calculé à partir des règlements');
  perform public._t011_refuse($q$update public.factures set statut = 'partiellement_payee' where id = 'a0110000-0000-4000-8000-000000000f01'$q$, 'calculé à partir des règlements');
  perform public._t011_refuse($q$update public.factures set statut = 'en_retard' where id = 'a0110000-0000-4000-8000-000000000f01'$q$, 'calculé à partir des règlements');
  -- « Envoyée » reste manuel, sans retour
  update public.factures set statut = 'envoyee' where id = 'a0110000-0000-4000-8000-000000000f01';
  perform public._t011_refuse($q$update public.factures set statut = 'finalisee' where id = 'a0110000-0000-4000-8000-000000000f01'$q$, 'pas autorisé');
  if public._t011_statut('a0110000-0000-4000-8000-000000000f01') is distinct from 'envoyee' then
    raise exception 'ÉCHEC : statut envoyée non restitué';
  end if;

  -- Encaissements : partiel, plafond au centime, payée
  insert into public.paiements (entreprise_id, facture_id, montant) values
    ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f01', 20);
  if public._t011_statut('a0110000-0000-4000-8000-000000000f01') is distinct from 'partiellement_payee' then
    raise exception 'ÉCHEC : partiellement payée attendue';
  end if;
  perform public._t011_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant) values ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f01', 100.01)$q$,
    'le reste à payer de cette facture est de 100');
  insert into public.paiements (id, entreprise_id, facture_id, montant) values
    ('a0110000-0000-4000-8000-0000000000a1', 'a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f01', 100);
  select * into s from public.factures_soldes where facture_id = 'a0110000-0000-4000-8000-000000000f01';
  if (s.statut_calcule, s.reste_a_payer, s.encaisse_net, s.jours_retard) is distinct from ('payee'::text, 0::numeric, 120::numeric, 0) then
    raise exception 'ÉCHEC : facture payée incorrecte (%)', to_jsonb(s);
  end if;
  -- Plus rien à encaisser ; un encaissement ne monte pas au-delà par modification
  perform public._t011_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant) values ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f01', 0.01)$q$,
    'le reste à payer de cette facture est de 0');
  perform public._t011_refuse(
    $q$update public.paiements set montant = 100.01 where id = 'a0110000-0000-4000-8000-0000000000a1'$q$,
    'le reste à payer de cette facture est de 100');
  update public.paiements set montant = 50 where id = 'a0110000-0000-4000-8000-0000000000a1';
  if public._t011_statut('a0110000-0000-4000-8000-000000000f01') is distinct from 'partiellement_payee' then
    raise exception 'ÉCHEC : le statut n''a pas suivi la baisse de l''encaissement';
  end if;
  update public.paiements set montant = 100 where id = 'a0110000-0000-4000-8000-0000000000a1';
end $$;

-- 5. Comptable (A) : avoir, trop-perçu, remboursement, plafond net des avoirs
select set_config('request.jwt.claims', '{"sub":"a0110000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare v_avoir uuid; s record; v_remb uuid;
begin
  -- Facture réglée puis avoir partiel de 60 € TTC : trop-perçu de 60 €, statut payée
  perform public.finaliser_facture(public.creer_avoir('a0110000-0000-4000-8000-000000000f01', 'Geste', false,
    '[{"description":"X","quantite":1,"prix_unitaire":50,"taux_tva":20,"remise":0,"position":0}]'));
  select * into s from public.factures_soldes where facture_id = 'a0110000-0000-4000-8000-000000000f01';
  if (s.statut_calcule, s.reste_a_payer, s.trop_percu) is distinct from ('payee'::text, 0::numeric, 60::numeric) then
    raise exception 'ÉCHEC : trop-perçu après avoir (%)', to_jsonb(s);
  end if;
  -- Le trop-perçu n'ouvre aucun encaissement ; il se rembourse, plafonné
  perform public._t011_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant) values ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f01', 1)$q$,
    'le reste à payer de cette facture est de 0');
  perform public._t011_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant, sens) values ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f01', 60.01, 'remboursement')$q$,
    'Remboursement refusé');
  insert into public.paiements (id, entreprise_id, facture_id, montant, sens) values
    ('a0110000-0000-4000-8000-0000000000a2', 'a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f01', 60, 'remboursement');
  select * into s from public.factures_soldes where facture_id = 'a0110000-0000-4000-8000-000000000f01';
  if (s.statut_calcule, s.trop_percu, s.encaisse_net) is distinct from ('payee'::text, 0::numeric, 60::numeric) then
    raise exception 'ÉCHEC : après remboursement (%)', to_jsonb(s);
  end if;

  -- Avoir partiel sur une facture non réglée : plafond réduit d'autant
  perform public._t011_facture('a0110000-0000-4000-8000-000000000f02', 'a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-0000000000c1');
  perform public.finaliser_facture(public.creer_avoir('a0110000-0000-4000-8000-000000000f02', 'Geste', false,
    '[{"description":"X","quantite":1,"prix_unitaire":50,"taux_tva":20,"remise":0,"position":0}]'));
  perform public._t011_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant) values ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f02', 60.01)$q$,
    'le reste à payer de cette facture est de 60');
  insert into public.paiements (entreprise_id, facture_id, montant) values
    ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f02', 60);
  if public._t011_statut('a0110000-0000-4000-8000-000000000f02') is distinct from 'payee' then
    raise exception 'ÉCHEC : payée attendue après avoir et encaissement';
  end if;

  -- Avoir total : annulée, jamais payée, même sans règlement
  perform public._t011_facture('a0110000-0000-4000-8000-000000000f03', 'a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-0000000000c1');
  perform public.finaliser_facture(public.creer_avoir('a0110000-0000-4000-8000-000000000f03', 'Annulation', true));
  if public._t011_statut('a0110000-0000-4000-8000-000000000f03') is distinct from 'annulee' then
    raise exception 'ÉCHEC : annulée attendue';
  end if;

  -- Factures pour les relances
  perform public._t011_facture('a0110000-0000-4000-8000-000000000f04', 'a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-0000000000c1');
  perform public._t011_facture('a0110000-0000-4000-8000-000000000f05', 'a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-0000000000c1');
  perform public._t011_facture('a0110000-0000-4000-8000-000000000f06', 'a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-0000000000c1');
  perform public._t011_facture('a0110000-0000-4000-8000-000000000f08', 'a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-0000000000c1');

  -- Pas de relance avant l'échéance
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 1, 'Objet', 'Texte')$q$, 'pas encore échue');
end $$;

-- 6. Échéances dépassées : le temps passe sans écriture applicative
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.factures set date_echeance = public.date_du_jour_paris() - 12
 where id in ('a0110000-0000-4000-8000-000000000f04', 'a0110000-0000-4000-8000-000000000f05', 'a0110000-0000-4000-8000-000000000f06',
              'a0110000-0000-4000-8000-000000000f20', 'a0110000-0000-4000-8000-000000000f01', 'a0110000-0000-4000-8000-000000000f08');
update public.factures set date_echeance = public.date_du_jour_paris() where id = 'a0110000-0000-4000-8000-000000000f03';
-- Facture relançable en tout point, sauf sa suppression logique
do $$
begin
  if public._t011_statut('a0110000-0000-4000-8000-000000000f08') is distinct from 'en_retard' then
    raise exception 'ÉCHEC : la facture à supprimer devrait être en retard (%)', public._t011_statut('a0110000-0000-4000-8000-000000000f08');
  end if;
end $$;
update public.factures set deleted_at = now() where id = 'a0110000-0000-4000-8000-000000000f08';

set local role authenticated;

-- 7. Commercial (A) : relances, niveaux 1 et 2, trace
select set_config('request.jwt.claims', '{"sub":"a0110000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare s record; r record; v_id uuid; n int;
begin
  select * into s from public.factures_soldes where facture_id = 'a0110000-0000-4000-8000-000000000f04';
  if (s.statut_calcule, s.jours_retard, s.reste_a_payer) is distinct from ('en_retard'::text, 12, 120::numeric) then
    raise exception 'ÉCHEC : retard calculé (%)', to_jsonb(s);
  end if;
  -- En retard prime sur partiellement payée
  insert into public.paiements (entreprise_id, facture_id, montant) values ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f05', 20);
  if public._t011_statut('a0110000-0000-4000-8000-000000000f05') is distinct from 'en_retard' then
    raise exception 'ÉCHEC : en retard devrait primer sur partiellement payée';
  end if;
  -- Une facture échue mais réglée reste payée
  select * into s from public.factures_soldes where facture_id = 'a0110000-0000-4000-8000-000000000f01';
  if (s.statut_calcule, s.jours_retard) is distinct from ('payee'::text, 0) then
    raise exception 'ÉCHEC : facture réglée échue (%)', to_jsonb(s);
  end if;

  -- Refus : niveau sauté, niveau inconnu, texte vide, facture sans reste, annulée, avoir, brouillon, autre entreprise
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 2, 'Objet', 'Texte')$q$, 'le niveau suivant de cette facture est le niveau 1');
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 4, 'Objet', 'Texte')$q$, 'le niveau suivant');
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 0, 'Objet', 'Texte')$q$, 'relances_niveau_check');
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 1, ' ', 'Texte')$q$, 'obligatoires');
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 1, 'Objet', ' ')$q$, 'obligatoires');
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f01', 1, 'Objet', 'Texte')$q$, 'plus de reste à payer');
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f03', 1, 'Objet', 'Texte')$q$, 'non annulée');
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f20', 1, 'Objet', 'Texte')$q$, 'introuvable');
  perform public._t011_refuse(format($q$select public.preparer_relance(%L, 1, 'Objet', 'Texte')$q$,
    (select id from public.factures where facture_origine_id = 'a0110000-0000-4000-8000-000000000f02')), 'Un avoir ne se relance pas');
  insert into public.factures (id, entreprise_id, client_id) values ('a0110000-0000-4000-8000-000000000f07', 'a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-0000000000c1');
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f07', 1, 'Objet', 'Texte')$q$, 'non annulée');

  -- 1re relance : valeurs tracées par la base
  v_id := public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 1, 'Objet 1', 'Texte modifié par l''utilisateur', 'client@a.invalid');
  select * into r from public.relances where id = v_id;
  if (r.niveau, r.objet, r.corps, r.destinataire, r.reste_a_payer, r.auteur, r.auteur_nom)
     is distinct from (1::smallint, 'Objet 1'::text, 'Texte modifié par l''utilisateur'::text, 'client@a.invalid'::text, 120::numeric, 'a0110000-0000-4000-8000-000000000002'::uuid, 'Camille Commerciale'::text) then
    raise exception 'ÉCHEC : relance mal tracée (%)', to_jsonb(r);
  end if;
  -- Une écriture directe subit les mêmes règles, et n'impose ni auteur, ni montant, ni date
  insert into public.relances (id, entreprise_id, facture_id, niveau, objet, corps, reste_a_payer, auteur, auteur_nom, created_at) values
    ('a0110000-0000-4000-8000-0000000000b1', 'a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f04', 1, 'O', 'T', 1, 'a0110000-0000-4000-8000-000000000005', 'Faux', '2000-01-01');
  select * into r from public.relances where id = 'a0110000-0000-4000-8000-0000000000b1';
  if (r.reste_a_payer, r.auteur, r.auteur_nom) is distinct from (120::numeric, 'a0110000-0000-4000-8000-000000000002'::uuid, 'Camille Commerciale'::text)
     or r.created_at < now() - interval '1 minute' then
    raise exception 'ÉCHEC : écriture directe a imposé ses valeurs (%)', to_jsonb(r);
  end if;
  perform public._t011_refuse(
    $q$insert into public.relances (entreprise_id, facture_id, niveau, objet, corps, reste_a_payer) values ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f04', 3, 'O', 'T', 1)$q$,
    'mise en demeure');
  -- Écriture directe sur une facture supprimée logiquement : refusée, rien n'est tracé
  perform public._t011_refuse(
    $q$insert into public.relances (entreprise_id, facture_id, niveau, objet, corps, reste_a_payer) values ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f08', 1, 'O', 'T', 1)$q$,
    'introuvable');
  select count(*) into n from public.relances where facture_id = 'a0110000-0000-4000-8000-000000000f08';
  if n <> 0 then raise exception 'ÉCHEC : relance tracée sur une facture supprimée'; end if;

  -- Aucune modification ni suppression
  perform public._t011_refuse($q$update public.relances set corps = 'Autre' where id = 'a0110000-0000-4000-8000-0000000000b1'$q$, 'permission denied');
  perform public._t011_refuse($q$delete from public.relances where id = 'a0110000-0000-4000-8000-0000000000b1'$q$, 'permission denied');

  -- 2e relance permise ; le commercial ne prépare pas la mise en demeure ; un même niveau peut être répété
  perform public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 2, 'Objet 2', 'Texte 2');
  perform public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 1, 'Objet 1 bis', 'Texte 1 bis');
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 3, 'Mise en demeure', 'Texte')$q$, 'mise en demeure');
  select count(*) into n from public.relances where facture_id = 'a0110000-0000-4000-8000-000000000f04';
  if n <> 4 then raise exception 'ÉCHEC : % relance(s) au lieu de 4', n; end if;
  -- Paiement partiel : le montant tracé suit le reste
  insert into public.paiements (entreprise_id, facture_id, montant) values ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f05', 30);
  v_id := public.preparer_relance('a0110000-0000-4000-8000-000000000f05', 1, 'O', 'T');
  select count(*) into n from public.relances where id = v_id and reste_a_payer = 70;
  if n <> 1 then raise exception 'ÉCHEC : reste à payer tracé incorrect'; end if;
end $$;

-- 8. Comptable (A) : mise en demeure autorisée, auteur tracé
select set_config('request.jwt.claims', '{"sub":"a0110000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare v_id uuid; r record;
begin
  v_id := public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 3, 'Mise en demeure', 'Texte');
  select * into r from public.relances where id = v_id;
  if r.auteur_nom <> 'Chris Comptable' or r.niveau <> 3 then raise exception 'ÉCHEC : mise en demeure (%)', to_jsonb(r); end if;
  -- Mise en demeure : plus de niveau au-delà
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 4, 'O', 'T')$q$, 'relances_niveau_check');
end $$;

-- 9. Manager et admin (A) : mêmes interdits sur la trace ; niveau 3 autorisé
select set_config('request.jwt.claims', '{"sub":"a0110000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
begin
  perform public.preparer_relance('a0110000-0000-4000-8000-000000000f06', 1, 'O', 'T');
  perform public.preparer_relance('a0110000-0000-4000-8000-000000000f06', 2, 'O', 'T');
  perform public.preparer_relance('a0110000-0000-4000-8000-000000000f06', 3, 'O', 'T');
  perform public._t011_refuse($q$delete from public.relances where facture_id = 'a0110000-0000-4000-8000-000000000f06'$q$, 'permission denied');
end $$;
select set_config('request.jwt.claims', '{"sub":"a0110000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
begin
  perform public._t011_refuse($q$update public.relances set niveau = 1 where facture_id = 'a0110000-0000-4000-8000-000000000f06'$q$, 'permission denied');
end $$;

-- 10. Lecture (A) : lit, n'écrit rien
select set_config('request.jwt.claims', '{"sub":"a0110000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.relances where facture_id = 'a0110000-0000-4000-8000-000000000f04';
  if n <> 5 then raise exception 'ÉCHEC : le rôle lecture voit % relance(s) au lieu de 5', n; end if;
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f06', 1, 'O', 'T')$q$, 'Votre rôle ne permet pas');
  perform public._t011_refuse(
    $q$insert into public.relances (entreprise_id, facture_id, niveau, objet, corps, reste_a_payer) values ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f06', 1, 'O', 'T', 1)$q$,
    'row-level security');
  perform public._t011_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant) values ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f06', 1)$q$,
    'row-level security');
end $$;

-- 11. Admin de B : isolation
select set_config('request.jwt.claims', '{"sub":"a0110000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.relances;
  if n <> 0 then raise exception 'ÉCHEC : B voit % relance(s) de A', n; end if;
  perform public._t011_refuse($q$select public.preparer_relance('a0110000-0000-4000-8000-000000000f04', 1, 'O', 'T')$q$, 'introuvable');
  perform public._t011_refuse(
    $q$insert into public.relances (entreprise_id, facture_id, niveau, objet, corps, reste_a_payer) values ('a0110000-0000-4000-8000-0000000000e2', 'a0110000-0000-4000-8000-000000000f04', 1, 'O', 'T', 1)$q$,
    'même entreprise');
  perform public._t011_refuse(
    $q$insert into public.relances (entreprise_id, facture_id, niveau, objet, corps, reste_a_payer) values ('a0110000-0000-4000-8000-0000000000e1', 'a0110000-0000-4000-8000-000000000f20', 1, 'O', 'T', 1)$q$,
    'même entreprise');
  perform public.preparer_relance('a0110000-0000-4000-8000-000000000f20', 1, 'Objet de B', 'Texte de B');
  select count(*) into n from public.relances;
  if n <> 1 then raise exception 'ÉCHEC : B voit % relance(s) au lieu de la sienne', n; end if;
end $$;

-- 12. Retour en postgres : contrainte, audit, cascade
reset role;
select set_config('request.jwt.claims', '{}', true);
do $$
declare n int;
begin
  perform public._t011_refuse($q$update public.factures set statut = 'payee' where id = 'a0110000-0000-4000-8000-000000000f06'$q$, 'factures_statut_check');
  perform public._t011_refuse($q$update public.factures set statut = 'en_retard' where id = 'a0110000-0000-4000-8000-000000000f06'$q$, 'factures_statut_check');

  -- Trace dans audit_events, avec son auteur
  select count(*) into n from public.audit_events where table_name = 'relances' and action = 'insert'
     and user_id = 'a0110000-0000-4000-8000-000000000002' and (new_data->>'niveau')::int = 1
     and (new_data->>'facture_id')::uuid = 'a0110000-0000-4000-8000-000000000f04';
  if n < 1 then raise exception 'ÉCHEC : relance absente de audit_events'; end if;

  -- Le nettoyage du seed passe par postgres : la suppression d'une facture emporte ses relances
  delete from public.factures where id = 'a0110000-0000-4000-8000-000000000f06';
  select count(*) into n from public.relances where facture_id = 'a0110000-0000-4000-8000-000000000f06';
  if n <> 0 then raise exception 'ÉCHEC : relances orphelines après suppression en postgres'; end if;
end $$;

do $$ begin raise notice 'Tests 011 : tous passés.'; end $$;

rollback;
