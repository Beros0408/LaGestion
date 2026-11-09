-- 010_acomptes.sql — Lagestion
-- Vérifie la migration 010 (factures d'acompte et de solde) :
--   - devis de 1 000 € HT à 20 % + 500 € HT à 10 %, TTC 1 750 € : acompte de 30 % = 525,00 €, solde = 1 225,00 € ;
--   - calcul en pourcentage et en montant TTC, écart d'un centime possible, remise globale du devis ;
--   - plafonds TTC et par taux ; devis bloqué dans « accepté » ; conversion en solde ou en facture normale ;
--   - déductions fixes, solde non supprimable, acompte déduit sans avoir, avoir total sur un solde ;
--   - série FAC continue, isolation entre entreprises et droits par rôle.
-- La concurrence réelle se vérifie à part : supabase/tests/010_concurrence.mjs.
-- À lancer après migrations/010_acomptes.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0100…)
--   entreprise A …00e1 : lecture …0001 · commercial …0002 · comptable …0003 · manager …0004 · admin …0005
--   entreprise B …00e2 : admin …0006 ; client de B …00c2 ; devis de B …0d20
--   clients de A : …00c1 (actif), …00c3 (supprimé ensuite)

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role)
select ('a0100000-0000-4000-8000-00000000000' || i)::uuid, 'test-010-' || i || '@lagestion.invalid', 'authenticated', 'authenticated'
from generate_series(1, 6) i;

insert into public.entreprises (id, nom, siret, adresse) values
  ('a0100000-0000-4000-8000-0000000000e1', 'Entreprise A (test 010)', '11111111100011', '1 rue de A, 75001 Paris'),
  ('a0100000-0000-4000-8000-0000000000e2', 'Entreprise B (test 010)', '22222222200022', '2 rue de B, 69001 Lyon');
-- Mentions minimales exigées à la finalisation depuis la migration 014 (testées dans 014_mentions.sql)
update public.entreprises set forme_juridique = 'EI', immatriculation_type = 'dispense', tva_intra = 'FR00000000000'
 where id::text like 'a0100000-0000-4000-8000-0000000000e%';

insert into public.memberships (entreprise_id, user_id, role) values
  ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-000000000001', 'lecture'),
  ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-000000000002', 'commercial'),
  ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-000000000003', 'comptable'),
  ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-000000000004', 'manager'),
  ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-000000000005', 'admin'),
  ('a0100000-0000-4000-8000-0000000000e2', 'a0100000-0000-4000-8000-000000000006', 'admin');

insert into public.clients (id, entreprise_id, nom, adresse) values
  ('a0100000-0000-4000-8000-0000000000c1', 'a0100000-0000-4000-8000-0000000000e1', 'Client A', '10 rue du Client, 75002 Paris'),
  ('a0100000-0000-4000-8000-0000000000c2', 'a0100000-0000-4000-8000-0000000000e2', 'Client B', null),
  ('a0100000-0000-4000-8000-0000000000c3', 'a0100000-0000-4000-8000-0000000000e1', 'Client A supprimé ensuite', null);

-- Helpers de test, retirés par le rollback final
create function public._t010_refuse(p_sql text, p_extrait text) returns void
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
grant execute on function public._t010_refuse(text, text) to authenticated;

