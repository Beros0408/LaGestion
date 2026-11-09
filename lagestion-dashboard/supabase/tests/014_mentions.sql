-- 014_mentions.sql — LaGestion
-- Vérifie la migration 014 (mentions légales des documents) :
--   - finalisation refusée tant qu'une mention obligatoire de l'émetteur manque (liste des manques dans le message) ;
--   - capital exigé pour une société, lieu exigé pour RCS / RM, TVA exigée hors franchise ;
--   - franchise en base : lignes à 0 % uniquement ;
--   - emetteur_fige complet (mentions = 2, logo compris), champs vides omis ;
--   - date de prestation et catégorie posées à la finalisation si vides, conservées si saisies ; avoir sans date de prestation ;
--   - champs de l'opération enregistrés au brouillon, verrouillés après l'émission ;
--   - mentions_manquantes lisible par un membre, muette pour une autre entreprise.
-- À lancer après migrations/014_mentions.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0140…)
--   entreprise A …00e1 : commercial …0002 · admin …0005 ; entreprise B …00e2 : admin …0006
--   client A …00c1 (entreprise, sans SIREN) ; factures A …0f01 à …0f03

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role)
select ('a0140000-0000-4000-8000-00000000000' || i)::uuid, 'test-014-' || i || '@lagestion.invalid', 'authenticated', 'authenticated'
from generate_series(1, 6) i;

insert into public.entreprises (id, nom, siret, adresse, logo_url) values
  ('a0140000-0000-4000-8000-0000000000e1', 'Entreprise A (test 014)', '12121212000012', '1 rue de A, 75001 Paris',
   'a0140000-0000-4000-8000-0000000000e1/logo-1.png'),
  ('a0140000-0000-4000-8000-0000000000e2', 'Entreprise B (test 014)', '22222222200022', '2 rue de B, 69001 Lyon', null);

insert into public.memberships (entreprise_id, user_id, role) values
  ('a0140000-0000-4000-8000-0000000000e1', 'a0140000-0000-4000-8000-000000000002', 'commercial'),
  ('a0140000-0000-4000-8000-0000000000e1', 'a0140000-0000-4000-8000-000000000005', 'admin'),
  ('a0140000-0000-4000-8000-0000000000e2', 'a0140000-0000-4000-8000-000000000006', 'admin');

insert into public.clients (id, entreprise_id, nom, type, adresse) values
  ('a0140000-0000-4000-8000-0000000000c1', 'a0140000-0000-4000-8000-0000000000e1', 'Client A', 'entreprise', '10 rue du Client, 75002 Paris');

create function public._t014_refuse(p_sql text, p_extrait text) returns void
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
grant execute on function public._t014_refuse(text, text) to authenticated;

-- Brouillon de facture : 1 000 € HT à 20 %
create function public._t014_brouillon(p_id uuid) returns void
language plpgsql as $$
begin
  insert into public.factures (id, entreprise_id, client_id, date_echeance)
  values (p_id, 'a0140000-0000-4000-8000-0000000000e1', 'a0140000-0000-4000-8000-0000000000c1', public.date_du_jour_paris() + 30);
  insert into public.lignes_facture (entreprise_id, facture_id, description, quantite, prix_unitaire, taux_tva, position)
  values ('a0140000-0000-4000-8000-0000000000e1', p_id, 'Travaux', 1, 1000, 20, 0);
end $$;
grant execute on function public._t014_brouillon(uuid) to authenticated;

-- Paramètres posés comme le ferait l'admin (rôle postgres, sans RLS)
create function public._t014_entreprise(p_patch text) returns void
language plpgsql security definer as $$
begin
  execute 'update public.entreprises set ' || p_patch || ' where id = ''a0140000-0000-4000-8000-0000000000e1''';
end $$;
grant execute on function public._t014_entreprise(text) to authenticated;

set local role authenticated;

