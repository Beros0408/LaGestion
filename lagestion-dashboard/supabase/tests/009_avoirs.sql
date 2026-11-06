-- 009_avoirs.sql — Lagestion
-- Vérifie la migration 009 (avoirs) :
--   - avoir total et partiel, sur une facture à deux taux : montants au centime ;
--   - numérotation AV continue, indépendante des factures et de chaque entreprise ; échec sans numéro consommé ;
--   - verrouillage ; référence à la facture d'origine ; motif obligatoire ;
--   - plafonds TTC et par taux ; annulation par cumul ; statut « annulée » inaccessible autrement ;
--   - remboursement du trop-perçu, plafonné ; reste à payer (vue factures_soldes) ;
--   - isolation entre entreprises et droits par rôle.
-- La concurrence réelle se vérifie à part : supabase/tests/009_concurrence.mjs.
-- À lancer après migrations/009_avoirs.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0090…)
--   entreprise A …00e1 : lecture …0001 · commercial …0002 · comptable …0003 · manager …0004 · admin …0005
--   entreprise B …00e2 : admin …0006 ; client de B …00c2 ; facture de B …0f20
--   clients de A : …00c1 (actif), …00c3 (supprimé ensuite)
--   facture type (deux taux) : 1 000 € HT à 20 % + 500 € HT à 10 % = 1 500 € HT, 250 € de TVA, 1 750 € TTC

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role)
select ('a0090000-0000-4000-8000-00000000000' || i)::uuid, 'test-009-' || i || '@lagestion.invalid', 'authenticated', 'authenticated'
from generate_series(1, 6) i;

insert into public.entreprises (id, nom, siret, adresse) values
  ('a0090000-0000-4000-8000-0000000000e1', 'Entreprise A (test 009)', '11111111100011', '1 rue de A, 75001 Paris'),
  ('a0090000-0000-4000-8000-0000000000e2', 'Entreprise B (test 009)', '22222222200022', '2 rue de B, 69001 Lyon');

insert into public.memberships (entreprise_id, user_id, role) values
  ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000001', 'lecture'),
  ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000002', 'commercial'),
  ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000003', 'comptable'),
  ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000004', 'manager'),
  ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000005', 'admin'),
  ('a0090000-0000-4000-8000-0000000000e2', 'a0090000-0000-4000-8000-000000000006', 'admin');

insert into public.clients (id, entreprise_id, nom, adresse) values
  ('a0090000-0000-4000-8000-0000000000c1', 'a0090000-0000-4000-8000-0000000000e1', 'Client A', '10 rue du Client, 75002 Paris'),
  ('a0090000-0000-4000-8000-0000000000c2', 'a0090000-0000-4000-8000-0000000000e2', 'Client B', null),
  ('a0090000-0000-4000-8000-0000000000c3', 'a0090000-0000-4000-8000-0000000000e1', 'Client A supprimé ensuite', '3 rue Disparue');

-- Helpers de test, retirés par le rollback final
create function public._t009_refuse(p_sql text, p_extrait text) returns void
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
grant execute on function public._t009_refuse(text, text) to authenticated;

-- Facture finalisée à deux taux, 1 750 € TTC, finalisée par l'utilisateur courant.
create function public._t009_facture(p_id uuid, p_entreprise uuid, p_client uuid) returns void
language plpgsql as $$
begin
  insert into public.factures (id, entreprise_id, client_id, date_echeance)
  values (p_id, p_entreprise, p_client, public.date_du_jour_paris() + 30);
  insert into public.lignes_facture (entreprise_id, facture_id, description, quantite, prix_unitaire, taux_tva, position) values
    (p_entreprise, p_id, 'Travaux à 20 %', 1, 1000, 20, 0),
    (p_entreprise, p_id, 'Travaux à 10 %', 1, 500, 10, 1);
  perform public.finaliser_facture(p_id);
end $$;
grant execute on function public._t009_facture(uuid, uuid, uuid) to authenticated;

-- Lignes d'un avoir partiel : p_ht20 € HT à 20 %, p_ht10 € HT à 10 %
create function public._t009_lignes(p_ht20 numeric, p_ht10 numeric) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('description', 'Partiel à ' || taux || ' %', 'quantite', 1, 'prix_unitaire', ht,
    'taux_tva', taux, 'remise', 0, 'position', taux)), '[]'::jsonb)
  from (values (20, p_ht20), (10, p_ht10)) v(taux, ht) where ht > 0
$$;
grant execute on function public._t009_lignes(numeric, numeric) to authenticated;

create function public._t009_numero(p_prefixe text, p_rang int) returns text
language sql stable as $$
  select p_prefixe || '-' || to_char(public.date_du_jour_paris(), 'YYYY') || '-' || lpad(p_rang::text, 4, '0')
$$;
grant execute on function public._t009_numero(text, int) to authenticated;

set local role authenticated;

