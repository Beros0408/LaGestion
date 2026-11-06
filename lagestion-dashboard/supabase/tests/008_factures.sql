-- 008_factures.sql — Lagestion
-- Vérifie la migration 008 (numérotation légale et verrouillage des factures) :
--   - brouillon sans numéro ; finalisation : contrôles, numéro continu, date du jour, totaux et identités figés ;
--   - aucun contournement : numéro, totaux, statut non modifiables par une écriture directe ;
--   - facture finalisée : ni modification, ni suppression, ni annulation, ni retour au brouillon ;
--   - paiements ; enregistrer_facture et enregistrer_devis atomiques ; conversion d'un devis ;
--   - isolation entre entreprises et droits par rôle.
-- La concurrence réelle (sessions simultanées) se vérifie à part : supabase/tests/008_concurrence.mjs.
-- À lancer après migrations/008_factures_legales.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0080…)
--   entreprise A …00e1 : lecture …0001 · commercial …0002 · comptable …0003 · manager …0004 · admin …0005
--   entreprise B …00e2 : admin …0006 ; client de B …00c2 ; brouillon de B …0f20
--   entreprises sans SIRET …00e3 et sans adresse …00e4 : admin …0005 ; séries anciennes …00e5 : admin …0005
--   clients de A : …00c1 (actif), …00c3 (supprimé ensuite)

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role)
select ('a0080000-0000-4000-8000-00000000000' || i)::uuid, 'test-008-' || i || '@lagestion.invalid', 'authenticated', 'authenticated'
from generate_series(1, 6) i;

insert into public.entreprises (id, nom, siret, adresse) values
  ('a0080000-0000-4000-8000-0000000000e1', 'Entreprise A (test 008)', '11111111100011', '1 rue de A, 75001 Paris'),
  ('a0080000-0000-4000-8000-0000000000e2', 'Entreprise B (test 008)', '22222222200022', '2 rue de B, 69001 Lyon'),
  ('a0080000-0000-4000-8000-0000000000e3', 'Sans SIRET (test 008)', '  ', '3 rue, 44000 Nantes'),
  ('a0080000-0000-4000-8000-0000000000e4', 'Sans adresse (test 008)', '44444444400044', null),
  ('a0080000-0000-4000-8000-0000000000e5', 'Séries anciennes (test 008)', '55555555500055', '5 rue, 33000 Bordeaux');

insert into public.memberships (entreprise_id, user_id, role) values
  ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000001', 'lecture'),
  ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000002', 'commercial'),
  ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000003', 'comptable'),
  ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000004', 'manager'),
  ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000005', 'admin'),
  ('a0080000-0000-4000-8000-0000000000e2', 'a0080000-0000-4000-8000-000000000006', 'admin'),
  ('a0080000-0000-4000-8000-0000000000e3', 'a0080000-0000-4000-8000-000000000005', 'admin'),
  ('a0080000-0000-4000-8000-0000000000e4', 'a0080000-0000-4000-8000-000000000005', 'admin'),
  ('a0080000-0000-4000-8000-0000000000e5', 'a0080000-0000-4000-8000-000000000005', 'admin');

insert into public.clients (id, entreprise_id, nom, type, siren, adresse, email) values
  ('a0080000-0000-4000-8000-0000000000c1', 'a0080000-0000-4000-8000-0000000000e1', 'Client A', 'entreprise', '552100554', '10 rue du Client, 75002 Paris', 'a@client.invalid'),
  ('a0080000-0000-4000-8000-0000000000c2', 'a0080000-0000-4000-8000-0000000000e2', 'Client B', 'entreprise', null, null, null),
  ('a0080000-0000-4000-8000-0000000000c3', 'a0080000-0000-4000-8000-0000000000e1', 'Client A supprimé ensuite', 'particulier', null, null, null),
  ('a0080000-0000-4000-8000-0000000000c4', 'a0080000-0000-4000-8000-0000000000e3', 'Client sans SIRET', 'entreprise', null, null, null),
  ('a0080000-0000-4000-8000-0000000000c5', 'a0080000-0000-4000-8000-0000000000e4', 'Client sans adresse', 'entreprise', null, null, null),
  ('a0080000-0000-4000-8000-0000000000c6', 'a0080000-0000-4000-8000-0000000000e5', 'Client séries', 'entreprise', null, null, null);

insert into public.produits (id, entreprise_id, type, reference, nom, prix_unitaire_ht) values
  ('a0080000-0000-4000-8000-0000000000b2', 'a0080000-0000-4000-8000-0000000000e2', 'produit', 'B-008', 'Article de B', 50);

-- Devis de A sans facture : une facture finalisée ne peut pas s'y rattacher
insert into public.devis (id, entreprise_id, client_id, numero) values
  ('a0080000-0000-4000-8000-000000000d09', 'a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1', 'DEV-DEMO-T9');

-- Numéros anciens de la série de l'année, dont un supprimé logiquement : la séquence reprend après le plus grand.
-- DEMO-NNNN et un format libre restent hors séquence.
insert into public.factures (entreprise_id, client_id, numero, statut, deleted_at) values
  ('a0080000-0000-4000-8000-0000000000e5', 'a0080000-0000-4000-8000-0000000000c6', 'FAC-' || to_char(public.date_du_jour_paris(), 'YYYY') || '-0040', 'payee', null),
  ('a0080000-0000-4000-8000-0000000000e5', 'a0080000-0000-4000-8000-0000000000c6', 'FAC-' || to_char(public.date_du_jour_paris(), 'YYYY') || '-0041', 'envoyee', now()),
  ('a0080000-0000-4000-8000-0000000000e5', 'a0080000-0000-4000-8000-0000000000c6', 'DEMO-9000', 'payee', null),
  ('a0080000-0000-4000-8000-0000000000e5', 'a0080000-0000-4000-8000-0000000000c6', 'ANCIEN-777', 'payee', null);

