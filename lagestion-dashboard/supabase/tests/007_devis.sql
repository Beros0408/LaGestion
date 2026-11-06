-- 007_devis.sql — Lagestion
-- Vérifie la migration 007 (devis et conversion) :
--   - isolation entre entreprises (lecture, écriture, références, conversion) ;
--   - droits par rôle ; numérotation ; transitions de statut ;
--   - devis accepté verrouillé, retour en envoyé réservé à admin et manager et tracé dans audit_events ;
--   - conversion : contenu copié, totaux identiques, transaction annulée en cas d'échec, pas de reconversion ;
--   - cas limites : devis expiré, client supprimé, article inactif, remise plafonnée, devis sans ligne ;
--   - totaux : mêmes cas et mêmes valeurs que tests/cas_totaux.json, contre lequel calculerTotaux est testé
--     (npm test vérifie que le tableau _cas ci-dessous reprend bien ce fichier).
-- À lancer après migrations/007_devis.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0070…)
--   entreprise A …00e1 : lecture …0001 · commercial …0002 · comptable …0003 · manager …0004 · admin …0005
--   entreprise B …00e2 : admin …0006 ; client de B …00c2 ; article de B …00b2 ; devis de B …00d2
--   clients de A : …00c1 (actif), …00c3 (supprimé) ; articles de A : …00a1 (inactif)

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role)
select ('a0070000-0000-4000-8000-00000000000' || i)::uuid, 'test-007-' || i || '@lagestion.invalid', 'authenticated', 'authenticated'
from generate_series(1, 6) i;

insert into public.entreprises (id, nom) values
  ('a0070000-0000-4000-8000-0000000000e1', 'Entreprise A (test 007)'),
  ('a0070000-0000-4000-8000-0000000000e2', 'Entreprise B (test 007)');

insert into public.memberships (entreprise_id, user_id, role) values
  ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-000000000001', 'lecture'),
  ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-000000000002', 'commercial'),
  ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-000000000003', 'comptable'),
  ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-000000000004', 'manager'),
  ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-000000000005', 'admin'),
  ('a0070000-0000-4000-8000-0000000000e2', 'a0070000-0000-4000-8000-000000000006', 'admin');

insert into public.clients (id, entreprise_id, nom) values
  ('a0070000-0000-4000-8000-0000000000c1', 'a0070000-0000-4000-8000-0000000000e1', 'Client A'),
  ('a0070000-0000-4000-8000-0000000000c2', 'a0070000-0000-4000-8000-0000000000e2', 'Client B'),
  ('a0070000-0000-4000-8000-0000000000c3', 'a0070000-0000-4000-8000-0000000000e1', 'Client A supprimé ensuite');

insert into public.produits (id, entreprise_id, type, reference, nom, prix_unitaire_ht, actif) values
  ('a0070000-0000-4000-8000-0000000000a1', 'a0070000-0000-4000-8000-0000000000e1', 'service', 'A-INACTIF', 'Article inactif de A', 40, false),
  ('a0070000-0000-4000-8000-0000000000b2', 'a0070000-0000-4000-8000-0000000000e2', 'produit', 'B-001', 'Article de B', 50, true);

-- Devis de B, accepté (écrit en postgres : règles de statut non appliquées)
insert into public.devis (id, entreprise_id, client_id, numero, statut) values
  ('a0070000-0000-4000-8000-0000000000d2', 'a0070000-0000-4000-8000-0000000000e2', 'a0070000-0000-4000-8000-0000000000c2', 'DEV-DEMO-B', 'accepte');
insert into public.lignes_devis (entreprise_id, devis_id, description, prix_unitaire) values
  ('a0070000-0000-4000-8000-0000000000e2', 'a0070000-0000-4000-8000-0000000000d2', 'Ligne de B', 100);

-- 2. Totaux (rôle postgres) : mêmes cas que tests/cas_totaux.json, résultats en centimes
create temp table _cas (n int, remise numeric, ht_brut int, remise_app int, ht int, tva int, ttc int) on commit drop;
insert into _cas values
  (1, 0,    0,      0,     0,     0,     0),
  (2, 0,    20000,  0,     20000, 4000,  24000),
  (3, 0,    10000,  0,     10000, 2000,  12000),
  (4, 0,    100,    0,     100,   20,    120),
  (5, 100,  100000, 10000, 90000, 18000, 108000),
  (6, 0.10, 300,    10,    290,   34,    324),
  (7, 80,   5000,   5000,  0,     0,     0),
  (8, 0,    2500,   0,     2500,  11,    2511),
  (9, 10,   15000,  1000,  14000, 2334,  16334),
  (10, 0.01, 206,   1,     205,   20,    225);