-- 2. Commercial A : mentions absentes, puis incomplètes
select set_config('request.jwt.claims', '{"sub":"a0140000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare m text[];
begin
  m := public.mentions_manquantes('a0140000-0000-4000-8000-0000000000e1');
  if m is distinct from array['forme juridique', 'immatriculation (RCS ou RM et son lieu)', 'n° de TVA intracommunautaire (ou franchise de TVA)'] then
    raise exception 'ÉCHEC : mentions manquantes inattendues (%)', m;
  end if;
  perform public._t014_brouillon('a0140000-0000-4000-8000-000000000f01');
  perform public._t014_refuse($q$select public.finaliser_facture('a0140000-0000-4000-8000-000000000f01')$q$,
    'Mentions obligatoires manquantes : forme juridique, immatriculation (RCS ou RM et son lieu), n° de TVA intracommunautaire (ou franchise de TVA)');
  if (select numero from public.factures where id = 'a0140000-0000-4000-8000-000000000f01') is not null then
    raise exception 'ÉCHEC : un numéro a été attribué malgré le refus';
  end if;

  -- Société sans capital, RCS sans lieu
  perform public._t014_entreprise($q$forme_juridique = 'SAS', immatriculation_type = 'rcs', tva_intra = 'FR56121212120'$q$);
  perform public._t014_refuse($q$select public.finaliser_facture('a0140000-0000-4000-8000-000000000f01')$q$,
    'capital social, immatriculation (RCS ou RM et son lieu)');
  -- EI : pas de capital ; dispense : pas de lieu
  perform public._t014_entreprise($q$forme_juridique = 'EI', immatriculation_type = 'dispense'$q$);
  if cardinality(public.mentions_manquantes('a0140000-0000-4000-8000-0000000000e1')) <> 0 then
    raise exception 'ÉCHEC : EI dispensée d''immatriculation encore incomplète';
  end if;
  perform public._t014_entreprise($q$forme_juridique = 'SAS', immatriculation_type = 'rcs', immatriculation_lieu = 'Paris'$q$);
  perform public._t014_refuse($q$select public.finaliser_facture('a0140000-0000-4000-8000-000000000f01')$q$, 'capital social');

  -- Franchise : la TVA n'est plus exigée, mais aucune ligne ne peut porter de TVA
  perform public._t014_entreprise($q$capital_social = 10000, tva_intra = null, franchise_tva = true$q$);
  perform public._t014_refuse($q$select public.finaliser_facture('a0140000-0000-4000-8000-000000000f01')$q$, 'Franchise en base de TVA');
  perform public._t014_entreprise($q$tva_intra = 'FR56121212120', franchise_tva = false, iban = null, option_debits = true$q$);
  if cardinality(public.mentions_manquantes('a0140000-0000-4000-8000-0000000000e1')) <> 0 then
    raise exception 'ÉCHEC : entreprise complète encore signalée incomplète';
  end if;
end $$;

-- 3. Finalisation : figement complet, date de prestation et catégorie par défaut
do $$
declare f public.factures; e jsonb;
begin
  perform public.finaliser_facture('a0140000-0000-4000-8000-000000000f01');
  select * into f from public.factures where id = 'a0140000-0000-4000-8000-000000000f01';
  e := f.emetteur_fige;
  if f.numero is null or f.date_prestation is distinct from f.date_emission or f.categorie_operation is distinct from 'services'
     or f.adresse_livraison is not null then
    raise exception 'ÉCHEC : opération non complétée à la finalisation (%, %, %)', f.date_prestation, f.categorie_operation, f.adresse_livraison;
  end if;
  if not coalesce(e @> jsonb_build_object('mentions', 2, 'forme_juridique', 'SAS', 'capital_social', 10000, 'immatriculation_type', 'rcs',
       'immatriculation_lieu', 'Paris', 'tva_intra', 'FR56121212120', 'franchise_tva', false, 'option_debits', true,
       'penalites_mode', 'bce_10', 'escompte', 'Pas d''escompte pour paiement anticipé.',
       'logo', 'a0140000-0000-4000-8000-0000000000e1/logo-1.png', 'siret', '12121212000012'), false)
     or e ? 'iban' or e ? 'penalites_taux' or e ? 'assurance_pro' then
    raise exception 'ÉCHEC : emetteur_fige incomplet ou avec des champs vides (%)', e;
  end if;

  -- Verrou après l'émission
  perform public._t014_refuse($q$update public.factures set date_prestation = date_prestation - 1 where id = 'a0140000-0000-4000-8000-000000000f01'$q$, 'ne peut plus être modifiée');
  perform public._t014_refuse($q$update public.factures set adresse_livraison = 'Ailleurs' where id = 'a0140000-0000-4000-8000-000000000f01'$q$, 'ne peut plus être modifiée');
  perform public._t014_refuse($q$update public.factures set categorie_operation = 'biens' where id = 'a0140000-0000-4000-8000-000000000f01'$q$, 'ne peut plus être modifiée');
  perform public._t014_refuse($q$select public.enregistrer_facture('a0140000-0000-4000-8000-000000000f01', '{"adresse_livraison":"Ailleurs"}'::jsonb)$q$, 'ne peut plus être modifiée');

  -- Un changement ultérieur des paramètres ne touche pas le document émis
  perform public._t014_entreprise($q$forme_juridique = 'SA', logo_url = null$q$);
  if (select emetteur_fige->>'forme_juridique' from public.factures where id = 'a0140000-0000-4000-8000-000000000f01') <> 'SAS'
     or (select emetteur_fige->>'logo' from public.factures where id = 'a0140000-0000-4000-8000-000000000f01') is null then
    raise exception 'ÉCHEC : le figement suit les paramètres de l''entreprise';
  end if;
end $$;

-- 4. Champs saisis au brouillon : enregistrés, contrôlés, conservés à la finalisation
do $$
declare f public.factures;
begin
  perform public._t014_brouillon('a0140000-0000-4000-8000-000000000f02');
  perform public.enregistrer_facture('a0140000-0000-4000-8000-000000000f02',
    jsonb_build_object('date_prestation', '2026-10-15', 'adresse_livraison', '5 chantier des Lilas, 75011 Paris', 'categorie_operation', 'mixte'));
  perform public._t014_refuse($q$select public.enregistrer_facture('a0140000-0000-4000-8000-000000000f02', '{"categorie_operation":"autre"}'::jsonb)$q$, 'factures_categorie_operation');
  perform public.finaliser_facture('a0140000-0000-4000-8000-000000000f02');
  select * into f from public.factures where id = 'a0140000-0000-4000-8000-000000000f02';
  if f.date_prestation is distinct from '2026-10-15' or f.adresse_livraison is distinct from '5 chantier des Lilas, 75011 Paris'
     or f.categorie_operation is distinct from 'mixte'
     or f.emetteur_fige->>'forme_juridique' is distinct from 'SA' or f.emetteur_fige ? 'logo' then
    raise exception 'ÉCHEC : champs saisis au brouillon non conservés (%, %, %, %)', f.date_prestation, f.adresse_livraison, f.categorie_operation, f.emetteur_fige;
  end if;
end $$;

-- 5. Admin A : avoir total, émetteur figé, aucune date de prestation
select set_config('request.jwt.claims', '{"sub":"a0140000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
declare v uuid; f public.factures;
begin
  v := public.creer_avoir('a0140000-0000-4000-8000-000000000f02', 'Erreur de prix', true);
  perform public.finaliser_facture(v);
  select * into f from public.factures where id = v;
  if coalesce(f.numero, '') not like 'AV-%' or f.date_prestation is not null or f.categorie_operation is not null
     or not coalesce(f.emetteur_fige @> '{"mentions": 2, "tva_intra": "FR56121212120"}'::jsonb, false) then
    raise exception 'ÉCHEC : avoir mal figé (%, %, %)', f.numero, f.date_prestation, f.emetteur_fige;
  end if;
end $$;

-- 6. Admin B : aucune information sur les mentions de A
select set_config('request.jwt.claims', '{"sub":"a0140000-0000-4000-8000-000000000006","role":"authenticated"}', true);
do $$
begin
  if public.mentions_manquantes('a0140000-0000-4000-8000-0000000000e1') is not null then
    raise exception 'ÉCHEC : l''admin de B lit les mentions de A';
  end if;
  if public.instantane_emetteur('a0140000-0000-4000-8000-0000000000e1') is not null then
    raise exception 'ÉCHEC : l''admin de B lit l''identité figée de A';
  end if;
end $$;

reset role;
rollback;