-- Helpers de test, retirés par le rollback final
create function public._t008_refuse(p_sql text, p_extrait text) returns void
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
grant execute on function public._t008_refuse(text, text) to authenticated;

-- Brouillon à deux taux, remise de 10 € : mêmes valeurs que le cas 9 de tests/cas_totaux.json.
create function public._t008_brouillon(p_id uuid, p_entreprise uuid, p_client uuid) returns void
language plpgsql as $$
begin
  insert into public.factures (id, entreprise_id, client_id, remise, date_emission, date_echeance, message_client, conditions_paiement, mode_paiement)
  values (p_id, p_entreprise, p_client, 10, public.date_du_jour_paris() - 20, public.date_du_jour_paris() + 30, 'Merci', '30 jours', 'virement');
  insert into public.lignes_facture (entreprise_id, facture_id, description, quantite, prix_unitaire, taux_tva) values
    (p_entreprise, p_id, 'Ligne à 20 %', 1, 100, 20),
    (p_entreprise, p_id, 'Ligne à 10 %', 1, 50, 10);
end $$;
grant execute on function public._t008_brouillon(uuid, uuid, uuid) to authenticated;

create function public._t008_numero(p_rang int) returns text
language sql stable as $$
  select 'FAC-' || to_char(public.date_du_jour_paris(), 'YYYY') || '-' || lpad(p_rang::text, 4, '0')
$$;
grant execute on function public._t008_numero(int) to authenticated;

set local role authenticated;

-- 2. Admin de B : un brouillon, que A ne doit jamais atteindre
select set_config('request.jwt.claims', '{"sub":"a0080000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select public._t008_brouillon('a0080000-0000-4000-8000-000000000f20', 'a0080000-0000-4000-8000-0000000000e2', 'a0080000-0000-4000-8000-0000000000c2');

-- 3. Lecture (A) : ne finalise rien, ne modifie rien
select set_config('request.jwt.claims', '{"sub":"a0080000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare n int;
begin
  perform public._t008_refuse(
    $q$insert into public.factures (entreprise_id, client_id) values ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1')$q$,
    'row-level security');
  select count(*) into n from public.factures where entreprise_id = 'a0080000-0000-4000-8000-0000000000e2';
  if n <> 0 then raise exception 'ÉCHEC : un membre de A voit % facture(s) de B', n; end if;
end $$;

-- 4. Commercial (A) : création d'un brouillon, aucune valeur imposée de l'extérieur
select set_config('request.jwt.claims', '{"sub":"a0080000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare f record; n int;
begin
  insert into public.factures (id, entreprise_id, client_id, numero, total_ttc, tva_detail, client_fige, emetteur_fige, finalisee_le)
  values ('a0080000-0000-4000-8000-000000000f01', 'a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1',
          'FAC-2099-9999', 1, '[]', '{}', '{}', now());
  select * into f from public.factures where id = 'a0080000-0000-4000-8000-000000000f01';
  if f.numero is not null or f.total_ttc is not null or f.tva_detail is not null or f.client_fige is not null
     or f.emetteur_fige is not null or f.finalisee_le is not null then
    raise exception 'ÉCHEC : un brouillon a conservé des valeurs fournies (%)', to_jsonb(f);
  end if;
  delete from public.lignes_facture where facture_id = 'a0080000-0000-4000-8000-000000000f01';

  -- Un marqueur DEMO- reste possible, hors séquence ; il est remplacé à la finalisation
  insert into public.factures (entreprise_id, client_id, numero) values
    ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1', 'DEMO-T1') returning numero into f.numero;
  if f.numero <> 'DEMO-T1' then raise exception 'ÉCHEC : marqueur DEMO- perdu'; end if;

  perform public._t008_refuse(
    $q$insert into public.factures (entreprise_id, client_id, statut) values ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1', 'payee')$q$,
    'commence toujours au statut brouillon');
  perform public._t008_refuse(
    $q$insert into public.factures (entreprise_id, client_id, statut) values ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1', 'finalisee')$q$,
    'commence toujours au statut brouillon');
  perform public._t008_refuse(
    $q$insert into public.factures (entreprise_id, client_id, statut) values ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1', 'en_attente')$q$,
    'commence toujours au statut brouillon');

  -- Un brouillon ne reçoit pas de numéro ni de valeurs figées par une écriture directe
  perform public._t008_refuse(
    $q$update public.factures set numero = 'FAC-2099-0001' where id = 'a0080000-0000-4000-8000-000000000f01'$q$,
    'attribué uniquement à la finalisation');
  update public.factures set total_ttc = 5, client_fige = '{}' where id = 'a0080000-0000-4000-8000-000000000f01';
  select count(*) into n from public.factures where id = 'a0080000-0000-4000-8000-000000000f01' and total_ttc is null and client_fige is null;
  if n <> 1 then raise exception 'ÉCHEC : valeurs figées écrites sur un brouillon'; end if;

  -- Statuts : un brouillon passe uniquement par la finalisation
  perform public._t008_refuse(
    $q$update public.factures set statut = 'envoyee' where id = 'a0080000-0000-4000-8000-000000000f01'$q$,
    'doit d''abord être finalisée');
  perform public._t008_refuse(
    $q$update public.factures set statut = 'payee' where id = 'a0080000-0000-4000-8000-000000000f01'$q$,
    'doit d''abord être finalisée');
  perform public._t008_refuse(
    $q$update public.factures set statut = 'annulee' where id = 'a0080000-0000-4000-8000-000000000f01'$q$,
    'supprimez-le');

  -- Paiement refusé sur un brouillon
  perform public._t008_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant) values ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000f01', 10)$q$,
    'avant d''enregistrer un paiement');

  -- Contrôles de finalisation : chacun refuse, aucun numéro consommé
  perform public._t008_refuse(
    $q$select public.finaliser_facture('a0080000-0000-4000-8000-000000000f01')$q$,
    'aucune ligne');
  insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire) values
    ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000f01', 'Ligne', 100);
  perform public._t008_refuse(
    $q$select public.finaliser_facture('a0080000-0000-4000-8000-000000000f01')$q$,
    'date d''échéance');
  update public.factures set date_echeance = public.date_du_jour_paris() - 1 where id = 'a0080000-0000-4000-8000-000000000f01';
  perform public._t008_refuse(
    $q$select public.finaliser_facture('a0080000-0000-4000-8000-000000000f01')$q$,
    'est dépassée');
  -- Une écriture directe subit les mêmes contrôles
  perform public._t008_refuse(
    $q$update public.factures set statut = 'finalisee' where id = 'a0080000-0000-4000-8000-000000000f01'$q$,
    'est dépassée');
  update public.factures set date_echeance = public.date_du_jour_paris() where id = 'a0080000-0000-4000-8000-000000000f01';

  select count(*) into n from public.factures
   where entreprise_id = 'a0080000-0000-4000-8000-0000000000e1' and numero like 'FAC-%';
  if n <> 0 then raise exception 'ÉCHEC : % numéro(s) attribué(s) par des finalisations refusées', n; end if;
