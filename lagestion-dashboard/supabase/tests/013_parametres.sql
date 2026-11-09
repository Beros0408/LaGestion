-- 013_parametres.sql — LaGestion
-- Vérifie la migration 013 (paramètres de l'entreprise) :
--   - modification des paramètres par l'admin seul ; aucun effet sur une autre entreprise ;
--   - contrôles de forme (délai de 0 à 60 jours, TVA, IBAN, pénalités, mode de paiement, immatriculation) ;
--   - audit des modifications, lisible par l'admin seul ;
--   - délai, mode et conditions de paiement de l'entreprise repris par l'acompte et la conversion d'un devis ;
--   - chemins du bucket logos : seul un premier segment uuid désigne une entreprise.
-- À lancer après migrations/013_parametres.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0130…)
--   entreprise A …00e1 : lecture …0001 · commercial …0002 · comptable …0003 · manager …0004 · admin …0005
--   entreprise B …00e2 : admin …0006
--   client A …00c1 ; devis A …0d01 (conversion) et …0d02 (acompte)

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role)
select ('a0130000-0000-4000-8000-00000000000' || i)::uuid, 'test-013-' || i || '@lagestion.invalid', 'authenticated', 'authenticated'
from generate_series(1, 6) i;

insert into public.entreprises (id, nom, siret, adresse) values
  ('a0130000-0000-4000-8000-0000000000e1', 'Entreprise A (test 013)', '11111111100011', '1 rue de A, 75001 Paris'),
  ('a0130000-0000-4000-8000-0000000000e2', 'Entreprise B (test 013)', '22222222200022', '2 rue de B, 69001 Lyon');

insert into public.memberships (entreprise_id, user_id, role) values
  ('a0130000-0000-4000-8000-0000000000e1', 'a0130000-0000-4000-8000-000000000001', 'lecture'),
  ('a0130000-0000-4000-8000-0000000000e1', 'a0130000-0000-4000-8000-000000000002', 'commercial'),
  ('a0130000-0000-4000-8000-0000000000e1', 'a0130000-0000-4000-8000-000000000003', 'comptable'),
  ('a0130000-0000-4000-8000-0000000000e1', 'a0130000-0000-4000-8000-000000000004', 'manager'),
  ('a0130000-0000-4000-8000-0000000000e1', 'a0130000-0000-4000-8000-000000000005', 'admin'),
  ('a0130000-0000-4000-8000-0000000000e2', 'a0130000-0000-4000-8000-000000000006', 'admin');

insert into public.clients (id, entreprise_id, nom, adresse) values
  ('a0130000-0000-4000-8000-0000000000c1', 'a0130000-0000-4000-8000-0000000000e1', 'Client A', '10 rue du Client, 75002 Paris');

create function public._t013_refuse(p_sql text, p_extrait text) returns void
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
grant execute on function public._t013_refuse(text, text) to authenticated;