-- 2. Admin de B : une facture finalisée que A ne doit jamais atteindre
select set_config('request.jwt.claims', '{"sub":"a0090000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select public._t009_facture('a0090000-0000-4000-8000-000000000f20', 'a0090000-0000-4000-8000-0000000000e2', 'a0090000-0000-4000-8000-0000000000c2');

-- 3. Commercial (A) : prépare un brouillon d'avoir, ne le finalise pas ; règles de création
select set_config('request.jwt.claims', '{"sub":"a0090000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare v_avoir uuid; r record; n int;
begin
  perform public._t009_facture('a0090000-0000-4000-8000-000000000f01', 'a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1');

  -- Pas d'avoir sur un brouillon, ni sans motif, ni sans ligne, ni sur une autre entreprise
  insert into public.factures (id, entreprise_id, client_id) values
    ('a0090000-0000-4000-8000-000000000f02', 'a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1');
  perform public._t009_refuse(
    $q$select public.creer_avoir('a0090000-0000-4000-8000-000000000f02', 'Motif', true)$q$,
    'Finalisez cette facture');
  perform public._t009_refuse(
    $q$select public.creer_avoir('a0090000-0000-4000-8000-000000000f01', '  ', true)$q$,
    'motif de l''avoir est obligatoire');
  perform public._t009_refuse(
    $q$select public.creer_avoir('a0090000-0000-4000-8000-000000000f01', 'Motif', false, '[]')$q$,
    'au moins une ligne');
  perform public._t009_refuse(
    $q$select public.creer_avoir('a0090000-0000-4000-8000-000000000f20', 'Motif', true)$q$,
    'introuvable');

  -- Une écriture directe ne contourne ni la référence ni le client
  perform public._t009_refuse(
    $q$insert into public.factures (entreprise_id, client_id, type, motif) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1', 'avoir', 'Motif')$q$,
    'introuvable');
  perform public._t009_refuse(
    $q$insert into public.factures (entreprise_id, client_id, facture_origine_id) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1', 'a0090000-0000-4000-8000-000000000f01')$q$,
    'factures_avoir_coherent');
  perform public._t009_refuse(
    $q$insert into public.factures (entreprise_id, client_id, type, motif, facture_origine_id) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1', 'avoir', 'Motif', 'a0090000-0000-4000-8000-000000000f20')$q$,
    'même entreprise');

  -- Écriture directe : client, échéance et remise viennent de la facture, pas de la demande
  insert into public.factures (id, entreprise_id, client_id, type, motif, facture_origine_id, date_echeance, remise) values
    ('a0090000-0000-4000-8000-000000000f0a', 'a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c3', 'avoir', 'Direct',
     'a0090000-0000-4000-8000-000000000f01', current_date, 5);
  select count(*) into n from public.factures
   where id = 'a0090000-0000-4000-8000-000000000f0a' and client_id = 'a0090000-0000-4000-8000-0000000000c1'
     and date_echeance is null and remise = 0;
  if n <> 1 then raise exception 'ÉCHEC : une écriture directe a imposé le client, l''échéance ou la remise'; end if;
  delete from public.factures where id = 'a0090000-0000-4000-8000-000000000f0a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC : le commercial a supprimé un brouillon d''avoir'; end if;

  -- Paiement refusé sur un brouillon de facture, y compris un remboursement
  perform public._t009_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f02', 1)$q$,
    'avant d''enregistrer un paiement');
  perform public._t009_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant, sens) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f02', 1, 'remboursement')$q$,
    'avant d''enregistrer un paiement');

  -- Brouillon d'avoir partiel par le commercial : sans numéro, négatif dans la vue, client repris de la facture
  v_avoir := public.creer_avoir('a0090000-0000-4000-8000-000000000f01', 'Geste commercial', false, public._t009_lignes(100, 50));
  select f.numero, f.statut, f.type, f.client_id, f.date_echeance, f.total_ttc, t.total_ttc as vue, t.total_ht as vue_ht
    into r from public.factures f join public.factures_totaux t on t.facture_id = f.id where f.id = v_avoir;
  if r.numero is not null or r.statut <> 'brouillon' or r.type <> 'avoir' or r.client_id <> 'a0090000-0000-4000-8000-0000000000c1'
     or r.date_echeance is not null or r.total_ttc is not null or r.vue <> -175 or r.vue_ht <> -150 then
    raise exception 'ÉCHEC : brouillon d''avoir incorrect (%)', to_jsonb(r);
  end if;

  -- Le commercial ne finalise pas, y compris en écriture directe ; aucun numéro consommé
  perform public._t009_refuse(format($q$select public.finaliser_facture(%L)$q$, v_avoir), 'peut finaliser un avoir');
  perform public._t009_refuse(format($q$update public.factures set statut = 'finalisee' where id = %L$q$, v_avoir), 'peut finaliser un avoir');

  -- Brouillon : motif et lignes modifiables ; référence, type, client, remise non
  perform public.enregistrer_facture(v_avoir, '{"motif": "Geste commercial corrigé"}');
  select count(*) into n from public.factures where id = v_avoir and motif = 'Geste commercial corrigé';
  if n <> 1 then raise exception 'ÉCHEC : motif non modifié'; end if;
  perform public._t009_refuse(format($q$select public.enregistrer_facture(%L, '{"motif": " "}')$q$, v_avoir), 'motif de l''avoir est obligatoire');
  perform public._t009_refuse(format($q$update public.factures set facture_origine_id = 'a0090000-0000-4000-8000-000000000f02' where id = %L$q$, v_avoir), 'ne peuvent pas être modifiés');
  perform public._t009_refuse(format($q$update public.factures set type = 'facture', facture_origine_id = null, motif = null where id = %L$q$, v_avoir), 'ne peuvent pas être modifiés');
  perform public._t009_refuse(format($q$update public.factures set avoir_total = true where id = %L$q$, v_avoir), 'ne peuvent pas être modifiés');
  perform public._t009_refuse(format($q$update public.factures set client_id = 'a0090000-0000-4000-8000-0000000000c3' where id = %L$q$, v_avoir), 'ne peuvent pas être modifiés');
  perform public._t009_refuse(format($q$update public.factures set remise = 5 where id = %L$q$, v_avoir), 'ne peuvent pas être modifiés');
  perform public._t009_refuse(format($q$update public.factures set date_echeance = current_date where id = %L$q$, v_avoir), 'ne peuvent pas être modifiés');

  -- Paiement sur un avoir : refusé
  perform public._t009_refuse(format($q$insert into public.paiements (entreprise_id, facture_id, montant) values ('a0090000-0000-4000-8000-0000000000e1', %L, 10)$q$, v_avoir), 'ne reçoit pas de paiement');

  -- Un brouillon d'avoir ne réduit rien
  select reste_a_payer into n from public.factures_soldes where facture_id = 'a0090000-0000-4000-8000-000000000f01';
  if n <> 1750 then raise exception 'ÉCHEC : un brouillon d''avoir réduit le reste à payer (%)', n; end if;