end $$;

-- 5. Commercial (A) : finalisation réussie
do $$
declare f record; v_numero text; n int;
begin
  perform public._t008_brouillon('a0080000-0000-4000-8000-000000000f02', 'a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1');
  v_numero := public.finaliser_facture('a0080000-0000-4000-8000-000000000f02');
  if v_numero <> public._t008_numero(1) then raise exception 'ÉCHEC : premier numéro % au lieu de %', v_numero, public._t008_numero(1); end if;

  select * into f from public.factures where id = 'a0080000-0000-4000-8000-000000000f02';
  if f.statut <> 'finalisee' or f.numero <> v_numero then
    raise exception 'ÉCHEC : facture mal finalisée (%)', to_jsonb(f);
  end if;
  -- Date d'émission remplacée par la date du jour (heure de Paris)
  if f.date_emission <> public.date_du_jour_paris() then
    raise exception 'ÉCHEC : date d''émission % au lieu de la date du jour', f.date_emission;
  end if;
  -- Totaux figés : cas 9 de cas_totaux.json
  if (f.total_ht_brut, f.remise_appliquee, f.total_ht, f.total_tva, f.total_ttc) is distinct from (150::numeric, 10::numeric, 140::numeric, 23.34::numeric, 163.34::numeric) then
    raise exception 'ÉCHEC : totaux figés incorrects (%)', to_jsonb(f);
  end if;
  if f.tva_detail is distinct from '[{"taux": 20, "base": 93.33, "tva": 18.67}, {"taux": 10, "base": 46.67, "tva": 4.67}]'::jsonb then
    raise exception 'ÉCHEC : TVA par taux incorrecte (%)', f.tva_detail;
  end if;
  -- Identités figées
  if f.client_fige->>'nom' is distinct from 'Client A' or f.client_fige->>'siren' is distinct from '552100554'
     or f.client_fige->>'adresse' is distinct from '10 rue du Client, 75002 Paris' or f.client_fige->>'email' is distinct from 'a@client.invalid'
     or f.emetteur_fige->>'nom' is distinct from 'Entreprise A (test 008)' or f.emetteur_fige->>'siret' is distinct from '11111111100011'
     or f.emetteur_fige->>'adresse' is distinct from '1 rue de A, 75001 Paris' or f.finalisee_le is null then
    raise exception 'ÉCHEC : identités figées incorrectes (%)', to_jsonb(f);
  end if;

  -- La seconde finalisation échoue
  perform public._t008_refuse(
    $q$select public.finaliser_facture('a0080000-0000-4000-8000-000000000f02')$q$,
    'déjà finalisée');

  -- Numérotation continue, y compris par écriture directe : valeurs fournies ignorées
  perform public._t008_brouillon('a0080000-0000-4000-8000-000000000f03', 'a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1');
  update public.factures set statut = 'finalisee', numero = 'FAC-2099-0001', total_ttc = 1, date_emission = '2000-01-01', client_fige = '{}'
   where id = 'a0080000-0000-4000-8000-000000000f03' returning * into f;
  if f.numero <> public._t008_numero(2) or f.total_ttc <> 163.34 or f.date_emission <> public.date_du_jour_paris() or f.client_fige->>'nom' <> 'Client A' then
    raise exception 'ÉCHEC : une écriture directe a imposé ses valeurs (%)', to_jsonb(f);
  end if;

  -- La finalisation refusée de f01 n'a laissé aucun trou : elle prend le numéro suivant
  v_numero := public.finaliser_facture('a0080000-0000-4000-8000-000000000f01');
  if v_numero <> public._t008_numero(3) then raise exception 'ÉCHEC : numéro % au lieu de %', v_numero, public._t008_numero(3); end if;
  select count(*) into n from public.factures fa join public.factures_totaux t on t.facture_id = fa.id
   where fa.id = 'a0080000-0000-4000-8000-000000000f01' and fa.total_ttc = 120 and t.total_ttc = 120;
  if n <> 1 then raise exception 'ÉCHEC : facture f01 mal figée'; end if;

  -- Un marqueur DEMO- est remplacé par un vrai numéro
  insert into public.factures (id, entreprise_id, client_id, numero, date_echeance) values
    ('a0080000-0000-4000-8000-000000000f04', 'a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1', 'DEMO-T2', public.date_du_jour_paris());
  insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire) values
    ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000f04', 'Ligne', 10);
  v_numero := public.finaliser_facture('a0080000-0000-4000-8000-000000000f04');
  if v_numero <> public._t008_numero(4) then raise exception 'ÉCHEC : brouillon DEMO- finalisé en %', v_numero; end if;
