-- 015_description_lignes.sql — LaGestion
-- Vérifie la migration 015 (désignation obligatoire sur les lignes) :
--   - texte_vide : vide, espaces, tabulation, espace insécable et espace fine insécable ;
--   - lignes de facture et de devis : description vide refusée à l'insertion et à la modification, normale acceptée ;
--   - brouillon enregistré par enregistrer_facture avec une ligne vide : refusé ;
--   - contraintes présentes et validées (aucune ligne vide ne restait).
-- La correction des brouillons existants est vérifiée par le rejeu de la migration sur une base de test.
-- À lancer après migrations/015_description_lignes.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0150…) : entreprise …00e1, commercial …0001, client …00c1,
-- facture brouillon …0f01, devis brouillon …0d01.

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role) values
  ('a0150000-0000-4000-8000-000000000001', 'test-015-1@lagestion.invalid', 'authenticated', 'authenticated');
insert into public.entreprises (id, nom) values ('a0150000-0000-4000-8000-0000000000e1', 'Entreprise (test 015)');
insert into public.memberships (entreprise_id, user_id, role) values
  ('a0150000-0000-4000-8000-0000000000e1', 'a0150000-0000-4000-8000-000000000001', 'commercial');
insert into public.clients (id, entreprise_id, nom, type) values
  ('a0150000-0000-4000-8000-0000000000c1', 'a0150000-0000-4000-8000-0000000000e1', 'Client (test 015)', 'entreprise');

create function public._t015_refuse(p_sql text, p_extrait text) returns void
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
grant execute on function public._t015_refuse(text, text) to authenticated;

-- 2. Règle et contraintes
do $$
begin
  if not (public.texte_vide('') and public.texte_vide('   ') and public.texte_vide(E'\t\n')
          and public.texte_vide(E' ') and public.texte_vide(E'   ') and public.texte_vide(null)) then
    raise exception 'ÉCHEC : texte_vide ne reconnaît pas un texte vide';
  end if;
  if public.texte_vide('Pose de carrelage') or public.texte_vide(E' x') then
    raise exception 'ÉCHEC : texte_vide refuse un texte renseigné';
  end if;
  if (select count(*) from pg_constraint
       where conname in ('lignes_facture_description_non_vide', 'lignes_devis_description_non_vide')
         and contype = 'c' and convalidated) <> 2 then
    raise exception 'ÉCHEC : contraintes de description absentes ou non validées';
  end if;
end $$;

-- 3. Commercial : facture et devis brouillons
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0150000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into public.factures (id, entreprise_id, client_id, date_echeance)
values ('a0150000-0000-4000-8000-000000000f01', 'a0150000-0000-4000-8000-0000000000e1', 'a0150000-0000-4000-8000-0000000000c1',
        public.date_du_jour_paris() + 30);
insert into public.lignes_facture (id, entreprise_id, facture_id, description, quantite, prix_unitaire, taux_tva, position)
values ('a0150000-0000-4000-8000-0000000001f1', 'a0150000-0000-4000-8000-0000000000e1', 'a0150000-0000-4000-8000-000000000f01',
        'Pose de carrelage', 1, 100, 20, 0);

insert into public.devis (id, entreprise_id, client_id)
values ('a0150000-0000-4000-8000-000000000d01', 'a0150000-0000-4000-8000-0000000000e1', 'a0150000-0000-4000-8000-0000000000c1');
insert into public.lignes_devis (id, entreprise_id, devis_id, description, quantite, prix_unitaire, taux_tva, position)
values ('a0150000-0000-4000-8000-0000000001d1', 'a0150000-0000-4000-8000-0000000000e1', 'a0150000-0000-4000-8000-000000000d01',
        'Pose de carrelage', 1, 100, 20, 0);

do $$
declare
  v text;
begin
  foreach v in array array['', '   ', E'\t', E' ', E' '] loop
    perform public._t015_refuse(format($q$insert into public.lignes_facture (entreprise_id, facture_id, description, quantite, prix_unitaire, taux_tva, position)
      values ('a0150000-0000-4000-8000-0000000000e1', 'a0150000-0000-4000-8000-000000000f01', %L, 1, 10, 20, 1)$q$, v),
      'lignes_facture_description_non_vide');
    perform public._t015_refuse(format($q$update public.lignes_facture set description = %L
      where id = 'a0150000-0000-4000-8000-0000000001f1'$q$, v), 'lignes_facture_description_non_vide');
    perform public._t015_refuse(format($q$insert into public.lignes_devis (entreprise_id, devis_id, description, quantite, prix_unitaire, taux_tva, position)
      values ('a0150000-0000-4000-8000-0000000000e1', 'a0150000-0000-4000-8000-000000000d01', %L, 1, 10, 20, 1)$q$, v),
      'lignes_devis_description_non_vide');
    perform public._t015_refuse(format($q$update public.lignes_devis set description = %L
      where id = 'a0150000-0000-4000-8000-0000000001d1'$q$, v), 'lignes_devis_description_non_vide');
  end loop;

  -- Enregistrement d'un brouillon par la fonction de l'application
  perform public._t015_refuse($q$select public.enregistrer_facture('a0150000-0000-4000-8000-000000000f01', '{}'::jsonb,
    '[{"description": "  ", "quantite": 1, "prix_unitaire": 10, "taux_tva": 20, "remise": 0, "position": 0}]'::jsonb)$q$,
    'lignes_facture_description_non_vide');
  perform public.enregistrer_facture('a0150000-0000-4000-8000-000000000f01', '{}'::jsonb,
    '[{"description": "Dépose de l''ancien sol", "quantite": 1, "prix_unitaire": 10, "taux_tva": 20, "remise": 0, "position": 0}]'::jsonb);
  if (select description from public.lignes_facture where facture_id = 'a0150000-0000-4000-8000-000000000f01') <> 'Dépose de l''ancien sol' then
    raise exception 'ÉCHEC : description normale non enregistrée';
  end if;
end $$;

reset role;
rollback;