end $$;

-- 4. Comptable (A) : avoir partiel sur deux taux, -175,00 € au centime
select set_config('request.jwt.claims', '{"sub":"a0090000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare v_avoir uuid; f record; s record; v_numero text; n int;
begin
  select id into v_avoir from public.factures where facture_origine_id = 'a0090000-0000-4000-8000-000000000f01' and motif = 'Geste commercial corrigé';
  v_numero := public.finaliser_facture(v_avoir);
  if v_numero <> public._t009_numero('AV', 1) then raise exception 'ÉCHEC : premier avoir numéroté %', v_numero; end if;

  select * into f from public.factures where id = v_avoir;
  if (f.total_ht_brut, f.remise_appliquee, f.total_ht, f.total_tva, f.total_ttc)
     is distinct from (-150::numeric, 0::numeric, -150::numeric, -25::numeric, -175::numeric) then
    raise exception 'ÉCHEC : totaux de l''avoir partiel incorrects (%)', to_jsonb(f);
  end if;
  if f.tva_detail is distinct from '[{"taux": 20, "base": -100, "tva": -20}, {"taux": 10, "base": -50, "tva": -5}]'::jsonb then
    raise exception 'ÉCHEC : TVA par taux de l''avoir incorrecte (%)', f.tva_detail;
  end if;
  if f.statut <> 'finalisee' or f.date_emission <> public.date_du_jour_paris() or f.date_echeance is not null
     or f.client_fige->>'nom' is distinct from 'Client A' or f.emetteur_fige->>'siret' is distinct from '11111111100011' then
    raise exception 'ÉCHEC : avoir mal figé (%)', to_jsonb(f);
  end if;

  -- Reste à payer : 1 750 - 175 = 1 575 ; la facture n'est pas annulée
  select * into s from public.factures_soldes where facture_id = 'a0090000-0000-4000-8000-000000000f01';
  if (s.total_ttc, s.avoirs_ttc, s.encaisse_net, s.reste_a_payer, s.trop_percu)
     is distinct from (1750::numeric, 175::numeric, 0::numeric, 1575::numeric, 0::numeric) then
    raise exception 'ÉCHEC : solde incorrect après un avoir partiel (%)', to_jsonb(s);
  end if;
  select count(*) into n from public.factures where id = 'a0090000-0000-4000-8000-000000000f01' and statut = 'finalisee';
  if n <> 1 then raise exception 'ÉCHEC : un avoir partiel a changé le statut de la facture'; end if;
  -- La facture d'origine garde ses totaux figés
  select count(*) into n from public.factures where id = 'a0090000-0000-4000-8000-000000000f01' and total_ttc = 1750;
  if n <> 1 then raise exception 'ÉCHEC : la facture d''origine a changé de total'; end if;

  -- Avoir finalisé verrouillé
  perform public._t009_refuse(format($q$update public.factures set motif = 'Autre' where id = %L$q$, v_avoir), 'ne peut plus être modifiée');
  perform public._t009_refuse(format($q$update public.factures set total_ttc = -1 where id = %L$q$, v_avoir), 'ne peut plus être modifiée');
  perform public._t009_refuse(format($q$update public.factures set facture_origine_id = 'a0090000-0000-4000-8000-000000000f02' where id = %L$q$, v_avoir), 'ne peut plus être modifiée');
  perform public._t009_refuse(format($q$update public.factures set numero = 'AV-2099-0001' where id = %L$q$, v_avoir), 'numéro d''une facture émise');
  perform public._t009_refuse(format($q$insert into public.lignes_facture (entreprise_id, facture_id, description) values ('a0090000-0000-4000-8000-0000000000e1', %L, 'X')$q$, v_avoir), 'ne peuvent plus être modifiées');
  perform public._t009_refuse(format($q$update public.lignes_facture set prix_unitaire = 1 where facture_id = %L$q$, v_avoir), 'ne peuvent plus être modifiées');
  perform public._t009_refuse(format($q$delete from public.lignes_facture where facture_id = %L$q$, v_avoir), 'ne peuvent plus être modifiées');
  perform public._t009_refuse(format($q$select public.enregistrer_facture(%L, '{"motif": "Autre"}')$q$, v_avoir), 'ne peut plus être modifiée');
  perform public._t009_refuse(format($q$select public.finaliser_facture(%L)$q$, v_avoir), 'déjà finalisée');
  perform public._t009_refuse(format($q$insert into public.paiements (entreprise_id, facture_id, montant, sens) values ('a0090000-0000-4000-8000-0000000000e1', %L, 10, 'remboursement')$q$, v_avoir), 'ne reçoit pas de paiement');

  -- Statuts d'un avoir : seule transition finalisée → envoyée
  perform public._t009_refuse(format($q$update public.factures set statut = 'payee' where id = %L$q$, v_avoir), 'pas autorisé sur un avoir');
  perform public._t009_refuse(format($q$update public.factures set statut = 'annulee' where id = %L$q$, v_avoir), 'pas autorisé sur un avoir');
  update public.factures set statut = 'envoyee' where id = v_avoir;
  perform public._t009_refuse(format($q$update public.factures set statut = 'finalisee' where id = %L$q$, v_avoir), 'pas autorisé sur un avoir');

  -- Pas d'avoir sur un avoir
  perform public._t009_refuse(format($q$select public.creer_avoir(%L, 'Motif', true)$q$, v_avoir), 'ne peut porter que sur une facture');

  -- Annulation directe interdite tant que le cumul n'atteint pas le TTC
  perform public._t009_refuse(
    $q$update public.factures set statut = 'annulee' where id = 'a0090000-0000-4000-8000-000000000f01'$q$,
    'passe par un avoir total');

  -- Avoir total refusé après un avoir partiel finalisé
  perform public._t009_refuse(
    $q$select public.creer_avoir('a0090000-0000-4000-8000-000000000f01', 'Total', true)$q$,
    'un avoir total n''est plus possible');
end $$;

-- 5. Manager (A) : plafonds par taux et TTC, épuisement exact, annulation par cumul
select set_config('request.jwt.claims', '{"sub":"a0090000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare v_a uuid; v_b uuid; n int; v_numero text; s record;
begin
  -- Plafond par taux : 900,01 € HT à 20 % restent impossibles (reste 900 €), même si le TTC restant le permettrait
  v_a := public.creer_avoir('a0090000-0000-4000-8000-000000000f01', 'Trop à 20 %', false, public._t009_lignes(900.01, 0));
  perform public._t009_refuse(format($q$select public.finaliser_facture(%L)$q$, v_a), 'il reste 900');
  -- Taux absent de la facture
  v_b := public.creer_avoir('a0090000-0000-4000-8000-000000000f01', 'Taux inconnu', false,
    '[{"description":"X","quantite":1,"prix_unitaire":10,"taux_tva":5.5,"remise":0,"position":0}]');
  perform public._t009_refuse(format($q$select public.finaliser_facture(%L)$q$, v_b), 'ne comporte pas de TVA');
  -- Avoir à 0 € refusé
  perform public.enregistrer_facture(v_b, '{}', '[{"description":"X","quantite":1,"prix_unitaire":0,"taux_tva":20,"remise":0,"position":0}]');
  perform public._t009_refuse(format($q$select public.finaliser_facture(%L)$q$, v_b), 'doit être positif');

  -- Ces refus n'ont consommé aucun numéro : le suivant est 0002
  perform public.enregistrer_facture(v_a, '{"motif": "Solde du 20 %"}', public._t009_lignes(900, 0));
  v_numero := public.finaliser_facture(v_a);
  if v_numero <> public._t009_numero('AV', 2) then raise exception 'ÉCHEC : numéro % au lieu de AV 0002', v_numero; end if;

  -- Plus rien à 20 %
  perform public.enregistrer_facture(v_b, '{}', public._t009_lignes(0.01, 0));
  perform public._t009_refuse(format($q$select public.finaliser_facture(%L)$q$, v_b), 'il reste 0');

  -- Solde du dernier taux : cumul = TTC, la facture passe annulée
  perform public.enregistrer_facture(v_b, '{"motif": "Solde du 10 %"}', public._t009_lignes(0, 450));
  v_numero := public.finaliser_facture(v_b);
  if v_numero <> public._t009_numero('AV', 3) then raise exception 'ÉCHEC : numéro % au lieu de AV 0003', v_numero; end if;
  select count(*) into n from public.factures where id = 'a0090000-0000-4000-8000-000000000f01' and statut = 'annulee';
  if n <> 1 then raise exception 'ÉCHEC : facture non annulée alors que le cumul atteint le TTC'; end if;
  select * into s from public.factures_soldes where facture_id = 'a0090000-0000-4000-8000-000000000f01';
  if s.avoirs_ttc <> 1750 or s.reste_a_payer <> 0 or s.trop_percu <> 0 then
    raise exception 'ÉCHEC : solde après annulation incorrect (%)', to_jsonb(s);
  end if;

  -- Facture annulée : plus d'avoir ni d'encaissement, plus de sortie de ce statut
  perform public._t009_refuse(
    $q$select public.creer_avoir('a0090000-0000-4000-8000-000000000f01', 'Encore', true)$q$,
    'déjà annulée');
  perform public._t009_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f01', 1)$q$,
    'annulée ne peut pas recevoir');
  perform public._t009_refuse(
    $q$update public.factures set statut = 'envoyee' where id = 'a0090000-0000-4000-8000-000000000f01'$q$,
    'n''est pas autorisé');
  -- Suppression : ni la facture ni l'avoir finalisé
  perform public._t009_refuse(format($q$update public.factures set deleted_at = now() where id = %L$q$, v_a), 'ne peut pas être supprimée');
  perform public._t009_refuse(format($q$delete from public.factures where id = %L$q$, v_a), 'ne peut pas être supprimée');
end $$;

-- 6. Admin (A) : avoir total, -1 750,00 € ; remise globale ; facture payée puis remboursée
select set_config('request.jwt.claims', '{"sub":"a0090000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
declare v_avoir uuid; f record; s record; n int; v_paiement uuid; v_numero text;
begin
  -- Suppression d'un brouillon d'avoir par la direction, sans laisser de trou
  delete from public.factures where id = 'a0090000-0000-4000-8000-000000000f0a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : la direction n''a pas pu supprimer un brouillon d''avoir'; end if;

  perform public._t009_facture('a0090000-0000-4000-8000-000000000f03', 'a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1');
  insert into public.paiements (entreprise_id, facture_id, montant) values
    ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f03', 1750);

  -- Sans avoir : aucun trop-perçu, remboursement refusé
  perform public._t009_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant, sens) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f03', 1, 'remboursement')$q$,
    'Remboursement refusé');

  v_avoir := public.creer_avoir('a0090000-0000-4000-8000-000000000f03', 'Annulation de la commande', true);
  -- Lignes d'un avoir total intouchables
  perform public._t009_refuse(format($q$select public.enregistrer_facture(%L, '{}', '[]')$q$, v_avoir), 'doivent rester celles');
  update public.lignes_facture set prix_unitaire = 1 where facture_id = v_avoir and taux_tva = 20;
  perform public._t009_refuse(format($q$select public.finaliser_facture(%L)$q$, v_avoir), 'doivent rester celles');
  update public.lignes_facture set prix_unitaire = 1000 where facture_id = v_avoir and taux_tva = 20;

  perform public.finaliser_facture(v_avoir);
  select * into f from public.factures where id = v_avoir;
  if (f.total_ht_brut, f.remise_appliquee, f.total_ht, f.total_tva, f.total_ttc)
     is distinct from (-1500::numeric, 0::numeric, -1500::numeric, -250::numeric, -1750::numeric) then
    raise exception 'ÉCHEC : totaux de l''avoir total incorrects (%)', to_jsonb(f);
  end if;
  if f.tva_detail is distinct from '[{"taux": 20, "base": -1000, "tva": -200}, {"taux": 10, "base": -500, "tva": -50}]'::jsonb then
    raise exception 'ÉCHEC : TVA par taux de l''avoir total incorrecte (%)', f.tva_detail;
  end if;
  select count(*) into n from public.factures where id = 'a0090000-0000-4000-8000-000000000f03' and statut = 'annulee';
  if n <> 1 then raise exception 'ÉCHEC : avoir total sans annulation de la facture'; end if;

  -- Trop-perçu de 1 750 € : remboursement plafonné, permis sur une facture annulée
  select * into s from public.factures_soldes where facture_id = 'a0090000-0000-4000-8000-000000000f03';
  if s.trop_percu <> 1750 or s.reste_a_payer <> 0 then raise exception 'ÉCHEC : trop-perçu incorrect (%)', to_jsonb(s); end if;
  perform public._t009_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant, sens) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f03', 1750.01, 'remboursement')$q$,
    'trop-perçu de cette facture est de 1750');
  perform public._t009_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant, sens) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f03', 1, 'autre')$q$,
    'paiements_sens_check');
  insert into public.paiements (entreprise_id, facture_id, montant, sens) values
    ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f03', 750, 'remboursement')
    returning id into v_paiement;
  select * into s from public.factures_soldes where facture_id = 'a0090000-0000-4000-8000-000000000f03';
  if s.trop_percu <> 1000 or s.encaisse_net <> 1000 then raise exception 'ÉCHEC : trop-perçu après remboursement (%)', to_jsonb(s); end if;
  -- Le sens ne change pas ; l'encaissement remboursé ne se supprime pas
  perform public._t009_refuse(format($q$update public.paiements set sens = 'encaissement' where id = %L$q$, v_paiement), 'sens d''un paiement');
  perform public._t009_refuse(
    $q$delete from public.paiements where facture_id = 'a0090000-0000-4000-8000-000000000f03' and sens = 'encaissement'$q$,
    'supprimez d''abord le remboursement');
  perform public._t009_refuse(
    $q$update public.paiements set montant = 700 where facture_id = 'a0090000-0000-4000-8000-000000000f03' and sens = 'encaissement'$q$,
    'annulée ne peut pas recevoir');
  -- Plafond après le premier remboursement, puis solde
  perform public._t009_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant, sens) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f03', 1000.01, 'remboursement')$q$,
    'Remboursement refusé');
  insert into public.paiements (entreprise_id, facture_id, montant, sens) values
    ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f03', 1000, 'remboursement');
  select * into s from public.factures_soldes where facture_id = 'a0090000-0000-4000-8000-000000000f03';
  if s.trop_percu <> 0 or s.encaisse_net <> 0 or s.reste_a_payer <> 0 then raise exception 'ÉCHEC : solde final (%)', to_jsonb(s); end if;

  -- Paiement partiel puis avoir partiel : reste à payer réduit, pas de trop-perçu
  perform public._t009_facture('a0090000-0000-4000-8000-000000000f04', 'a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1');
  insert into public.paiements (entreprise_id, facture_id, montant) values
    ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f04', 1000);
  v_avoir := public.creer_avoir('a0090000-0000-4000-8000-000000000f04', 'Partiel', false, public._t009_lignes(100, 0));
  perform public.finaliser_facture(v_avoir);
  select * into s from public.factures_soldes where facture_id = 'a0090000-0000-4000-8000-000000000f04';
  if s.reste_a_payer <> 630 or s.trop_percu <> 0 or s.avoirs_ttc <> 120 then raise exception 'ÉCHEC : reste à payer (%)', to_jsonb(s); end if;

  -- Facture payée, avoir partiel, trop-perçu remboursé : l'encaissement ne peut plus baisser sous le remboursé
  perform public._t009_facture('a0090000-0000-4000-8000-000000000f09', 'a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1');
  insert into public.paiements (entreprise_id, facture_id, montant) values
    ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f09', 1750);
  perform public.finaliser_facture(public.creer_avoir('a0090000-0000-4000-8000-000000000f09', 'Geste', false, public._t009_lignes(100, 0)));
  select * into s from public.factures_soldes where facture_id = 'a0090000-0000-4000-8000-000000000f09';
  if s.trop_percu <> 120 or s.reste_a_payer <> 0 then raise exception 'ÉCHEC : trop-perçu après avoir partiel (%)', to_jsonb(s); end if;
  select count(*) into n from public.factures where id = 'a0090000-0000-4000-8000-000000000f09' and statut = 'annulee';
  if n <> 0 then raise exception 'ÉCHEC : un avoir partiel a annulé une facture payée'; end if;
  insert into public.paiements (entreprise_id, facture_id, montant, sens) values
    ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f09', 120, 'remboursement');
  perform public._t009_refuse(
    $q$update public.paiements set montant = 100 where facture_id = 'a0090000-0000-4000-8000-000000000f09' and sens = 'encaissement'$q$,
    'supprimez d''abord le remboursement');

  -- Remise globale sur deux taux : avoir total identique au centime
  insert into public.factures (id, entreprise_id, client_id, remise, date_echeance) values
    ('a0090000-0000-4000-8000-000000000f05', 'a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1', 10, public.date_du_jour_paris());
  insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire, taux_tva) values
    ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f05', 'A', 100, 20),
    ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f05', 'B', 50, 10);
  perform public.finaliser_facture('a0090000-0000-4000-8000-000000000f05');
  v_avoir := public.creer_avoir('a0090000-0000-4000-8000-000000000f05', 'Total avec remise', true);
  select count(*) into n from public.factures_totaux where facture_id = v_avoir and total_ttc = -163.34 and remise_appliquee = -10;
  if n <> 1 then raise exception 'ÉCHEC : brouillon d''avoir total avec remise'; end if;
  perform public.finaliser_facture(v_avoir);
  select * into f from public.factures where id = v_avoir;
  if f.total_ttc <> -163.34 or f.remise_appliquee <> -10
     or f.tva_detail is distinct from '[{"taux": 20, "base": -93.33, "tva": -18.67}, {"taux": 10, "base": -46.67, "tva": -4.67}]'::jsonb then
    raise exception 'ÉCHEC : avoir total avec remise incorrect (%)', to_jsonb(f);
  end if;

  -- Partiels successifs sur une base impaire : la TVA du dernier solde le reste au centime
  insert into public.factures (id, entreprise_id, client_id, date_echeance) values
    ('a0090000-0000-4000-8000-000000000f06', 'a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1', public.date_du_jour_paris());
  insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire, taux_tva) values
    ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f06', 'Base impaire', 33.33, 20);
  perform public.finaliser_facture('a0090000-0000-4000-8000-000000000f06'); -- 33,33 + 6,67 = 40,00
  v_avoir := public.creer_avoir('a0090000-0000-4000-8000-000000000f06', 'Moitié', false, public._t009_lignes(16.67, 0));
  perform public.finaliser_facture(v_avoir); -- 16,67 + 3,33
  v_avoir := public.creer_avoir('a0090000-0000-4000-8000-000000000f06', 'Solde', false, public._t009_lignes(16.66, 0));
  perform public.finaliser_facture(v_avoir); -- 16,66 + 3,34 (et non 3,33)
  select count(*) into n from public.factures where id = v_avoir and total_tva = -3.34 and total_ttc = -20;
  if n <> 1 then raise exception 'ÉCHEC : TVA du dernier avoir non ajustée'; end if;
  select count(*) into n from public.factures where id = 'a0090000-0000-4000-8000-000000000f06' and statut = 'annulee';
  if n <> 1 then raise exception 'ÉCHEC : facture non annulée par partiels au centime'; end if;

  -- Client supprimé : l'avoir reste possible, avec l'identité figée de la facture
  perform public._t009_facture('a0090000-0000-4000-8000-000000000f07', 'a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c3');
  update public.clients set deleted_at = now(), adresse = 'Adresse changée' where id = 'a0090000-0000-4000-8000-0000000000c3';
  v_avoir := public.creer_avoir('a0090000-0000-4000-8000-000000000f07', 'Client parti', true);
  perform public.finaliser_facture(v_avoir);
  select * into f from public.factures where id = v_avoir;
  if f.client_fige->>'adresse' is distinct from '3 rue Disparue' then
    raise exception 'ÉCHEC : identité de l''avoir non reprise de la facture (%)', f.client_fige;
  end if;

  -- Brouillon d'avoir laissé en plan : refusé une fois la facture annulée, supprimable, sans trou
  perform public._t009_facture('a0090000-0000-4000-8000-000000000f08', 'a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1');
  v_avoir := public.creer_avoir('a0090000-0000-4000-8000-000000000f08', 'Oublié', true);
  perform public.finaliser_facture(public.creer_avoir('a0090000-0000-4000-8000-000000000f08', 'Effectif', true));
  perform public._t009_refuse(format($q$select public.finaliser_facture(%L)$q$, v_avoir), 'déjà annulée');
  delete from public.factures where id = v_avoir;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : brouillon d''avoir non supprimable'; end if;