create function public._t013_lignes(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public._t013_lignes(text) to authenticated;

-- Devis accepté : 1 000 € HT à 20 %, transitions posées par l'utilisateur courant
create function public._t013_devis(p_id uuid) returns void
language plpgsql as $$
begin
  insert into public.devis (id, entreprise_id, client_id) values (p_id, 'a0130000-0000-4000-8000-0000000000e1', 'a0130000-0000-4000-8000-0000000000c1');
  insert into public.lignes_devis (entreprise_id, devis_id, description, quantite, prix_unitaire, taux_tva, position)
  values ('a0130000-0000-4000-8000-0000000000e1', p_id, 'Travaux', 1, 1000, 20, 0);
  update public.devis set statut = 'envoye' where id = p_id;
  update public.devis set statut = 'accepte' where id = p_id;
end $$;
grant execute on function public._t013_devis(uuid) to authenticated;

-- 2. Valeurs par défaut d'une entreprise existante : rien ne change sans paramétrage
do $$
declare e public.entreprises;
begin
  select * into e from public.entreprises where id = 'a0130000-0000-4000-8000-0000000000e1';
  if e.delai_paiement_jours <> 30 or e.penalites_mode <> 'bce_10' or e.franchise_tva or e.option_debits
     or e.escompte <> 'Pas d''escompte pour paiement anticipé.' or e.forme_juridique is not null then
    raise exception 'ÉCHEC : valeurs par défaut inattendues (%)', to_jsonb(e);
  end if;
end $$;

set local role authenticated;

-- 3. Rôles sans droit : aucune ligne modifiée (RLS)
do $$
declare u text; n int;
begin
  foreach u in array array['1', '2', '3', '4'] loop
    perform set_config('request.jwt.claims', '{"sub":"a0130000-0000-4000-8000-00000000000' || u || '","role":"authenticated"}', true);
    n := public._t013_lignes($q$update public.entreprises set forme_juridique = 'SAS' where id = 'a0130000-0000-4000-8000-0000000000e1'$q$);
    if n <> 0 then raise exception 'ÉCHEC : le membre …000% (non admin) modifie l''entreprise', u; end if;
  end loop;
  -- Admin d'une autre entreprise
  perform set_config('request.jwt.claims', '{"sub":"a0130000-0000-4000-8000-000000000006","role":"authenticated"}', true);
  n := public._t013_lignes($q$update public.entreprises set forme_juridique = 'SAS' where id = 'a0130000-0000-4000-8000-0000000000e1'$q$);
  if n <> 0 then raise exception 'ÉCHEC : l''admin de B modifie l''entreprise A'; end if;
  if exists (select 1 from public.audit_events where table_name = 'entreprises' and entreprise_id = 'a0130000-0000-4000-8000-0000000000e1') then
    raise exception 'ÉCHEC : l''admin de B lit l''audit de A';
  end if;
end $$;

-- 4. Admin A : paramètres complets, contrôles de forme, audit
select set_config('request.jwt.claims', '{"sub":"a0130000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
declare n int; a record;
begin
  n := public._t013_lignes($q$update public.entreprises set
      forme_juridique = 'SAS', capital_social = 10000, immatriculation_type = 'rcs', immatriculation_lieu = 'Paris',
      tva_intra = 'FR32111111111', option_debits = true, penalites_mode = 'taux_fixe', penalites_taux = 12.5,
      delai_paiement_jours = 45, mode_paiement = 'virement', conditions_paiement = '45 jours net',
      iban = 'FR7630006000011234567890189', assurance_pro = 'Assureur X, contrat 123, France'
    where id = 'a0130000-0000-4000-8000-0000000000e1'$q$);
  if n <> 1 then raise exception 'ÉCHEC : l''admin ne modifie pas son entreprise (% ligne)', n; end if;

  perform public._t013_refuse($q$update public.entreprises set delai_paiement_jours = 61 where id = 'a0130000-0000-4000-8000-0000000000e1'$q$, 'entreprises_delai');
  perform public._t013_refuse($q$update public.entreprises set delai_paiement_jours = -1 where id = 'a0130000-0000-4000-8000-0000000000e1'$q$, 'entreprises_delai');
  perform public._t013_refuse($q$update public.entreprises set tva_intra = 'fr 32 111' where id = 'a0130000-0000-4000-8000-0000000000e1'$q$, 'entreprises_tva_intra');
  perform public._t013_refuse($q$update public.entreprises set iban = 'FR76 3000' where id = 'a0130000-0000-4000-8000-0000000000e1'$q$, 'entreprises_iban');
  perform public._t013_refuse($q$update public.entreprises set penalites_taux = null where id = 'a0130000-0000-4000-8000-0000000000e1'$q$, 'entreprises_penalites');
  perform public._t013_refuse($q$update public.entreprises set penalites_mode = 'libre' where id = 'a0130000-0000-4000-8000-0000000000e1'$q$, 'entreprises_penalites');
  perform public._t013_refuse($q$update public.entreprises set mode_paiement = 'bitcoin' where id = 'a0130000-0000-4000-8000-0000000000e1'$q$, 'entreprises_mode_paiement');
  perform public._t013_refuse($q$update public.entreprises set immatriculation_type = 'rcs2' where id = 'a0130000-0000-4000-8000-0000000000e1'$q$, 'entreprises_immatriculation');
  perform public._t013_refuse($q$update public.entreprises set capital_social = -1 where id = 'a0130000-0000-4000-8000-0000000000e1'$q$, 'entreprises_capital');
  perform public._t013_refuse($q$update public.entreprises set forme_juridique = '' where id = 'a0130000-0000-4000-8000-0000000000e1'$q$, 'entreprises_forme_juridique');
  -- Création et suppression d'entreprise : aucune politique
  perform public._t013_refuse($q$insert into public.entreprises (nom) values ('Pirate')$q$, 'row-level security');
  n := public._t013_lignes($q$delete from public.entreprises where id = 'a0130000-0000-4000-8000-0000000000e1'$q$);
  if n <> 0 then raise exception 'ÉCHEC : l''admin supprime physiquement son entreprise'; end if;

  select * into a from public.audit_events
   where table_name = 'entreprises' and entreprise_id = 'a0130000-0000-4000-8000-0000000000e1' order by id desc limit 1;
  if a.id is null or a.action <> 'update' or a.user_id <> 'a0130000-0000-4000-8000-000000000005'
     or a.old_data->>'forme_juridique' is not null or a.new_data->>'forme_juridique' <> 'SAS' then
    raise exception 'ÉCHEC : audit de la modification absent ou incomplet';
  end if;
end $$;

-- 5. Audit : illisible pour un non-admin
select set_config('request.jwt.claims', '{"sub":"a0130000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.audit_events where table_name = 'entreprises') then
    raise exception 'ÉCHEC : le manager lit l''audit de l''entreprise';
  end if;
  -- La lecture des paramètres reste ouverte à tout membre (PDF, formulaires)
  if (select delai_paiement_jours from public.entreprises where id = 'a0130000-0000-4000-8000-0000000000e1') <> 45 then
    raise exception 'ÉCHEC : le manager ne lit pas les paramètres';
  end if;
end $$;

-- 6. Commercial : acompte et conversion reprennent délai, mode et conditions
select set_config('request.jwt.claims', '{"sub":"a0130000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare f public.factures; v uuid;
begin
  perform public._t013_devis('a0130000-0000-4000-8000-000000000d02');
  v := public.creer_acompte('a0130000-0000-4000-8000-000000000d02', 'pourcentage', 30);
  select * into f from public.factures where id = v;
  if f.date_echeance <> public.date_du_jour_paris() + 45 or f.mode_paiement <> 'virement' or f.conditions_paiement <> '45 jours net'
     or f.type <> 'acompte' or f.total_ttc is not null then
    raise exception 'ÉCHEC : acompte sans les paramètres de paiement (%, %, %)', f.date_echeance, f.mode_paiement, f.conditions_paiement;
  end if;
  if (select count(*) from public.lignes_facture where facture_id = v) <> 1
     or (select prix_unitaire from public.lignes_facture where facture_id = v) <> 300 then
    raise exception 'ÉCHEC : lignes de l''acompte modifiées par la migration 013';
  end if;

  perform public._t013_devis('a0130000-0000-4000-8000-000000000d01');
  v := public.convertir_devis('a0130000-0000-4000-8000-000000000d01');
  select * into f from public.factures where id = v;
  if f.date_echeance <> public.date_du_jour_paris() + 45 or f.mode_paiement <> 'virement' or f.conditions_paiement <> '45 jours net'
     or f.type <> 'facture' or f.statut <> 'brouillon' or f.numero is not null then
    raise exception 'ÉCHEC : conversion sans les paramètres de paiement (%, %, %)', f.date_echeance, f.mode_paiement, f.conditions_paiement;
  end if;
  if (select count(*) from public.lignes_facture where facture_id = v) <> 1
     or (select statut from public.devis where id = 'a0130000-0000-4000-8000-000000000d01') <> 'converti' then
    raise exception 'ÉCHEC : conversion incomplète';
  end if;
  perform public._t013_refuse($q$select public.convertir_devis('a0130000-0000-4000-8000-000000000d01')$q$, 'déjà été converti');
end $$;

-- 7. Lecture : conversion refusée ; chemins du bucket logos
select set_config('request.jwt.claims', '{"sub":"a0130000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  perform public._t013_refuse($q$select public.creer_acompte('a0130000-0000-4000-8000-000000000d02', 'pourcentage', 10)$q$, 'Votre rôle ne permet pas');
  if public.entreprise_du_chemin('a0130000-0000-4000-8000-0000000000e1/logo-1.png') is distinct from 'a0130000-0000-4000-8000-0000000000e1'
     or public.entreprise_du_chemin('../a0130000-0000-4000-8000-0000000000e1/logo.png') is not null
     or public.entreprise_du_chemin('logo.png') is not null
     or public.entreprise_du_chemin('A0130000-0000-4000-8000-0000000000E1/logo.png') is not null then
    raise exception 'ÉCHEC : lecture du chemin d''un logo';
  end if;
end $$;

reset role;
rollback;