end $$;

-- 6. Commercial (A) : facture finalisée, chaque champ refusé ; seuls le statut et les notes internes évoluent
do $$
declare
  v_champ text; n int;
begin
  foreach v_champ in array array[
    $q$client_id = 'a0080000-0000-4000-8000-0000000000c3'$q$,
    $q$date_emission = current_date - 1$q$,
    $q$date_echeance = current_date + 90$q$,
    $q$date_echeance = null$q$,
    $q$remise = 1$q$,
    $q$conditions_paiement = 'autre'$q$,
    $q$mode_paiement = 'carte'$q$,
    $q$message_client = 'autre'$q$,
    $q$total_ht_brut = 1$q$,
    $q$remise_appliquee = 1$q$,
    $q$total_ht = 1$q$,
    $q$total_tva = 1$q$,
    $q$total_ttc = 1$q$,
    $q$total_ttc = null$q$,
    $q$tva_detail = '[]'$q$,
    $q$client_fige = '{}'$q$,
    $q$emetteur_fige = '{}'$q$,
    $q$finalisee_le = now() + interval '1 day'$q$,
    $q$devis_id = 'a0080000-0000-4000-8000-000000000d09'$q$
  ] loop
    perform public._t008_refuse(
      format($q$update public.factures set %s where id = 'a0080000-0000-4000-8000-000000000f02'$q$, v_champ),
      'ne peut plus être modifiée');
  end loop;
  perform public._t008_refuse(
    $q$update public.factures set numero = 'FAC-2099-0001' where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'numéro d''une facture émise');
  perform public._t008_refuse(
    $q$update public.factures set numero = null where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'numéro d''une facture émise');

  -- Lignes
  perform public._t008_refuse(
    $q$insert into public.lignes_facture (entreprise_id, facture_id, description) values ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000f02', 'Ajout')$q$,
    'ne peuvent plus être modifiées');
  perform public._t008_refuse(
    $q$update public.lignes_facture set prix_unitaire = 1 where facture_id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'ne peuvent plus être modifiées');
  perform public._t008_refuse(
    $q$delete from public.lignes_facture where facture_id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'ne peuvent plus être modifiées');
  -- Déplacement d'une ligne depuis un brouillon vers une facture finalisée
  perform public._t008_brouillon('a0080000-0000-4000-8000-000000000f05', 'a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1');
  perform public._t008_refuse(
    $q$update public.lignes_facture set facture_id = 'a0080000-0000-4000-8000-000000000f02' where facture_id = 'a0080000-0000-4000-8000-000000000f05'$q$,
    'ne peuvent plus être modifiées');

  -- enregistrer_facture
  perform public._t008_refuse(
    $q$select public.enregistrer_facture('a0080000-0000-4000-8000-000000000f02', '{"remise": 1}', null)$q$,
    'ne peut plus être modifiée');

  -- Notes internes : non imprimées, modifiables
  update public.factures set notes_internes = 'Vu avec le client' where id = 'a0080000-0000-4000-8000-000000000f02';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : notes internes non modifiables sur une facture finalisée'; end if;

  -- Statuts
  perform public._t008_refuse(
    $q$update public.factures set statut = 'annulee' where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'passera par un avoir');
  perform public._t008_refuse(
    $q$update public.factures set statut = 'brouillon' where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'repasser en brouillon');
  perform public._t008_refuse(
    $q$update public.factures set statut = 'en_attente' where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'factures_statut_check');
  update public.factures set statut = 'envoyee' where id = 'a0080000-0000-4000-8000-000000000f02';
  perform public._t008_refuse(
    $q$update public.factures set statut = 'finalisee' where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'n''est pas autorisé');
  update public.factures set statut = 'en_retard' where id = 'a0080000-0000-4000-8000-000000000f02';
  perform public._t008_refuse(
    $q$update public.factures set statut = 'annulee' where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'passera par un avoir');
  perform public._t008_refuse(
    $q$update public.factures set statut = 'brouillon' where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'repasser en brouillon');

  -- Paiements sur une facture émise
  insert into public.paiements (entreprise_id, facture_id, montant, mode) values
    ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000f02', 50, 'virement');
  update public.factures set statut = 'partiellement_payee' where id = 'a0080000-0000-4000-8000-000000000f02';
  insert into public.paiements (entreprise_id, facture_id, montant) values
    ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000f02', 113.34);
  update public.factures set statut = 'payee' where id = 'a0080000-0000-4000-8000-000000000f02';
  select count(*) into n from public.factures fa join public.factures_totaux t on t.facture_id = fa.id
   where fa.id = 'a0080000-0000-4000-8000-000000000f02' and fa.statut = 'payee' and t.total_ttc = 163.34;
  if n <> 1 then raise exception 'ÉCHEC : le statut payée a modifié les totaux'; end if;
  perform public._t008_refuse(
    $q$update public.factures set deleted_at = now() where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'ne peut pas être supprimée');