end $$;

-- 7. Lecture (A) : aucune écriture
select set_config('request.jwt.claims', '{"sub":"a0090000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  perform public._t009_refuse(
    $q$select public.creer_avoir('a0090000-0000-4000-8000-000000000f04', 'Motif', true)$q$,
    'Votre rôle ne permet pas de créer un avoir');
  perform public._t009_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant, sens) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-000000000f03', 1, 'remboursement')$q$,
    'row-level security');
end $$;

-- 8. Commercial (A) : remboursement dans la limite du trop-perçu ; ne supprime pas de paiement
select set_config('request.jwt.claims', '{"sub":"a0090000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare n int;
begin
  delete from public.paiements where facture_id = 'a0090000-0000-4000-8000-000000000f04';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC : le commercial a supprimé un paiement'; end if;
end $$;

-- 9. Admin de B : séries indépendantes de A ; aucune fuite
select set_config('request.jwt.claims', '{"sub":"a0090000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$
declare v_numero text; n int;
begin
  select count(*) into n from public.factures where entreprise_id <> 'a0090000-0000-4000-8000-0000000000e2';
  if n <> 0 then raise exception 'ÉCHEC : B voit % document(s) d''une autre entreprise', n; end if;
  select count(*) into n from public.factures_soldes where facture_id = 'a0090000-0000-4000-8000-000000000f03';
  if n <> 0 then raise exception 'ÉCHEC : factures_soldes laisse voir une facture de A'; end if;
  perform public._t009_refuse(
    $q$select public.creer_avoir('a0090000-0000-4000-8000-000000000f04', 'Motif', true)$q$,
    'introuvable');
  perform public._t009_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant, sens) values ('a0090000-0000-4000-8000-0000000000e2', 'a0090000-0000-4000-8000-000000000f03', 1, 'remboursement')$q$,
    'même entreprise');
  v_numero := public.finaliser_facture(public.creer_avoir('a0090000-0000-4000-8000-000000000f20', 'Avoir de B', true));
  if v_numero <> public._t009_numero('AV', 1) then raise exception 'ÉCHEC : numéro % dans B au lieu de AV 0001', v_numero; end if;