-- Devis accepté : 1 000 € HT à 20 % + 500 € HT à 10 %, TTC 1 750 € (statut posé via les transitions de l'utilisateur)
create function public._t010_devis(p_id uuid, p_entreprise uuid, p_client uuid, p_remise numeric default 0) returns void
language plpgsql as $$
begin
  insert into public.devis (id, entreprise_id, client_id, remise) values (p_id, p_entreprise, p_client, p_remise);
  insert into public.lignes_devis (entreprise_id, devis_id, description, quantite, prix_unitaire, taux_tva, position) values
    (p_entreprise, p_id, 'Travaux à 20 %', 1, 1000, 20, 0),
    (p_entreprise, p_id, 'Travaux à 10 %', 1, 500, 10, 1);
  update public.devis set statut = 'envoye' where id = p_id;
  update public.devis set statut = 'accepte' where id = p_id;
end $$;
grant execute on function public._t010_devis(uuid, uuid, uuid, numeric) to authenticated;

create function public._t010_numero(p_rang int) returns text
language sql stable as $$
  select 'FAC-' || to_char(public.date_du_jour_paris(), 'YYYY') || '-' || lpad(p_rang::text, 4, '0')
$$;
grant execute on function public._t010_numero(int) to authenticated;

set local role authenticated;

-- 2. Admin de B : un devis accepté que A ne doit jamais atteindre
select set_config('request.jwt.claims', '{"sub":"a0100000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select public._t010_devis('a0100000-0000-4000-8000-000000000d20', 'a0100000-0000-4000-8000-0000000000e2', 'a0100000-0000-4000-8000-0000000000c2');

-- 3. Commercial (A) : acompte de 30 %, 525,00 € au centime ; il peut finaliser
select set_config('request.jwt.claims', '{"sub":"a0100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare v_acompte uuid; f record; a jsonb; n int; v_numero text; s record;
begin
  perform public._t010_devis('a0100000-0000-4000-8000-000000000d01', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1');

  -- Aperçu : aucune écriture, montants réels
  a := public.apercu_acompte('a0100000-0000-4000-8000-000000000d01', 'pourcentage', 30);
  if (a->>'total_ttc')::numeric <> 525 or (a->>'total_ht')::numeric <> 450 or (a->>'total_tva')::numeric <> 75
     or (a->>'devis_ttc')::numeric <> 1750 or (a->>'deja_ttc')::numeric <> 0
     or a->'tva_detail' is distinct from '[{"taux": 20, "base": 300, "tva": 60}, {"taux": 10, "base": 150, "tva": 15}]'::jsonb then
    raise exception 'ÉCHEC : aperçu de l''acompte incorrect (%)', a;
  end if;
  select count(*) into n from public.factures where devis_id = 'a0100000-0000-4000-8000-000000000d01';
  if n <> 0 then raise exception 'ÉCHEC : l''aperçu a écrit %', n; end if;

  -- Valeurs refusées
  perform public._t010_refuse($q$select public.apercu_acompte('a0100000-0000-4000-8000-000000000d01', 'pourcentage', 100)$q$, 'bornes exclues');
  perform public._t010_refuse($q$select public.apercu_acompte('a0100000-0000-4000-8000-000000000d01', 'pourcentage', 0)$q$, 'bornes exclues');
  perform public._t010_refuse($q$select public.apercu_acompte('a0100000-0000-4000-8000-000000000d01', 'montant', 1750)$q$, 'inférieur au TTC');
  perform public._t010_refuse($q$select public.apercu_acompte('a0100000-0000-4000-8000-000000000d01', 'autre', 10)$q$, 'Mode d''acompte');

  v_acompte := public.creer_acompte('a0100000-0000-4000-8000-000000000d01', 'pourcentage', 30);
  select * into f from public.factures where id = v_acompte;
  if f.type <> 'acompte' or f.statut <> 'brouillon' or f.numero is not null or f.client_id <> 'a0100000-0000-4000-8000-0000000000c1'
     or f.date_echeance <> public.date_du_jour_paris() + 30 or f.acompte_mode <> 'pourcentage' or f.acompte_valeur <> 30 then
    raise exception 'ÉCHEC : brouillon d''acompte incorrect (%)', to_jsonb(f);
  end if;
  select count(*) into n from public.lignes_facture
   where facture_id = v_acompte and description like 'Acompte de 30 % sur le devis DEV-%' and quantite = 1;
  if n <> 2 then raise exception 'ÉCHEC : % ligne(s) d''acompte au lieu de 2', n; end if;
  select count(*) into n from public.factures_totaux where facture_id = v_acompte and total_ttc = 525;
  if n <> 1 then raise exception 'ÉCHEC : vue incorrecte sur le brouillon d''acompte'; end if;

  -- Brouillon d'acompte : échéance et message modifiables ; lignes, client, remise, type et devis non
  perform public.enregistrer_facture(v_acompte, '{"message_client": "Merci"}');
  perform public._t010_refuse(format($q$select public.enregistrer_facture(%L, '{}', '[]')$q$, v_acompte), 'sont calculées');
  perform public._t010_refuse(format($q$update public.factures set client_id = 'a0100000-0000-4000-8000-0000000000c3' where id = %L$q$, v_acompte), 'ne peuvent pas être modifiés');
  perform public._t010_refuse(format($q$update public.factures set remise = 5 where id = %L$q$, v_acompte), 'ne peuvent pas être modifiés');
  perform public._t010_refuse(format($q$update public.factures set acompte_valeur = 10 where id = %L$q$, v_acompte), 'ne peuvent pas être modifiés');
  perform public._t010_refuse(format($q$update public.factures set devis_id = null where id = %L$q$, v_acompte), 'ne peuvent pas être modifiés');

  -- Lignes changées par écriture directe : refus à la finalisation
  update public.lignes_facture set prix_unitaire = 1 where facture_id = v_acompte and taux_tva = 20;
  perform public._t010_refuse(format($q$select public.finaliser_facture(%L)$q$, v_acompte), 'ne correspondent plus');
  update public.lignes_facture set prix_unitaire = 300 where facture_id = v_acompte and taux_tva = 20;
  insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire, taux_tva) values
    ('a0100000-0000-4000-8000-0000000000e1', v_acompte, 'Ajout', 1, 20);
  perform public._t010_refuse(format($q$select public.finaliser_facture(%L)$q$, v_acompte), 'ne correspondent plus');
  delete from public.lignes_facture where facture_id = v_acompte and description = 'Ajout';

  -- Conversion refusée tant qu'un acompte est en brouillon, et devis déjà bloqué
  perform public._t010_refuse($q$select public.convertir_devis('a0100000-0000-4000-8000-000000000d01')$q$, 'encore en brouillon');

  -- Finalisation : même mécanique et même série que les factures
  v_numero := public.finaliser_facture(v_acompte);
  if v_numero <> public._t010_numero(1) then raise exception 'ÉCHEC : acompte numéroté %', v_numero; end if;
  select * into f from public.factures where id = v_acompte;
  if (f.total_ht, f.total_tva, f.total_ttc) is distinct from (450::numeric, 75::numeric, 525::numeric)
     or f.tva_detail is distinct from '[{"taux": 20, "base": 300, "tva": 60}, {"taux": 10, "base": 150, "tva": 15}]'::jsonb
     or f.client_fige->>'nom' is distinct from 'Client A' or f.emetteur_fige->>'siret' is distinct from '11111111100011'
     or f.date_emission <> public.date_du_jour_paris() then
    raise exception 'ÉCHEC : acompte mal figé (%)', to_jsonb(f);
  end if;
  -- Verrouillage
  perform public._t010_refuse(format($q$update public.factures set acompte_valeur = 10 where id = %L$q$, v_acompte), 'ne peut plus être modifiée');
  perform public._t010_refuse(format($q$update public.lignes_facture set prix_unitaire = 1 where facture_id = %L$q$, v_acompte), 'ne peuvent plus être modifiées');
  perform public._t010_refuse(format($q$update public.factures set devis_id = 'a0100000-0000-4000-8000-000000000d20' where id = %L$q$, v_acompte), 'même entreprise');
  -- Reste à payer et paiement
  insert into public.paiements (entreprise_id, facture_id, montant) values ('a0100000-0000-4000-8000-0000000000e1', v_acompte, 525);
  select * into s from public.factures_soldes where facture_id = v_acompte;
  if (s.total_ttc, s.reste_a_payer, s.encaisse_net) is distinct from (525::numeric, 0::numeric, 525::numeric) then raise exception 'ÉCHEC : solde de l''acompte (%)', to_jsonb(s); end if;

  -- Second acompte : aperçu avec le déjà facturé
  a := public.apercu_acompte('a0100000-0000-4000-8000-000000000d01', 'pourcentage', 10);
  if (a->>'deja_ttc')::numeric <> 525 or (a->>'total_ttc')::numeric <> 175 then raise exception 'ÉCHEC : aperçu du second acompte (%)', a; end if;

  -- Plafond TTC : 70 % restants exactement sont refusés (le cumul doit rester inférieur au TTC)
  perform public._t010_refuse($q$select public.creer_acompte('a0100000-0000-4000-8000-000000000d01', 'pourcentage', 70)$q$, 'cumul des acomptes');
  perform public._t010_refuse($q$select public.creer_acompte('a0100000-0000-4000-8000-000000000d01', 'montant', 1225)$q$, 'cumul des acomptes');

  -- Devis avec acompte : ne quitte plus « accepté », n'est plus supprimé
  perform public._t010_refuse($q$update public.devis set statut = 'envoye' where id = 'a0100000-0000-4000-8000-000000000d01'$q$, 'plus quitter le statut accepté');
  perform public._t010_refuse($q$update public.devis set statut = 'refuse' where id = 'a0100000-0000-4000-8000-000000000d01'$q$, 'plus quitter le statut accepté');
  -- Un acompte ne suffit pas pour le statut converti
  perform public._t010_refuse($q$update public.devis set statut = 'converti' where id = 'a0100000-0000-4000-8000-000000000d01'$q$, 'attribué uniquement par la transformation');
  -- Une facture normale ne contourne pas la déduction
  perform public._t010_refuse(
    $q$insert into public.factures (entreprise_id, client_id, devis_id) values ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1', 'a0100000-0000-4000-8000-000000000d01')$q$,
    'seule une facture de solde');
  -- Pas d'acompte sur un devis non accepté, ni sur un autre type de statut
  insert into public.devis (id, entreprise_id, client_id) values ('a0100000-0000-4000-8000-000000000d02', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1');
  perform public._t010_refuse($q$select public.creer_acompte('a0100000-0000-4000-8000-000000000d02', 'pourcentage', 10)$q$, 'devis accepté');
  perform public._t010_refuse($q$select public.apercu_acompte('a0100000-0000-4000-8000-000000000d02', 'pourcentage', 10)$q$, 'devis accepté');
  perform public._t010_refuse(
    $q$insert into public.factures (entreprise_id, client_id, type, devis_id, acompte_mode, acompte_valeur) values ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1', 'acompte', 'a0100000-0000-4000-8000-000000000d02', 'pourcentage', 10)$q$,
    'devis accepté');
  -- Autre entreprise
  perform public._t010_refuse($q$select public.creer_acompte('a0100000-0000-4000-8000-000000000d20', 'pourcentage', 10)$q$, 'introuvable');
  perform public._t010_refuse($q$select public.apercu_acompte('a0100000-0000-4000-8000-000000000d20', 'pourcentage', 10)$q$, 'introuvable');
  -- Un solde direct ne passe pas pour un devis sans acompte
  perform public._t010_refuse(
    $q$insert into public.factures (entreprise_id, client_id, type, devis_id, acomptes_deduits) values ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1', 'solde', 'a0100000-0000-4000-8000-000000000d02', '[]')$q$,
    'aucun acompte à déduire');
end $$;

-- 4. Comptable (A) : conversion en solde, 1 225,00 € au centime
select set_config('request.jwt.claims', '{"sub":"a0100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare v_solde uuid; f record; n int; v_numero text; v_acompte uuid; s record; v_avoir uuid;
begin
  select id into v_acompte from public.factures where devis_id = 'a0100000-0000-4000-8000-000000000d01' and type = 'acompte';

  v_solde := public.convertir_devis('a0100000-0000-4000-8000-000000000d01');
  select * into f from public.factures where id = v_solde;
  if f.type <> 'solde' or f.statut <> 'brouillon' or f.numero is not null or f.date_echeance <> public.date_du_jour_paris() + 30 then
    raise exception 'ÉCHEC : brouillon de solde incorrect (%)', to_jsonb(f);
  end if;
  if jsonb_array_length(f.acomptes_deduits) <> 1 or (f.acomptes_deduits->0->>'total_ttc')::numeric <> 525
     or (f.acomptes_deduits->0->>'numero') <> public._t010_numero(1) then
    raise exception 'ÉCHEC : déductions incorrectes (%)', f.acomptes_deduits;
  end if;
  select count(*) into n from public.devis where id = 'a0100000-0000-4000-8000-000000000d01' and statut = 'converti';
  if n <> 1 then raise exception 'ÉCHEC : devis non converti'; end if;
  -- Lignes complètes du devis ; vue nette des acomptes dès le brouillon
  select count(*) into n from public.lignes_facture where facture_id = v_solde;
  if n <> 2 then raise exception 'ÉCHEC : % ligne(s) de solde au lieu de 2', n; end if;
  select count(*) into n from public.factures_totaux where facture_id = v_solde and total_ht = 1050 and total_tva = 175 and total_ttc = 1225 and total_ht_brut = 1500;
  if n <> 1 then raise exception 'ÉCHEC : vue incorrecte sur le brouillon de solde'; end if;

  -- Déductions intouchables ; plus d'acompte ; plus de conversion
  perform public._t010_refuse(format($q$update public.factures set acomptes_deduits = '[]' where id = %L$q$, v_solde), 'ne peuvent pas être modifiés');
  perform public._t010_refuse($q$select public.creer_acompte('a0100000-0000-4000-8000-000000000d01', 'pourcentage', 1)$q$, 'devis accepté');
  perform public._t010_refuse($q$select public.convertir_devis('a0100000-0000-4000-8000-000000000d01')$q$, 'déjà été converti');
  perform public._t010_refuse(
    $q$insert into public.factures (entreprise_id, client_id, type, devis_id, acomptes_deduits) values ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1', 'solde', 'a0100000-0000-4000-8000-000000000d01', '[]')$q$,
    'uniq_factures_devis');

  -- Acompte déduit : plus d'avoir, dès le brouillon de solde
  perform public._t010_refuse(format($q$select public.creer_avoir(%L, 'Motif', true)$q$, v_acompte), 'correction passe par le solde');

  -- Brouillon de solde modifiable, mais une base négative refuse la finalisation
  perform public.enregistrer_facture(v_solde, '{"message_client": "Solde"}',
    '[{"description":"Réduit","quantite":1,"prix_unitaire":100,"taux_tva":20,"remise":0,"position":0},{"description":"B","quantite":1,"prix_unitaire":500,"taux_tva":10,"remise":0,"position":1}]');
  perform public._t010_refuse(format($q$select public.finaliser_facture(%L)$q$, v_solde), 'les acomptes déduits dépassent');
  perform public.enregistrer_facture(v_solde, '{}',
    '[{"description":"Travaux à 20 %","quantite":1,"prix_unitaire":1000,"taux_tva":20,"remise":0,"position":0},{"description":"Travaux à 10 %","quantite":1,"prix_unitaire":500,"taux_tva":10,"remise":0,"position":1}]');
  perform public._t010_refuse(format($q$update public.factures set client_id = 'a0100000-0000-4000-8000-0000000000c3' where id = %L$q$, v_solde), 'ne peut pas être modifié');

  v_numero := public.finaliser_facture(v_solde);
  if v_numero <> public._t010_numero(2) then raise exception 'ÉCHEC : solde numéroté %', v_numero; end if;
  select * into f from public.factures where id = v_solde;
  if (f.total_ht_brut, f.remise_appliquee, f.total_ht, f.total_tva, f.total_ttc)
     is distinct from (1500::numeric, 0::numeric, 1050::numeric, 175::numeric, 1225::numeric) then
    raise exception 'ÉCHEC : totaux du solde incorrects (%)', to_jsonb(f);
  end if;
  if f.tva_detail is distinct from '[{"taux": 20, "base": 700, "tva": 140}, {"taux": 10, "base": 350, "tva": 35}]'::jsonb then
    raise exception 'ÉCHEC : TVA par taux du solde incorrecte (%)', f.tva_detail;
  end if;
  -- Contrôle : acomptes + solde = devis, au centime
  select count(*) into n from public.devis_totaux
   where devis_id = 'a0100000-0000-4000-8000-000000000d01' and total_ttc = 525 + f.total_ttc and total_ht = 450 + f.total_ht and total_tva = 75 + f.total_tva;
  if n <> 1 then raise exception 'ÉCHEC : acomptes + solde différents du devis'; end if;
  select * into s from public.factures_soldes where facture_id = v_solde;
  if s.reste_a_payer is distinct from 1225::numeric then raise exception 'ÉCHEC : reste à payer du solde (%)', to_jsonb(s); end if;
  perform public._t010_refuse(format($q$update public.factures set acomptes_deduits = '[]' where id = %L$q$, v_solde), 'ne peut plus être modifiée');

  -- Avoir partiel sur le solde : plafonné aux bases nettes
  v_avoir := public.creer_avoir(v_solde, 'Trop', false, '[{"description":"X","quantite":1,"prix_unitaire":700.01,"taux_tva":20,"remise":0,"position":0}]');
  perform public._t010_refuse(format($q$select public.finaliser_facture(%L)$q$, v_avoir), 'il reste 700');
  delete from public.lignes_facture where facture_id = v_avoir;
  insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire, taux_tva) values
    ('a0100000-0000-4000-8000-0000000000e1', v_avoir, 'Geste', 100, 20);
  perform public.finaliser_facture(v_avoir);
  select * into s from public.factures_soldes where facture_id = v_solde;
  if (s.reste_a_payer, s.avoirs_ttc) is distinct from (1105::numeric, 120::numeric) then raise exception 'ÉCHEC : avoir partiel sur le solde (%)', to_jsonb(s); end if;
end $$;

-- 5. Manager (A) : solde non supprimable, acompte annulé, conversion normale, avoir total sur un solde
select set_config('request.jwt.claims', '{"sub":"a0100000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare v_a uuid; v_b uuid; v_solde uuid; f record; n int; v_avoir uuid; a jsonb;
begin
  perform public._t010_devis('a0100000-0000-4000-8000-000000000d03', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1');
  v_a := public.creer_acompte('a0100000-0000-4000-8000-000000000d03', 'pourcentage', 30);
  -- Suppression du brouillon d'acompte : permise, ne consomme aucun numéro
  update public.factures set deleted_at = now() where id = v_a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : brouillon d''acompte non supprimable'; end if;
  -- Devis libéré : plus d'acompte actif
  a := public.apercu_acompte('a0100000-0000-4000-8000-000000000d03', 'pourcentage', 30);
  if (a->>'deja_ttc')::numeric <> 0 then raise exception 'ÉCHEC : brouillon supprimé compté (%)', a; end if;

  v_a := public.creer_acompte('a0100000-0000-4000-8000-000000000d03', 'pourcentage', 30);
  perform public.finaliser_facture(v_a);
  perform public._t010_refuse($q$update public.devis set deleted_at = now() where id = 'a0100000-0000-4000-8000-000000000d03'$q$, 'des acomptes');

  -- Second acompte en montant TTC : 500 € répartis au prorata, écart d'un centime possible mais ici exact
  v_b := public.creer_acompte('a0100000-0000-4000-8000-000000000d03', 'montant', 500);
  select count(*) into n from public.factures_totaux where facture_id = v_b and total_ttc = 500;
  if n <> 1 then raise exception 'ÉCHEC : acompte de 500 € incorrect'; end if;
  perform public.finaliser_facture(v_b);

  -- Avoir partiel sur un acompte pas encore déduit : la déduction est nette de l'avoir
  v_avoir := public.creer_avoir(v_a, 'Correction', false, '[{"description":"X","quantite":1,"prix_unitaire":100,"taux_tva":20,"remise":0,"position":0}]');
  perform public.finaliser_facture(v_avoir);

  v_solde := public.convertir_devis('a0100000-0000-4000-8000-000000000d03');
  select * into f from public.factures where id = v_solde;
  if jsonb_array_length(f.acomptes_deduits) <> 2 or (f.acomptes_deduits->0->>'total_ttc')::numeric <> 405 then
    raise exception 'ÉCHEC : déduction nette de l''avoir incorrecte (%)', f.acomptes_deduits;
  end if;
  -- 1 750 − (525 − 120) − 500 = 845
  select count(*) into n from public.factures_totaux where facture_id = v_solde and total_ttc = 845;
  if n <> 1 then raise exception 'ÉCHEC : solde net après avoir incorrect'; end if;

  -- Brouillon de solde non supprimable (logique), y compris par le manager
  perform public._t010_refuse(format($q$update public.factures set deleted_at = now() where id = %L$q$, v_solde), 'ne peut pas être supprimé');

  perform public.finaliser_facture(v_solde);
  select * into f from public.factures where id = v_solde;
  if f.total_ttc <> 845 then raise exception 'ÉCHEC : solde figé incorrect (%)', to_jsonb(f); end if;

  -- Avoir total sur le solde : une ligne par taux au montant net, TTC exact, facture annulée
  v_avoir := public.creer_avoir(v_solde, 'Annulation', true);
  select count(*) into n from public.lignes_facture where facture_id = v_avoir and description like 'Annulation de la facture de solde%';
  if n <> jsonb_array_length(f.tva_detail) then raise exception 'ÉCHEC : lignes de l''avoir total sur solde (%)', n; end if;
  -- Brouillon calculé depuis ses lignes : à un centime près de la valeur figée, qui seule fait foi
  select count(*) into n from public.factures_totaux where facture_id = v_avoir and abs(total_ttc + 845) <= 0.01;
  if n <> 1 then raise exception 'ÉCHEC : brouillon d''avoir total sur solde (vue)'; end if;
  -- Lignes modifiées par écriture directe : refus à la finalisation
  update public.lignes_facture set prix_unitaire = prix_unitaire + 1 where facture_id = v_avoir and position = 0;
  perform public._t010_refuse(format($q$select public.finaliser_facture(%L)$q$, v_avoir), 'doivent rester celles');
  update public.lignes_facture set prix_unitaire = prix_unitaire - 1 where facture_id = v_avoir and position = 0;
  perform public.finaliser_facture(v_avoir);
  perform public._t010_refuse(format($q$select public.creer_avoir(%L, 'Motif', true)$q$, v_avoir), 'ne peut porter que sur une facture');
  select * into f from public.factures where id = v_avoir;
  if f.total_ttc <> -845 or f.remise_appliquee <> 0 then raise exception 'ÉCHEC : avoir total sur solde (%)', to_jsonb(f); end if;
  select count(*) into n from public.factures where id = v_solde and statut = 'annulee';
  if n <> 1 then raise exception 'ÉCHEC : solde non annulé par son avoir total'; end if;

  -- Acompte entièrement annulé : le devis retrouve sa liberté, la conversion crée une facture normale
  perform public._t010_devis('a0100000-0000-4000-8000-000000000d04', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1');
  v_a := public.creer_acompte('a0100000-0000-4000-8000-000000000d04', 'pourcentage', 30);
  perform public.finaliser_facture(v_a);
  perform public.finaliser_facture(public.creer_avoir(v_a, 'Annulation de l''acompte', true));
  select count(*) into n from public.factures where id = v_a and statut = 'annulee';
  if n <> 1 then raise exception 'ÉCHEC : acompte non annulé'; end if;
  v_solde := public.convertir_devis('a0100000-0000-4000-8000-000000000d04');
  select * into f from public.factures where id = v_solde;
  if f.type <> 'facture' or f.acomptes_deduits is not null then raise exception 'ÉCHEC : conversion après annulation (%)', to_jsonb(f); end if;

  -- Devis sans acompte : facture normale, comme avant
  perform public._t010_devis('a0100000-0000-4000-8000-000000000d05', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1');
  v_solde := public.convertir_devis('a0100000-0000-4000-8000-000000000d05');
  select count(*) into n from public.factures where id = v_solde and type = 'facture' and devis_id = 'a0100000-0000-4000-8000-000000000d05' and numero is null;
  if n <> 1 then raise exception 'ÉCHEC : conversion sans acompte'; end if;
  -- Un brouillon de facture normale issu d'un devis reste supprimable (décision de l'étape 07)
  update public.factures set deleted_at = now() where id = v_solde;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : brouillon de facture normale non supprimable'; end if;

  -- Devis annulé : sortie permise après annulation de tous les acomptes
  perform public._t010_devis('a0100000-0000-4000-8000-000000000d06', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1');
  v_a := public.creer_acompte('a0100000-0000-4000-8000-000000000d06', 'pourcentage', 10);
  perform public.finaliser_facture(v_a);
  perform public._t010_refuse($q$update public.devis set statut = 'envoye' where id = 'a0100000-0000-4000-8000-000000000d06'$q$, 'plus quitter le statut accepté');
  perform public.finaliser_facture(public.creer_avoir(v_a, 'Annulation', true));
  update public.devis set statut = 'envoye' where id = 'a0100000-0000-4000-8000-000000000d06';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : devis bloqué alors que ses acomptes sont annulés'; end if;
  -- Puis un acompte n'est plus possible, et une finalisation laissée en brouillon échoue
  perform public._t010_refuse($q$select public.creer_acompte('a0100000-0000-4000-8000-000000000d06', 'pourcentage', 10)$q$, 'devis accepté');
end $$;

-- 6. Admin (A) : remise globale, montant TTC à un centime, plafond par taux, suppression, finalisation tardive
select set_config('request.jwt.claims', '{"sub":"a0100000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
declare v_a uuid; v_solde uuid; a jsonb; n int; f record; v_attente uuid;
begin
  -- Suppression définitive : brouillon de solde refusé, devis avec acompte refusé
  select id into v_solde from public.factures where devis_id = 'a0100000-0000-4000-8000-000000000d01' and type = 'solde';
  perform public._t010_refuse(format($q$delete from public.factures where id = %L$q$, v_solde), 'ne peut pas être supprimée');
  perform public._t010_refuse($q$delete from public.devis where id = 'a0100000-0000-4000-8000-000000000d06'$q$, 'des acomptes');

  -- Devis à remise : 100 € à 20 % + 50 € à 10 %, remise de 10 € : TTC 163,34 € (cas 9 de cas_totaux.json)
  insert into public.devis (id, entreprise_id, client_id, remise) values
    ('a0100000-0000-4000-8000-000000000d07', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1', 10);
  insert into public.lignes_devis (entreprise_id, devis_id, description, prix_unitaire, taux_tva, position) values
    ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-000000000d07', 'A', 100, 20, 0),
    ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-000000000d07', 'B', 50, 10, 1);
  update public.devis set statut = 'envoye' where id = 'a0100000-0000-4000-8000-000000000d07';
  update public.devis set statut = 'accepte' where id = 'a0100000-0000-4000-8000-000000000d07';
  a := public.totaux_devis_calcules('a0100000-0000-4000-8000-000000000d07');
  select count(*) into n from public.devis_totaux where devis_id = 'a0100000-0000-4000-8000-000000000d07'
    and total_ttc = (a->>'total_ttc')::numeric and total_ht = (a->>'total_ht')::numeric and total_tva = (a->>'total_tva')::numeric;
  if n <> 1 or (a->>'total_ttc')::numeric <> 163.34 then raise exception 'ÉCHEC : totaux_devis_calcules diffère de devis_totaux (%)', a; end if;

  -- 50 % : 46,67 + 9,33 et 23,34 + 2,33 = 81,67 ; solde 46,66 + 9,34 et 23,33 + 2,34 = 81,67
  v_a := public.creer_acompte('a0100000-0000-4000-8000-000000000d07', 'pourcentage', 50);
  perform public.finaliser_facture(v_a);
  select * into f from public.factures where id = v_a;
  if f.total_ttc <> 81.67 or f.tva_detail is distinct from '[{"taux": 20, "base": 46.67, "tva": 9.33}, {"taux": 10, "base": 23.34, "tva": 2.33}]'::jsonb then
    raise exception 'ÉCHEC : acompte avec remise (%)', to_jsonb(f);
  end if;
  v_solde := public.convertir_devis('a0100000-0000-4000-8000-000000000d07');
  perform public.finaliser_facture(v_solde);
  select * into f from public.factures where id = v_solde;
  if f.total_ttc <> 81.67 or f.remise_appliquee <> 10
     or f.tva_detail is distinct from '[{"taux": 20, "base": 46.66, "tva": 9.34}, {"taux": 10, "base": 23.33, "tva": 2.34}]'::jsonb then
    raise exception 'ÉCHEC : solde avec remise (%)', to_jsonb(f);
  end if;
  select count(*) into n from public.devis_totaux where devis_id = 'a0100000-0000-4000-8000-000000000d07' and total_ttc = 81.67 + f.total_ttc;
  if n <> 1 then raise exception 'ÉCHEC : acompte + solde différents du devis à remise'; end if;
  v_a := public.creer_avoir(v_solde, 'Annulation du solde à remise', true);
  select count(*) into n from public.factures where id = v_a and remise = 0;
  if n <> 1 then raise exception 'ÉCHEC : remise reprise sur l''avoir total d''un solde'; end if;
  perform public.finaliser_facture(v_a);
  select count(*) into n from public.factures where id = v_a and total_ttc = -81.67 and remise_appliquee = 0;
  if n <> 1 then raise exception 'ÉCHEC : avoir total sur un solde à remise'; end if;

  -- Montant TTC inatteignable : 0,03 € à 20 % donne 0,04 €, affiché par l'aperçu
  insert into public.devis (id, entreprise_id, client_id) values
    ('a0100000-0000-4000-8000-000000000d08', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1');
  insert into public.lignes_devis (entreprise_id, devis_id, description, prix_unitaire, taux_tva) values
    ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-000000000d08', 'A', 100, 20);
  update public.devis set statut = 'envoye' where id = 'a0100000-0000-4000-8000-000000000d08';
  update public.devis set statut = 'accepte' where id = 'a0100000-0000-4000-8000-000000000d08';
  a := public.apercu_acompte('a0100000-0000-4000-8000-000000000d08', 'montant', 0.03);
  if (a->>'total_ttc')::numeric not in (0.04, 0.02) then raise exception 'ÉCHEC : écart de centime non restitué (%)', a; end if;
  a := public.apercu_acompte('a0100000-0000-4000-8000-000000000d08', 'montant', 60);
  if (a->>'total_ttc')::numeric <> 60 or (a->'tva_detail'->0->>'base')::numeric <> 50 then raise exception 'ÉCHEC : montant TTC exact (%)', a; end if;

  -- Plafond à la finalisation : deux brouillons qui ensemble dépassent
  v_a := public.creer_acompte('a0100000-0000-4000-8000-000000000d08', 'pourcentage', 60);
  v_attente := public.creer_acompte('a0100000-0000-4000-8000-000000000d08', 'pourcentage', 60);
  perform public.finaliser_facture(v_a);
  perform public._t010_refuse(format($q$select public.finaliser_facture(%L)$q$, v_attente), 'cumul des acomptes');

  -- Plafond par taux : 0,30 € HT à 5,5 % (TVA 0,02 €) + 100 € HT à 20 % ; 3 acomptes de 33 % : 99 % du TTC,
  -- mais 0,10 € HT à 5,5 % donne 0,01 € de TVA à chaque fois : le troisième dépasserait la TVA de ce taux.
  insert into public.devis (id, entreprise_id, client_id) values
    ('a0100000-0000-4000-8000-000000000d10', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1');
  insert into public.lignes_devis (entreprise_id, devis_id, description, prix_unitaire, taux_tva) values
    ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-000000000d10', 'A', 0.30, 5.5),
    ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-000000000d10', 'B', 100, 20);
  update public.devis set statut = 'envoye' where id = 'a0100000-0000-4000-8000-000000000d10';
  update public.devis set statut = 'accepte' where id = 'a0100000-0000-4000-8000-000000000d10';
  perform public.finaliser_facture(public.creer_acompte('a0100000-0000-4000-8000-000000000d10', 'pourcentage', 33));
  perform public.finaliser_facture(public.creer_acompte('a0100000-0000-4000-8000-000000000d10', 'pourcentage', 33));
  perform public._t010_refuse($q$select public.creer_acompte('a0100000-0000-4000-8000-000000000d10', 'pourcentage', 33)$q$, 'le cumul dépasserait le devis');
  -- Base par taux et taux absent
  perform public._t010_refuse($q$select public.controler_plafond_acompte('a0100000-0000-4000-8000-000000000d10', '[{"taux": 20, "base": 50, "tva": 10}]', 1)$q$, 'le cumul dépasserait le devis');
  perform public._t010_refuse($q$select public.controler_plafond_acompte('a0100000-0000-4000-8000-000000000d10', '[{"taux": 10, "base": 1, "tva": 0.1}]', 1.1)$q$, 'ne comporte pas de TVA');

  -- Client supprimé : plus d'acompte
  perform public._t010_devis('a0100000-0000-4000-8000-000000000d09', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c3');
  update public.clients set deleted_at = now() where id = 'a0100000-0000-4000-8000-0000000000c3';
  perform public._t010_refuse($q$select public.creer_acompte('a0100000-0000-4000-8000-000000000d09', 'pourcentage', 10)$q$, 'a été supprimé');

  -- Brouillon de solde : suppression définitive refusée
  perform public._t010_devis('a0100000-0000-4000-8000-000000000d11', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1');
  v_a := public.creer_acompte('a0100000-0000-4000-8000-000000000d11', 'pourcentage', 20);
  -- Écriture directe d'un acompte : le client vient du devis
  insert into public.factures (id, entreprise_id, client_id, type, devis_id, acompte_mode, acompte_valeur, date_echeance) values
    ('a0100000-0000-4000-8000-000000000f11', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c3', 'acompte',
     'a0100000-0000-4000-8000-000000000d11', 'pourcentage', 1, current_date + 1);
  select count(*) into n from public.factures where id = 'a0100000-0000-4000-8000-000000000f11' and client_id = 'a0100000-0000-4000-8000-0000000000c1';
  if n <> 1 then raise exception 'ÉCHEC : acompte direct avec un autre client'; end if;
  delete from public.factures where id = 'a0100000-0000-4000-8000-000000000f11';
  -- Solde direct refusé tant qu'un acompte est en brouillon
  perform public._t010_refuse(
    $q$insert into public.factures (entreprise_id, client_id, type, devis_id, acomptes_deduits) values ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1', 'solde', 'a0100000-0000-4000-8000-000000000d11', '[]')$q$,
    'encore en brouillon');
  -- Un acompte sans échéance ne se finalise pas
  update public.factures set date_echeance = null where id = v_a;
  perform public._t010_refuse(format($q$select public.finaliser_facture(%L)$q$, v_a), 'date d''échéance');
  update public.factures set date_echeance = public.date_du_jour_paris() + 30 where id = v_a;
  perform public.finaliser_facture(v_a);
  v_solde := public.convertir_devis('a0100000-0000-4000-8000-000000000d11');
  perform public._t010_refuse(format($q$delete from public.factures where id = %L$q$, v_solde), 'ne peut pas être supprimé');

  -- Brouillon d'acompte supprimé : le devis retrouve sa liberté
  perform public._t010_devis('a0100000-0000-4000-8000-000000000d12', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1');
  v_a := public.creer_acompte('a0100000-0000-4000-8000-000000000d12', 'pourcentage', 20);
  perform public._t010_refuse($q$update public.devis set statut = 'envoye' where id = 'a0100000-0000-4000-8000-000000000d12'$q$, 'plus quitter le statut accepté');
  update public.factures set deleted_at = now() where id = v_a;
  update public.devis set statut = 'envoye' where id = 'a0100000-0000-4000-8000-000000000d12';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : brouillon supprimé bloque encore le devis'; end if;

  -- Finaliser un acompte oublié après la conversion : impossible (la conversion l'interdit déjà) ; statut direct refusé
  perform public._t010_refuse(format($q$update public.factures set statut = 'payee' where id = %L$q$, v_attente), 'doit d''abord être finalisée');
  update public.factures set deleted_at = now() where id = v_attente;
end $$;

-- 7. Lecture (A) : aucune écriture, aperçu possible
select set_config('request.jwt.claims', '{"sub":"a0100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare a jsonb; n int;
begin
  a := public.apercu_acompte('a0100000-0000-4000-8000-000000000d08', 'pourcentage', 10);
  perform public._t010_refuse($q$select public.creer_acompte('a0100000-0000-4000-8000-000000000d08', 'pourcentage', 10)$q$, 'Votre rôle ne permet pas de créer un acompte');
  perform public._t010_refuse($q$select public.convertir_devis('a0100000-0000-4000-8000-000000000d08')$q$, 'Votre rôle ne permet pas');
  update public.devis set statut = 'envoye' where id = 'a0100000-0000-4000-8000-000000000d08';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC : le rôle lecture a modifié un devis'; end if;
end $$;

-- 8. Admin de B : aucune fuite, séries indépendantes
select set_config('request.jwt.claims', '{"sub":"a0100000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$
declare v_numero text; n int; v_solde uuid; v_a uuid;
begin
  select count(*) into n from public.factures where entreprise_id <> 'a0100000-0000-4000-8000-0000000000e2';
  if n <> 0 then raise exception 'ÉCHEC : B voit % document(s) d''une autre entreprise', n; end if;
  perform public._t010_refuse($q$select public.creer_acompte('a0100000-0000-4000-8000-000000000d08', 'pourcentage', 1)$q$, 'introuvable');
  perform public._t010_refuse($q$select public.apercu_acompte('a0100000-0000-4000-8000-000000000d08', 'pourcentage', 1)$q$, 'introuvable');
  perform public._t010_refuse(
    $q$insert into public.factures (entreprise_id, client_id, type, devis_id, acompte_mode, acompte_valeur) values ('a0100000-0000-4000-8000-0000000000e2', 'a0100000-0000-4000-8000-0000000000c2', 'acompte', 'a0100000-0000-4000-8000-000000000d08', 'pourcentage', 1)$q$,
    'même entreprise');
  v_a := public.creer_acompte('a0100000-0000-4000-8000-000000000d20', 'pourcentage', 30);
  v_numero := public.finaliser_facture(v_a);
  if v_numero <> public._t010_numero(1) then raise exception 'ÉCHEC : numéro % dans B au lieu du premier', v_numero; end if;
  v_solde := public.convertir_devis('a0100000-0000-4000-8000-000000000d20');
  v_numero := public.finaliser_facture(v_solde);
  if v_numero <> public._t010_numero(2) then raise exception 'ÉCHEC : solde de B numéroté %', v_numero; end if;
end $$;

-- 9. Retour en postgres : série FAC, figement, audit, contraintes
reset role;
select set_config('request.jwt.claims', '{}', true);
do $$
declare n int; v_max int; v_distincts int;
begin
  -- Série FAC de A : acomptes et soldes dans une seule série, sans trou ni doublon
  select count(*), max(substring(numero from 10)::int), count(distinct numero) into n, v_max, v_distincts
    from public.factures
   where entreprise_id = 'a0100000-0000-4000-8000-0000000000e1' and numero like 'FAC-%';
  if n <> v_max or n <> v_distincts then raise exception 'ÉCHEC : série FAC incohérente (% numéros, maximum %)', n, v_max; end if;
  select count(*) into n from public.factures where entreprise_id = 'a0100000-0000-4000-8000-0000000000e1' and type in ('acompte', 'solde') and statut <> 'brouillon' and numero not like 'FAC-%';
  if n <> 0 then raise exception 'ÉCHEC : % acompte(s) ou solde(s) hors série', n; end if;

  -- Totaux figés d'un solde : un changement de lignes ne les touche pas
  update public.lignes_facture l set prix_unitaire = 999999
    from public.factures f where f.id = l.facture_id and f.devis_id = 'a0100000-0000-4000-8000-000000000d01' and f.type = 'solde';
  select count(*) into n from public.factures f join public.factures_totaux t on t.facture_id = f.id
   where f.devis_id = 'a0100000-0000-4000-8000-000000000d01' and f.type = 'solde' and t.total_ttc = 1225;
  if n <> 1 then raise exception 'ÉCHEC : un solde émis a changé de total'; end if;

  -- Trace
  select count(*) into n from public.audit_events a join public.factures f on f.id = a.record_id
   where a.table_name = 'factures' and f.devis_id = 'a0100000-0000-4000-8000-000000000d01' and f.type = 'solde'
     and a.new_data->>'statut' = 'finalisee' and a.user_id = 'a0100000-0000-4000-8000-000000000003';
  if n <> 1 then raise exception 'ÉCHEC : finalisation du solde absente de audit_events'; end if;

  -- Contraintes
  perform public._t010_refuse(
    $q$insert into public.factures (entreprise_id, client_id, type) values ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1', 'acompte')$q$,
    'factures_avoir_coherent');
  perform public._t010_refuse(
    $q$insert into public.factures (entreprise_id, client_id, type, devis_id) values ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1', 'acompte', 'a0100000-0000-4000-8000-000000000d08')$q$,
    'factures_avoir_coherent');
  perform public._t010_refuse(
    $q$insert into public.factures (entreprise_id, client_id, type, devis_id, acompte_mode, acompte_valeur) values ('a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1', 'acompte', 'a0100000-0000-4000-8000-000000000d08', 'autre', 1)$q$,
    'factures_');
end $$;

-- 10. Acompte en brouillon, devis sorti d'« accepté » par le rôle postgres : la finalisation est refusée
select set_config('request.jwt.claims', '{"sub":"a0100000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_a uuid;
begin
  perform public._t010_devis('a0100000-0000-4000-8000-000000000d13', 'a0100000-0000-4000-8000-0000000000e1', 'a0100000-0000-4000-8000-0000000000c1');
  perform set_config('test.acompte', public.creer_acompte('a0100000-0000-4000-8000-000000000d13', 'pourcentage', 20)::text, true);
end $$;
reset role;
select set_config('request.jwt.claims', '{}', true);
update public.devis set statut = 'refuse' where id = 'a0100000-0000-4000-8000-000000000d13';
select set_config('request.jwt.claims', '{"sub":"a0100000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public._t010_refuse(format($q$select public.finaliser_facture(%L)$q$, current_setting('test.acompte')), 'plus au statut accepté');
end $$;
reset role;

do $$ begin raise notice 'Tests 010 : tous passés.'; end $$;

rollback;