end $$;

-- 7. Manager et admin (A) : suppression refusée après finalisation, permise sur un brouillon
select set_config('request.jwt.claims', '{"sub":"a0080000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare n int; v_numero text;
begin
  perform public._t008_refuse(
    $q$update public.factures set deleted_at = now() where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'ne peut pas être supprimée');
  perform public._t008_refuse(
    $q$delete from public.factures where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'ne peut pas être supprimée');

  -- Brouillon supprimé logiquement : non finalisable, aucun numéro consommé
  update public.factures set deleted_at = now() where id = 'a0080000-0000-4000-8000-000000000f05';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : le manager n''a pas pu supprimer un brouillon'; end if;
  perform public._t008_refuse(
    $q$select public.finaliser_facture('a0080000-0000-4000-8000-000000000f05')$q$,
    'introuvable');
  perform public._t008_refuse(
    $q$update public.factures set statut = 'finalisee' where id = 'a0080000-0000-4000-8000-000000000f05'$q$,
    'supprimée ne peut pas');
end $$;

select set_config('request.jwt.claims', '{"sub":"a0080000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
declare n int; v_numero text;
begin
  perform public._t008_refuse(
    $q$delete from public.factures where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'ne peut pas être supprimée');
  perform public._t008_refuse(
    $q$update public.factures set deleted_at = now() where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'ne peut pas être supprimée');
  -- Suppression définitive d'un brouillon, lignes comprises
  perform public._t008_brouillon('a0080000-0000-4000-8000-000000000f06', 'a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1');
  delete from public.factures where id = 'a0080000-0000-4000-8000-000000000f06';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : l''admin n''a pas pu supprimer définitivement un brouillon'; end if;
  select count(*) into n from public.lignes_facture where facture_id = 'a0080000-0000-4000-8000-000000000f06';
  if n <> 0 then raise exception 'ÉCHEC : lignes conservées après suppression du brouillon'; end if;

  -- Ces suppressions ne laissent aucun trou
  perform public._t008_brouillon('a0080000-0000-4000-8000-000000000f07', 'a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1');
  v_numero := public.finaliser_facture('a0080000-0000-4000-8000-000000000f07');
  if v_numero <> public._t008_numero(5) then raise exception 'ÉCHEC : numéro % après suppressions de brouillons', v_numero; end if;

  -- Client supprimé : finalisation refusée sur un brouillon ; identité conservée sur une facture finalisée
  perform public._t008_brouillon('a0080000-0000-4000-8000-000000000f08', 'a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c3');
  perform public._t008_brouillon('a0080000-0000-4000-8000-000000000f09', 'a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c3');
  v_numero := public.finaliser_facture('a0080000-0000-4000-8000-000000000f09');
  update public.clients set deleted_at = now() where id = 'a0080000-0000-4000-8000-0000000000c3';
  perform public._t008_refuse(
    $q$select public.finaliser_facture('a0080000-0000-4000-8000-000000000f08')$q$,
    'client de cette facture a été supprimé');
  select count(*) into n from public.factures where id = 'a0080000-0000-4000-8000-000000000f09' and client_fige->>'nom' = 'Client A supprimé ensuite';
  if n <> 1 then raise exception 'ÉCHEC : identité du client supprimé perdue'; end if;

  -- Modifier la fiche client et l'entreprise ne change pas une facture finalisée
  update public.clients set nom = 'Client A renommé', adresse = 'Nouvelle adresse' where id = 'a0080000-0000-4000-8000-0000000000c1';
  update public.entreprises set nom = 'A renommée', siret = '99999999900099', adresse = 'Autre adresse' where id = 'a0080000-0000-4000-8000-0000000000e1';
  select count(*) into n from public.factures where id = 'a0080000-0000-4000-8000-000000000f02'
    and client_fige->>'nom' = 'Client A' and client_fige->>'adresse' = '10 rue du Client, 75002 Paris'
    and emetteur_fige->>'nom' = 'Entreprise A (test 008)' and emetteur_fige->>'siret' = '11111111100011'
    and emetteur_fige->>'adresse' = '1 rue de A, 75001 Paris';
  if n <> 1 then raise exception 'ÉCHEC : les identités figées ont suivi la fiche'; end if;

  -- SIRET ou adresse de l'entreprise manquants : finalisation refusée
  perform public._t008_brouillon('a0080000-0000-4000-8000-000000000f31', 'a0080000-0000-4000-8000-0000000000e3', 'a0080000-0000-4000-8000-0000000000c4');
  perform public._t008_refuse(
    $q$select public.finaliser_facture('a0080000-0000-4000-8000-000000000f31')$q$,
    'SIRET');
  perform public._t008_brouillon('a0080000-0000-4000-8000-000000000f41', 'a0080000-0000-4000-8000-0000000000e4', 'a0080000-0000-4000-8000-0000000000c5');
  perform public._t008_refuse(
    $q$select public.finaliser_facture('a0080000-0000-4000-8000-000000000f41')$q$,
    'adresse de l''entreprise');

  -- Séries anciennes : reprise après le plus grand numéro, supprimé compris ; DEMO- et format libre ignorés
  perform public._t008_brouillon('a0080000-0000-4000-8000-000000000f51', 'a0080000-0000-4000-8000-0000000000e5', 'a0080000-0000-4000-8000-0000000000c6');
  v_numero := public.finaliser_facture('a0080000-0000-4000-8000-000000000f51');
  if v_numero <> public._t008_numero(42) then raise exception 'ÉCHEC : reprise de série en %', v_numero; end if;
end $$;

-- 8. Commercial (A) : enregistrer_facture, transaction complète
select set_config('request.jwt.claims', '{"sub":"a0080000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare f record; n int;
begin
  perform public._t008_brouillon('a0080000-0000-4000-8000-000000000f10', 'a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1');

  perform public.enregistrer_facture('a0080000-0000-4000-8000-000000000f10',
    jsonb_build_object('remise', 5, 'message_client', 'Nouveau', 'date_echeance', null),
    '[{"description":"Unique","reference":null,"unite":"h","quantite":2,"prix_unitaire":30,"taux_tva":20,"remise":0,"position":0,"produit_id":null,
       "entreprise_id":"a0080000-0000-4000-8000-0000000000e2","facture_id":"a0080000-0000-4000-8000-000000000f20"}]');
  select * into f from public.factures where id = 'a0080000-0000-4000-8000-000000000f10';
  if f.remise <> 5 or f.message_client <> 'Nouveau' or f.date_echeance is not null or f.conditions_paiement <> '30 jours' then
    raise exception 'ÉCHEC : en-tête mal enregistré (%)', to_jsonb(f);
  end if;
  -- entreprise_id et facture_id transmis sont ignorés
  select count(*) into n from public.lignes_facture
   where facture_id = 'a0080000-0000-4000-8000-000000000f10' and entreprise_id = 'a0080000-0000-4000-8000-0000000000e1'
     and description = 'Unique' and unite = 'h' and quantite = 2 and prix_unitaire = 30;
  if n <> 1 then raise exception 'ÉCHEC : ligne mal enregistrée'; end if;
  select count(*) into n from public.lignes_facture where facture_id = 'a0080000-0000-4000-8000-000000000f10';
  if n <> 1 then raise exception 'ÉCHEC : % ligne(s) après remplacement au lieu de 1', n; end if;

  -- Échec sur une ligne (quantité nulle) : ni l'en-tête ni les lignes ne changent
  perform public._t008_refuse(
    $q$select public.enregistrer_facture('a0080000-0000-4000-8000-000000000f10', '{"remise": 9}',
       '[{"description":"A","quantite":1,"prix_unitaire":1,"taux_tva":20,"remise":0,"position":0},{"description":"B","quantite":0,"prix_unitaire":1,"taux_tva":20,"remise":0,"position":1}]')$q$,
    'check');
  -- Client d'une autre entreprise : refusé
  perform public._t008_refuse(
    $q$select public.enregistrer_facture('a0080000-0000-4000-8000-000000000f10', '{"client_id": "a0080000-0000-4000-8000-0000000000c2"}')$q$,
    'même entreprise');
  -- Article d'une autre entreprise : même résultat
  perform public._t008_refuse(
    $q$select public.enregistrer_facture('a0080000-0000-4000-8000-000000000f10', '{"remise": 9}',
       '[{"description":"A","quantite":1,"prix_unitaire":1,"taux_tva":20,"remise":0,"position":0,"produit_id":"a0080000-0000-4000-8000-0000000000b2"}]')$q$,
    'même entreprise');
  select count(*) into n from public.factures where id = 'a0080000-0000-4000-8000-000000000f10' and remise = 5;
  if n <> 1 then raise exception 'ÉCHEC : en-tête modifié malgré l''échec des lignes'; end if;
  select count(*) into n from public.lignes_facture where facture_id = 'a0080000-0000-4000-8000-000000000f10' and description = 'Unique';
  if n <> 1 then raise exception 'ÉCHEC : lignes perdues après un échec'; end if;

  -- p_lignes absent : lignes inchangées ; tableau vide : lignes retirées
  perform public.enregistrer_facture('a0080000-0000-4000-8000-000000000f10', '{"remise": 6}');
  select count(*) into n from public.lignes_facture where facture_id = 'a0080000-0000-4000-8000-000000000f10';
  if n <> 1 then raise exception 'ÉCHEC : lignes modifiées sans demande'; end if;
  perform public.enregistrer_facture('a0080000-0000-4000-8000-000000000f10', '{}', '[]');
  select count(*) into n from public.lignes_facture where facture_id = 'a0080000-0000-4000-8000-000000000f10';
  if n <> 0 then raise exception 'ÉCHEC : lignes conservées après tableau vide'; end if;

  -- Un autre rôle ou une autre entreprise
  perform public._t008_refuse(
    $q$select public.enregistrer_facture('a0080000-0000-4000-8000-000000000f20', '{"remise": 9}', '[]')$q$,
    'introuvable');
  perform public._t008_refuse(
    $q$select public.finaliser_facture('a0080000-0000-4000-8000-000000000f20')$q$,
    'introuvable');
  update public.factures set statut = 'finalisee' where id = 'a0080000-0000-4000-8000-000000000f20';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC : A a modifié une facture de B'; end if;
end $$;

-- 9. Lecture (A) : refus par rôle
select set_config('request.jwt.claims', '{"sub":"a0080000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare n int;
begin
  perform public._t008_refuse(
    $q$select public.finaliser_facture('a0080000-0000-4000-8000-000000000f08')$q$,
    'Votre rôle ne permet pas de finaliser');
  perform public._t008_refuse(
    $q$select public.enregistrer_facture('a0080000-0000-4000-8000-000000000f10', '{"remise": 9}', '[]')$q$,
    'Votre rôle ne permet pas de modifier');
  update public.factures set statut = 'finalisee' where id = 'a0080000-0000-4000-8000-000000000f10';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC : le rôle lecture a modifié une facture'; end if;
  perform public._t008_refuse(
    $q$insert into public.lignes_facture (entreprise_id, facture_id, description) values ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000f10', 'X')$q$,
    'row-level security');
  perform public._t008_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant) values ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000f02', 1)$q$,
    'row-level security');
end $$;

-- 10. Comptable (A) : devis et conversion jusqu'à la facture finalisée
select set_config('request.jwt.claims', '{"sub":"a0080000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare v_facture uuid; f record; n int; v_numero text;
begin
  insert into public.devis (id, entreprise_id, client_id, remise) values
    ('a0080000-0000-4000-8000-000000000d01', 'a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-0000000000c1', 3);
  -- enregistrer_devis : en-tête et lignes ensemble
  perform public.enregistrer_devis('a0080000-0000-4000-8000-000000000d01',
    jsonb_build_object('remise', 10, 'message_client', 'Devis'),
    '[{"description":"L20","quantite":1,"prix_unitaire":100,"taux_tva":20,"remise":0,"position":0},
      {"description":"L10","quantite":1,"prix_unitaire":50,"taux_tva":10,"remise":0,"position":1}]');
  perform public._t008_refuse(
    $q$select public.enregistrer_devis('a0080000-0000-4000-8000-000000000d01', '{"remise": 99}',
       '[{"description":"X","quantite":0,"prix_unitaire":1,"taux_tva":20,"remise":0,"position":0}]')$q$,
    'check');
  select count(*) into n from public.devis d where d.id = 'a0080000-0000-4000-8000-000000000d01' and d.remise = 10;
  if n <> 1 then raise exception 'ÉCHEC : en-tête de devis modifié malgré l''échec des lignes'; end if;
  select count(*) into n from public.lignes_devis where devis_id = 'a0080000-0000-4000-8000-000000000d01';
  if n <> 2 then raise exception 'ÉCHEC : lignes de devis perdues après un échec'; end if;

  -- Devis accepté : refus transmis par les règles de la migration 007
  update public.devis set statut = 'envoye' where id = 'a0080000-0000-4000-8000-000000000d01';
  update public.devis set statut = 'accepte' where id = 'a0080000-0000-4000-8000-000000000d01';
  perform public._t008_refuse(
    $q$select public.enregistrer_devis('a0080000-0000-4000-8000-000000000d01', '{"remise": 99}')$q$,
    'accepté ne peut plus');
  perform public._t008_refuse(
    $q$select public.enregistrer_devis('a0080000-0000-4000-8000-000000000d01', '{}', '[]')$q$,
    'accepté');

  v_facture := public.convertir_devis('a0080000-0000-4000-8000-000000000d01');
  select * into f from public.factures where id = v_facture;
  if f.numero is not null or f.statut <> 'brouillon' or f.date_echeance <> public.date_du_jour_paris() + 30 then
    raise exception 'ÉCHEC : facture issue du devis incorrecte (%)', to_jsonb(f);
  end if;

  v_numero := public.finaliser_facture(v_facture);
  select count(*) into n
    from public.factures fa join public.devis_totaux dt on dt.devis_id = 'a0080000-0000-4000-8000-000000000d01'
   where fa.id = v_facture and fa.numero = v_numero and fa.statut = 'finalisee'
     and fa.total_ttc = dt.total_ttc and fa.total_ht = dt.total_ht and fa.total_tva = dt.total_tva;
  if n <> 1 then raise exception 'ÉCHEC : totaux figés différents du devis d''origine'; end if;
  select count(*) into n from public.devis where id = 'a0080000-0000-4000-8000-000000000d01' and statut = 'converti';
  if n <> 1 then raise exception 'ÉCHEC : le devis a quitté le statut converti'; end if;

  -- Devis converti : toujours verrouillé
  perform public._t008_refuse(
    $q$select public.enregistrer_devis('a0080000-0000-4000-8000-000000000d01', '{"remise": 99}')$q$,
    'converti');
end $$;

-- 11. Admin de B : numérotation indépendante de A ; aucune fuite de A
select set_config('request.jwt.claims', '{"sub":"a0080000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$
declare v_numero text; n int;
begin
  select count(*) into n from public.factures where entreprise_id <> 'a0080000-0000-4000-8000-0000000000e2';
  if n <> 0 then raise exception 'ÉCHEC : B voit % facture(s) d''une autre entreprise', n; end if;
  select count(*) into n from public.factures_totaux where facture_id = 'a0080000-0000-4000-8000-000000000f02';
  if n <> 0 then raise exception 'ÉCHEC : factures_totaux laisse voir une facture de A'; end if;
  perform public._t008_refuse(
    $q$select public.finaliser_facture('a0080000-0000-4000-8000-000000000f10')$q$,
    'introuvable');
  perform public._t008_refuse(
    $q$select public.enregistrer_devis('a0080000-0000-4000-8000-000000000d01', '{"remise": 99}')$q$,
    'introuvable');
  v_numero := public.finaliser_facture('a0080000-0000-4000-8000-000000000f20');
  if v_numero <> public._t008_numero(1) then raise exception 'ÉCHEC : numéro % dans B au lieu de %', v_numero, public._t008_numero(1); end if;
end $$;

-- 12. Retour en postgres : figement, séquence, contraintes, audit
reset role;
select set_config('request.jwt.claims', '{}', true);
do $$
declare n int; v_distincts int; v_max int;
begin
  -- Les totaux figés survivent à un changement des lignes ou de la règle : vue et valeurs inchangées
  update public.lignes_facture set prix_unitaire = 999999 where facture_id = 'a0080000-0000-4000-8000-000000000f02';
  select count(*) into n from public.factures fa join public.factures_totaux t on t.facture_id = fa.id
   where fa.id = 'a0080000-0000-4000-8000-000000000f02' and fa.total_ttc = 163.34 and t.total_ttc = 163.34
     and t.total_ht = 140 and t.total_tva = 23.34 and t.total_ht_brut = 150 and t.remise_appliquee = 10;
  if n <> 1 then raise exception 'ÉCHEC : une facture émise a changé de total'; end if;

  -- Série de A : 1 à v_max, sans trou ni doublon
  select count(*), max(substring(numero from 10)::int), count(distinct numero) into n, v_max, v_distincts
    from public.factures
   where entreprise_id = 'a0080000-0000-4000-8000-0000000000e1' and numero like 'FAC-%';
  if n <> v_max or n <> v_distincts then raise exception 'ÉCHEC : série de A incohérente (% numéros, maximum %)', n, v_max; end if;
  if exists (
    select 1 from generate_series(1, v_max) g
    where not exists (select 1 from public.factures f
                      where f.entreprise_id = 'a0080000-0000-4000-8000-0000000000e1' and f.numero = public._t008_numero(g))
  ) then
    raise exception 'ÉCHEC : trou dans la série de A';
  end if;

  -- Le numéro d'une facture émise est intouchable même en postgres
  perform public._t008_refuse(
    $q$update public.factures set numero = 'FAC-2099-0001' where id = 'a0080000-0000-4000-8000-000000000f02'$q$,
    'numéro d''une facture émise');
  -- Unicité, supprimées comprises ; numéro obligatoire hors brouillon
  perform public._t008_refuse(
    $q$insert into public.factures (entreprise_id, client_id, numero) select 'a0080000-0000-4000-8000-0000000000e5', 'a0080000-0000-4000-8000-0000000000c6', public._t008_numero(41)$q$,
    'uniq_factures_numero');
  perform public._t008_refuse(
    $q$insert into public.factures (entreprise_id, client_id, statut) values ('a0080000-0000-4000-8000-0000000000e5', 'a0080000-0000-4000-8000-0000000000c6', 'payee')$q$,
    'factures_emise_avec_numero');

  -- Facture annulée (état ancien, seul le rôle postgres peut encore le poser)
  update public.factures set statut = 'annulee' where id = 'a0080000-0000-4000-8000-000000000f07';

  -- Devis d'origine supprimé en postgres : le lien d'une facture émise passe à null sans erreur
  delete from public.devis where id = 'a0080000-0000-4000-8000-000000000d01';
  select count(*) into n from public.factures f
   where f.entreprise_id = 'a0080000-0000-4000-8000-0000000000e1' and f.statut = 'finalisee' and f.numero = public._t008_numero(7) and f.devis_id is null;
  if n <> 1 then raise exception 'ÉCHEC : lien vers le devis supprimé mal géré'; end if;

  -- La finalisation est tracée, avec son auteur
  select count(*) into n from public.audit_events
   where table_name = 'factures' and record_id = 'a0080000-0000-4000-8000-000000000f02' and action = 'update'
     and old_data->>'statut' = 'brouillon' and new_data->>'statut' = 'finalisee'
     and new_data->>'numero' = public._t008_numero(1) and user_id = 'a0080000-0000-4000-8000-000000000002';
  if n <> 1 then raise exception 'ÉCHEC : finalisation absente de audit_events'; end if;

  -- Une finalisation en postgres (SQL Editor) subit les mêmes contrôles
  perform public._t008_refuse(
    $q$update public.factures set statut = 'finalisee', date_echeance = null where id = 'a0080000-0000-4000-8000-000000000f10'$q$,
    'aucune ligne');
end $$;

select set_config('request.jwt.claims', '{"sub":"a0080000-0000-4000-8000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  perform public._t008_refuse(
    $q$insert into public.paiements (entreprise_id, facture_id, montant) values ('a0080000-0000-4000-8000-0000000000e1', 'a0080000-0000-4000-8000-000000000f07', 1)$q$,
    'annulée ne peut pas recevoir');
  perform public._t008_refuse(
    $q$update public.factures set statut = 'envoyee' where id = 'a0080000-0000-4000-8000-000000000f07'$q$,
    'n''est pas autorisé');
  perform public._t008_refuse(
    $q$delete from public.factures where id = 'a0080000-0000-4000-8000-000000000f07'$q$,
    'ne peut pas être supprimée');
end $$;

reset role;
do $$ begin raise notice 'Tests 008 : tous passés.'; end $$;

rollback;