end $$;

-- 10. Retour en postgres : séries, trace, figement
reset role;
select set_config('request.jwt.claims', '{}', true);
do $$
declare n int; v_max int; v_distincts int;
begin
  -- Série AV de A : 1 à v_max, sans trou ni doublon, et série FAC non affectée
  select count(*), max(substring(numero from 9)::int), count(distinct numero) into n, v_max, v_distincts
    from public.factures
   where entreprise_id = 'a0090000-0000-4000-8000-0000000000e1' and numero like 'AV-%';
  if n <> v_max or n <> v_distincts then raise exception 'ÉCHEC : série AV de A incohérente (% numéros, maximum %)', n, v_max; end if;
  select count(*) into n from generate_series(1, v_max) g
   where not exists (select 1 from public.factures f
                     where f.entreprise_id = 'a0090000-0000-4000-8000-0000000000e1' and f.numero = public._t009_numero('AV', g));
  if n <> 0 then raise exception 'ÉCHEC : % trou(s) dans la série AV', n; end if;
  select count(*), max(substring(numero from 10)::int) into n, v_max from public.factures
   where entreprise_id = 'a0090000-0000-4000-8000-0000000000e1' and numero like 'FAC-%';
  if n <> v_max then raise exception 'ÉCHEC : série FAC affectée par les avoirs (% numéros, maximum %)', n, v_max; end if;
  select count(*) into n from public.factures where type = 'avoir' and numero like 'FAC-%';
  if n <> 0 then raise exception 'ÉCHEC : un avoir porte un numéro de facture'; end if;

  -- Les totaux figés d'un avoir survivent à un changement de lignes
  update public.lignes_facture l set prix_unitaire = 999999
    from public.factures f where f.id = l.facture_id and f.facture_origine_id = 'a0090000-0000-4000-8000-000000000f03';
  select count(*) into n from public.factures f join public.factures_totaux t on t.facture_id = f.id
   where f.facture_origine_id = 'a0090000-0000-4000-8000-000000000f03' and t.total_ttc = -1750;
  if n <> 1 then raise exception 'ÉCHEC : un avoir émis a changé de total'; end if;

  -- Finalisation et annulation tracées, avec leur auteur
  select count(*) into n from public.audit_events
   where table_name = 'factures' and record_id = 'a0090000-0000-4000-8000-000000000f03' and action = 'update'
     and new_data->>'statut' = 'annulee' and user_id = 'a0090000-0000-4000-8000-000000000005';
  if n <> 1 then raise exception 'ÉCHEC : annulation absente de audit_events'; end if;
  select count(*) into n from public.audit_events a join public.factures f on f.id = a.record_id
   where a.table_name = 'factures' and f.facture_origine_id = 'a0090000-0000-4000-8000-000000000f03'
     and a.new_data->>'statut' = 'finalisee' and a.new_data->>'type' = 'avoir' and a.user_id = 'a0090000-0000-4000-8000-000000000005';
  if n <> 1 then raise exception 'ÉCHEC : finalisation de l''avoir absente de audit_events'; end if;

  -- Référence : la facture d'origine d'un avoir n'est pas supprimable seule
  perform public._t009_refuse(
    $q$delete from public.factures where id = 'a0090000-0000-4000-8000-000000000f03'$q$,
    'facture_origine_id');
  -- Contraintes : un avoir sans motif ni référence n'existe pas, même en postgres
  perform public._t009_refuse(
    $q$insert into public.factures (entreprise_id, client_id, type) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1', 'avoir')$q$,
    'factures_avoir_coherent');
  perform public._t009_refuse(
    $q$insert into public.factures (entreprise_id, client_id, type) values ('a0090000-0000-4000-8000-0000000000e1', 'a0090000-0000-4000-8000-0000000000c1', 'autre')$q$,
    'factures_');
end $$;

do $$ begin raise notice 'Tests 009 : tous passés.'; end $$;

rollback;