create temp table _lignes (n int, quantite numeric, prix_unitaire numeric, taux_tva numeric, remise numeric) on commit drop;
insert into _lignes values
  (2, 2, 100, 20, 0),
  (3, 1, 50, 20, 80), (3, 1, 100, 20, 0),
  (4, 1.5, 0.33, 20, 0), (4, 1.5, 0.33, 20, 0),
  (5, 1, 1000, 20, 0),
  (6, 1, 1, 20, 0), (6, 1, 1, 10, 0), (6, 1, 1, 5.5, 0),
  (7, 1, 50, 20, 0),
  (8, 1, 5, 2.1, 0), (8, 1, 20, 0, 0),
  (9, 1, 100, 20, 0), (9, 1, 50, 10, 0),
  (10, 1, 1.03, 20, 0), (10, 1, 1.03, 0, 0);

insert into public.devis (id, entreprise_id, client_id, numero, remise)
select ('a0071000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'a0070000-0000-4000-8000-0000000000e2', 'a0070000-0000-4000-8000-0000000000c2', 'DEV-DEMO-T' || n, remise
from _cas;
insert into public.lignes_devis (entreprise_id, devis_id, description, quantite, prix_unitaire, taux_tva, remise)
select 'a0070000-0000-4000-8000-0000000000e2', ('a0071000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Ligne ' || n, quantite, prix_unitaire, taux_tva, remise
from _lignes;

-- Mêmes contenus en factures, pour comparer les deux vues
insert into public.factures (id, entreprise_id, client_id, numero, remise)
select ('a0072000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'a0070000-0000-4000-8000-0000000000e2', 'a0070000-0000-4000-8000-0000000000c2', 'T007-' || n, remise
from _cas;
insert into public.lignes_facture (entreprise_id, facture_id, description, quantite, prix_unitaire, taux_tva, remise)
select 'a0070000-0000-4000-8000-0000000000e2', ('a0072000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Ligne ' || n, quantite, prix_unitaire, taux_tva, remise
from _lignes;

do $$
declare r record; n int;
begin
  for r in
    select c.*, t.total_ht_brut, t.remise_appliquee, t.total_ht, t.total_tva, t.total_ttc,
           ft.total_ht as f_ht, ft.total_tva as f_tva, ft.total_ttc as f_ttc,
           ft.total_ht_brut as f_brut, ft.remise_appliquee as f_remise
    from _cas c
    left join public.devis_totaux t on t.devis_id = ('a0071000-0000-4000-8000-' || lpad(c.n::text, 12, '0'))::uuid
    left join public.factures_totaux ft on ft.facture_id = ('a0072000-0000-4000-8000-' || lpad(c.n::text, 12, '0'))::uuid
    order by c.n
  loop
    if r.total_ht_brut * 100 <> r.ht_brut or r.remise_appliquee * 100 <> r.remise_app or r.total_ht * 100 <> r.ht
       or r.total_tva * 100 <> r.tva or r.total_ttc * 100 <> r.ttc then
      raise exception 'ÉCHEC totaux, cas % : brut %, remise %, HT %, TVA %, TTC %', r.n,
        r.total_ht_brut, r.remise_appliquee, r.total_ht, r.total_tva, r.total_ttc;
    end if;
    if (r.total_ht, r.total_tva, r.total_ttc, r.total_ht_brut, r.remise_appliquee)
       is distinct from (r.f_ht, r.f_tva, r.f_ttc, r.f_brut, r.f_remise) then
      raise exception 'ÉCHEC totaux, cas % : devis_totaux diffère de factures_totaux', r.n;
    end if;
  end loop;
  select count(*) into n from public.devis_totaux
   where devis_id::text like 'a0071000-%';
  if n <> 10 then raise exception 'ÉCHEC totaux : % cas au lieu de 10', n; end if;
end $$;

-- Échecs attendus : helper de test, retiré par le rollback final
create function public._t007_refuse(p_sql text, p_extrait text) returns void
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
grant execute on function public._t007_refuse(text, text) to authenticated;

set local role authenticated;

-- 3. Lecture (A) : consulte A, n'écrit rien, ne convertit rien, ne voit pas B
select set_config('request.jwt.claims', '{"sub":"a0070000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare n int;
begin
  select count(*) into n from public.devis where entreprise_id = 'a0070000-0000-4000-8000-0000000000e2';
  if n <> 0 then raise exception 'ÉCHEC : un membre de A voit % devis de B', n; end if;
  select count(*) into n from public.lignes_devis where entreprise_id = 'a0070000-0000-4000-8000-0000000000e2';
  if n <> 0 then raise exception 'ÉCHEC : un membre de A voit % ligne(s) de devis de B', n; end if;
  select count(*) into n from public.devis_totaux where devis_id = 'a0070000-0000-4000-8000-0000000000d2';
  if n <> 0 then raise exception 'ÉCHEC : devis_totaux laisse voir un devis de B'; end if;
  perform public._t007_refuse(
    $q$insert into public.devis (entreprise_id, client_id) values ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000c1')$q$,
    'row-level security');
end $$;

-- 4. Commercial (A) : numérotation, statut initial, isolation
select set_config('request.jwt.claims', '{"sub":"a0070000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare
  v_prefixe constant text := 'DEV-' || to_char(current_date, 'YYYY') || '-';
  v_numero text; n int;
begin
  insert into public.devis (id, entreprise_id, client_id, remise) values
    ('a0070000-0000-4000-8000-000000000d01', 'a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000c1', 10)
    returning numero into v_numero;
  if v_numero <> v_prefixe || '0001' then raise exception 'ÉCHEC numéro : % au lieu de %0001', v_numero, v_prefixe; end if;

  -- Un numéro envoyé par le navigateur est ignoré, sauf le préfixe de démonstration
  insert into public.devis (id, entreprise_id, client_id, numero) values
    ('a0070000-0000-4000-8000-000000000d02', 'a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000c1', 'DEV-2099-9999')
    returning numero into v_numero;
  if v_numero <> v_prefixe || '0002' then raise exception 'ÉCHEC numéro imposé accepté : %', v_numero; end if;

  -- Validité par défaut et contrôle de cohérence
  select count(*) into n from public.devis
   where id = 'a0070000-0000-4000-8000-000000000d02' and date_validite = current_date + 30;
  if n <> 1 then raise exception 'ÉCHEC : validité par défaut différente de 30 jours'; end if;
  perform public._t007_refuse(
    $q$insert into public.devis (entreprise_id, client_id, date_emission, date_validite) values ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000c1', current_date, current_date - 1)$q$,
    'devis_validite_apres_emission');

  perform public._t007_refuse(
    $q$insert into public.devis (entreprise_id, client_id, statut) values ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000c1', 'accepte')$q$,
    'commence toujours au statut brouillon');
  perform public._t007_refuse(
    $q$update public.devis set numero = 'DEV-1999-0001' where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'numéro d''un devis ne peut pas être modifié');

  -- Isolation en écriture
  perform public._t007_refuse(
    $q$insert into public.devis (entreprise_id, client_id) values ('a0070000-0000-4000-8000-0000000000e2', 'a0070000-0000-4000-8000-0000000000c2')$q$,
    'row-level security');
  perform public._t007_refuse(
    $q$insert into public.devis (entreprise_id, client_id) values ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000c2')$q$,
    'même entreprise');
  update public.devis set remise = 999 where id = 'a0070000-0000-4000-8000-0000000000d2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC : un membre de A a modifié un devis de B'; end if;
  perform public._t007_refuse(
    $q$select public.convertir_devis('a0070000-0000-4000-8000-0000000000d2')$q$,
    'introuvable');

  -- Lignes : article inactif de A accepté, article de B refusé, devis de B refusé
  insert into public.lignes_devis (entreprise_id, devis_id, description, reference, unite, quantite, prix_unitaire, taux_tva, remise, position, produit_id) values
    ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-000000000d01', 'Article inactif', 'A-INACTIF', 'h', 2.5, 40, 20, 5, 0, 'a0070000-0000-4000-8000-0000000000a1'),
    ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-000000000d01', 'Saisie libre', null, null, 1, 33.33, 5.5, 0, 1, null);
  perform public._t007_refuse(
    $q$insert into public.lignes_devis (entreprise_id, devis_id, description, produit_id) values ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-000000000d01', 'x', 'a0070000-0000-4000-8000-0000000000b2')$q$,
    'même entreprise');
  perform public._t007_refuse(
    $q$insert into public.lignes_devis (entreprise_id, devis_id, description) values ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000d2', 'x')$q$,
    'même entreprise');
end $$;

-- 5. Transitions : commercial (A)
do $$
declare n int;
begin
  perform public._t007_refuse(
    $q$update public.devis set statut = 'accepte' where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'changement de statut');
  perform public._t007_refuse(
    $q$select public.convertir_devis('a0070000-0000-4000-8000-000000000d01')$q$,
    'Seul un devis accepté');
  update public.devis set statut = 'envoye' where id = 'a0070000-0000-4000-8000-000000000d01';
  perform public._t007_refuse(
    $q$update public.devis set statut = 'converti' where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'changement de statut');

  -- Validité dépassée : modifiable tant qu'envoyé, acceptation refusée, puis prolongation
  update public.devis set date_emission = current_date - 40, date_validite = current_date - 1
   where id = 'a0070000-0000-4000-8000-000000000d01';
  perform public._t007_refuse(
    $q$update public.devis set statut = 'accepte' where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'date de validité de ce devis est dépassée');
  update public.devis set date_validite = current_date + 10 where id = 'a0070000-0000-4000-8000-000000000d01';

  -- Devis expiré : non convertible, repasse en envoyé
  update public.devis set statut = 'expire' where id = 'a0070000-0000-4000-8000-000000000d01';
  perform public._t007_refuse(
    $q$select public.convertir_devis('a0070000-0000-4000-8000-000000000d01')$q$,
    'Seul un devis accepté');
  perform public._t007_refuse(
    $q$update public.devis set statut = 'accepte' where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'changement de statut');
  update public.devis set statut = 'envoye' where id = 'a0070000-0000-4000-8000-000000000d01';

  -- Accepté : en-tête et lignes verrouillés, sortie réservée à la direction
  update public.devis set statut = 'accepte' where id = 'a0070000-0000-4000-8000-000000000d01';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : le commercial n''a pas pu accepter le devis'; end if;
  perform public._t007_refuse(
    $q$update public.devis set remise = 1 where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'accepté ne peut plus être modifié');
  perform public._t007_refuse(
    $q$update public.devis set notes_internes = 'x' where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'accepté ne peut plus être modifié');
  perform public._t007_refuse(
    $q$insert into public.lignes_devis (entreprise_id, devis_id, description) values ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-000000000d01', 'x')$q$,
    'accepté');
  perform public._t007_refuse(
    $q$update public.lignes_devis set prix_unitaire = 1 where devis_id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'accepté');
  perform public._t007_refuse(
    $q$delete from public.lignes_devis where devis_id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'accepté');
  perform public._t007_refuse(
    $q$update public.devis set statut = 'envoye' where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'administrateur ou un manager');
  -- Le détour par « refusé » contournerait le verrou
  perform public._t007_refuse(
    $q$update public.devis set statut = 'refuse' where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'administrateur ou un manager');

  -- Suppression réservée à la direction
  perform public._t007_refuse(
    $q$update public.devis set deleted_at = now() where id = 'a0070000-0000-4000-8000-000000000d02'$q$,
    'réservée aux administrateurs et managers');
  delete from public.devis where id = 'a0070000-0000-4000-8000-000000000d02';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ÉCHEC : le commercial a supprimé définitivement un devis'; end if;
end $$;

-- 6. Lecture : conversion refusée sur un devis accepté de A
select set_config('request.jwt.claims', '{"sub":"a0070000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
begin
  perform public._t007_refuse(
    $q$select public.convertir_devis('a0070000-0000-4000-8000-000000000d01')$q$,
    'Votre rôle ne permet pas');
end $$;

-- 7. Manager : retour en envoyé (tracé), correction, nouvelle acceptation ; retour au rôle commercial pour accepter
select set_config('request.jwt.claims', '{"sub":"a0070000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare n int;
begin
  update public.devis set statut = 'envoye' where id = 'a0070000-0000-4000-8000-000000000d01';
  update public.devis set remise = 12.34, message_client = 'Valable pour ce chantier uniquement.', notes_internes = 'Note interne'
   where id = 'a0070000-0000-4000-8000-000000000d01';
  update public.lignes_devis set remise = 5 where devis_id = 'a0070000-0000-4000-8000-000000000d01' and position = 0;
  update public.devis set statut = 'accepte' where id = 'a0070000-0000-4000-8000-000000000d01';
  select count(*) into n from public.audit_events
   where table_name = 'devis' and record_id = 'a0070000-0000-4000-8000-000000000d01';
  if n <> 0 then raise exception 'ÉCHEC : le manager lit le journal d''audit réservé aux admins'; end if;
end $$;

-- 8. Conversion avec échec en plein milieu (rôle postgres pour poser la panne) : rien ne doit subsister
reset role;
create function public._t007_panne() returns trigger language plpgsql as $$
begin raise exception 'Panne simulée'; end $$;
create trigger _t007_panne before insert on public.lignes_facture
  for each row execute function public._t007_panne();
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0070000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
declare n int;
begin
  perform public._t007_refuse(
    $q$select public.convertir_devis('a0070000-0000-4000-8000-000000000d01')$q$,
    'Panne simulée');
  select count(*) into n from public.factures where devis_id = 'a0070000-0000-4000-8000-000000000d01';
  if n <> 0 then raise exception 'ÉCHEC : facture laissée par une conversion échouée'; end if;
  select count(*) into n from public.devis where id = 'a0070000-0000-4000-8000-000000000d01' and statut = 'accepte';
  if n <> 1 then raise exception 'ÉCHEC : statut du devis modifié par une conversion échouée'; end if;
end $$;
reset role;
drop trigger _t007_panne on public.lignes_facture;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0070000-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- 9. Commercial : conversion réussie, contenu et totaux identiques, plus de modification possible
do $$
declare
  v_facture uuid; f record; n int;
begin
  v_facture := public.convertir_devis('a0070000-0000-4000-8000-000000000d01');

  -- Depuis la migration 008 : brouillon sans numéro, échéance à émission + 30 jours
  select * into f from public.factures where id = v_facture;
  if f.statut <> 'brouillon' or f.devis_id <> 'a0070000-0000-4000-8000-000000000d01'
     or f.client_id <> 'a0070000-0000-4000-8000-0000000000c1' or f.remise <> 12.34
     or f.entreprise_id <> 'a0070000-0000-4000-8000-0000000000e1'
     or f.date_emission <> public.date_du_jour_paris()
     or f.date_echeance <> public.date_du_jour_paris() + 30 then
    raise exception 'ÉCHEC conversion : en-tête de facture incorrect (%)', to_jsonb(f);
  end if;
  if f.numero is not null then
    raise exception 'ÉCHEC conversion : le brouillon a reçu le numéro %', f.numero;
  end if;
  if f.notes_internes is not null or f.message_client is not null then
    raise exception 'ÉCHEC conversion : notes ou message du devis copiés sur la facture';
  end if;

  -- Lignes copiées à l'identique, article inactif compris
  select count(*) into n from (
    select description, reference, unite, quantite, prix_unitaire, taux_tva, remise, position, produit_id
      from public.lignes_devis where devis_id = 'a0070000-0000-4000-8000-000000000d01'
    except
    select description, reference, unite, quantite, prix_unitaire, taux_tva, remise, position, produit_id
      from public.lignes_facture where facture_id = v_facture
  ) s;
  if n <> 0 then raise exception 'ÉCHEC conversion : % ligne(s) non copiée(s) à l''identique', n; end if;
  select count(*) into n from public.lignes_facture where facture_id = v_facture;
  if n <> 2 then raise exception 'ÉCHEC conversion : % ligne(s) au lieu de 2', n; end if;
  select count(*) into n from public.lignes_facture
   where facture_id = v_facture and produit_id = 'a0070000-0000-4000-8000-0000000000a1';
  if n <> 1 then raise exception 'ÉCHEC conversion : l''article inactif n''a pas été conservé'; end if;

  -- Totaux identiques au centime
  select count(*) into n
    from public.devis_totaux d, public.factures_totaux t
   where d.devis_id = 'a0070000-0000-4000-8000-000000000d01' and t.facture_id = v_facture
     and (d.total_ht, d.total_tva, d.total_ttc, d.total_ht_brut, d.remise_appliquee)
       = (t.total_ht, t.total_tva, t.total_ttc, t.total_ht_brut, t.remise_appliquee);
  if n <> 1 then raise exception 'ÉCHEC conversion : totaux différents entre le devis et la facture'; end if;

  select count(*) into n from public.devis where id = 'a0070000-0000-4000-8000-000000000d01' and statut = 'converti';
  if n <> 1 then raise exception 'ÉCHEC conversion : le devis n''est pas au statut converti'; end if;

  perform public._t007_refuse(
    $q$select public.convertir_devis('a0070000-0000-4000-8000-000000000d01')$q$,
    'déjà été converti');
  perform public._t007_refuse(
    $q$update public.devis set remise = 1 where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'converti ne peut plus');
  perform public._t007_refuse(
    $q$update public.devis set statut = 'envoye' where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'converti ne peut plus');
  perform public._t007_refuse(
    $q$delete from public.lignes_devis where devis_id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'converti');

  -- Une seconde facture ne peut pas viser le même devis
  perform public._t007_refuse(
    format($q$insert into public.factures (entreprise_id, client_id, numero, devis_id) values ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000c1', 'FAC-DOUBLE', 'a0070000-0000-4000-8000-000000000d01')$q$),
    'uniq_factures_devis');
  -- Une facture ne peut pas viser un devis d'une autre entreprise
  perform public._t007_refuse(
    format($q$insert into public.factures (entreprise_id, client_id, numero, devis_id) values ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000c1', 'FAC-B', 'a0070000-0000-4000-8000-0000000000d2')$q$),
    'même entreprise');

  -- Devis sans ligne (écrit puis accepté par le commercial)
  insert into public.devis (id, entreprise_id, client_id) values
    ('a0070000-0000-4000-8000-000000000d03', 'a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000c1');
  update public.devis set statut = 'envoye' where id = 'a0070000-0000-4000-8000-000000000d03';
  update public.devis set statut = 'accepte' where id = 'a0070000-0000-4000-8000-000000000d03';
  perform public._t007_refuse(
    $q$select public.convertir_devis('a0070000-0000-4000-8000-000000000d03')$q$,
    'aucune ligne');

  -- Remise supérieure au HT : plafonnée par la vue, copiée telle quelle, même TTC
  insert into public.devis (id, entreprise_id, client_id, remise) values
    ('a0070000-0000-4000-8000-000000000d04', 'a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000c1', 500);
  insert into public.lignes_devis (entreprise_id, devis_id, description, prix_unitaire, taux_tva) values
    ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-000000000d04', 'Petite ligne', 100, 20);
  update public.devis set statut = 'envoye' where id = 'a0070000-0000-4000-8000-000000000d04';
  update public.devis set statut = 'accepte' where id = 'a0070000-0000-4000-8000-000000000d04';
  v_facture := public.convertir_devis('a0070000-0000-4000-8000-000000000d04');
  select count(*) into n
    from public.devis_totaux d, public.factures_totaux t, public.factures fa
   where d.devis_id = 'a0070000-0000-4000-8000-000000000d04' and t.facture_id = v_facture and fa.id = v_facture
     and d.total_ttc = 0 and t.total_ttc = 0 and d.remise_appliquee = 100 and t.remise_appliquee = 100 and fa.remise = 500;
  if n <> 1 then raise exception 'ÉCHEC : remise plafonnée incohérente entre le devis et la facture'; end if;

  -- Client supprimé : préparation d'un devis accepté (la suppression du client se fait en section 10)
  insert into public.devis (id, entreprise_id, client_id) values
    ('a0070000-0000-4000-8000-000000000d05', 'a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000c3');
  insert into public.lignes_devis (entreprise_id, devis_id, description, prix_unitaire) values
    ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-000000000d05', 'Ligne', 10);
  update public.devis set statut = 'envoye' where id = 'a0070000-0000-4000-8000-000000000d05';
  update public.devis set statut = 'accepte' where id = 'a0070000-0000-4000-8000-000000000d05';
end $$;

-- 10. Manager : client supprimé, suppression logique, numéro non réutilisé, facture supprimée
select set_config('request.jwt.claims', '{"sub":"a0070000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare v_numero text; v_nouveau text; n int;
begin
  update public.clients set deleted_at = now() where id = 'a0070000-0000-4000-8000-0000000000c3';
  perform public._t007_refuse(
    $q$select public.convertir_devis('a0070000-0000-4000-8000-000000000d05')$q$,
    'client de ce devis a été supprimé');

  perform public._t007_refuse(
    $q$update public.devis set deleted_at = now() where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'converti ne peut plus');

  -- Le numéro le plus élevé est supprimé logiquement : il n'est pas réattribué
  select numero into v_numero from public.devis where id = 'a0070000-0000-4000-8000-000000000d05';
  update public.devis set deleted_at = now() where id = 'a0070000-0000-4000-8000-000000000d05';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : le manager n''a pas pu supprimer un devis non converti'; end if;
  insert into public.devis (entreprise_id, client_id) values
    ('a0070000-0000-4000-8000-0000000000e1', 'a0070000-0000-4000-8000-0000000000c1')
    returning numero into v_nouveau;
  if v_nouveau <= v_numero then
    raise exception 'ÉCHEC : numéro % réattribué après suppression de %', v_nouveau, v_numero;
  end if;
  perform public._t007_refuse(
    $q$select public.convertir_devis('a0070000-0000-4000-8000-000000000d05')$q$,
    'introuvable');

  -- Facture issue d'un devis supprimée : le devis reste converti, sans reconversion
  update public.factures set deleted_at = now() where devis_id = 'a0070000-0000-4000-8000-000000000d04';
  select count(*) into n from public.devis where id = 'a0070000-0000-4000-8000-000000000d04' and statut = 'converti';
  if n <> 1 then raise exception 'ÉCHEC : le devis a quitté le statut converti après suppression de sa facture'; end if;
  perform public._t007_refuse(
    $q$select public.convertir_devis('a0070000-0000-4000-8000-000000000d04')$q$,
    'déjà été converti');
end $$;

-- 11. Admin (A) : suppression définitive permise sauf devis converti
select set_config('request.jwt.claims', '{"sub":"a0070000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$
declare n int;
begin
  perform public._t007_refuse(
    $q$delete from public.devis where id = 'a0070000-0000-4000-8000-000000000d01'$q$,
    'converti ne peut plus être supprimé');
  delete from public.devis where id = 'a0070000-0000-4000-8000-000000000d02';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ÉCHEC : l''admin n''a pas pu supprimer définitivement un devis'; end if;
end $$;

-- 12. Retour en postgres : état attendu et audit
reset role;
select set_config('request.jwt.claims', '', true);
do $$
declare n int;
begin
  select count(*) into n from public.devis
   where id = 'a0070000-0000-4000-8000-0000000000d2' and remise = 0 and statut = 'accepte';
  if n <> 1 then raise exception 'ÉCHEC état final : le devis de B a été modifié'; end if;

  -- Retour accepté → envoyé tracé, avec son auteur (le manager)
  select count(*) into n from public.audit_events
   where table_name = 'devis' and record_id = 'a0070000-0000-4000-8000-000000000d01'
     and action = 'update' and old_data ->> 'statut' = 'accepte' and new_data ->> 'statut' = 'envoye'
     and user_id = 'a0070000-0000-4000-8000-000000000004';
  if n <> 1 then raise exception 'ÉCHEC audit : retour accepté → envoyé non tracé (% ligne(s))', n; end if;

  select count(*) into n from public.audit_events
   where table_name = 'devis' and record_id = 'a0070000-0000-4000-8000-000000000d01'
     and old_data ->> 'statut' = 'accepte' and new_data ->> 'statut' = 'converti';
  if n <> 1 then raise exception 'ÉCHEC audit : conversion non tracée'; end if;

  select count(*) into n from public.audit_events
   where table_name = 'lignes_devis' and entreprise_id = 'a0070000-0000-4000-8000-0000000000e1';
  if n < 3 then raise exception 'ÉCHEC audit : % événement(s) sur lignes_devis', n; end if;

  -- Une facture supprimée reste liée à son devis
  select count(*) into n from public.factures
   where devis_id = 'a0070000-0000-4000-8000-000000000d04' and deleted_at is not null;
  if n <> 1 then raise exception 'ÉCHEC état final : lien perdu entre le devis et sa facture supprimée'; end if;
end $$;

do $$ begin
  raise notice 'Tous les tests des devis 007 sont passés.';
end $$;

rollback;
