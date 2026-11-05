-- 005_totaux.sql — Lagestion
-- Vérifie la vue public.factures_totaux (règle B) sur les cas de tests/cas_totaux.json.
-- À lancer après migrations/005_totaux_remises.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Tout se déroule dans une transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ;
-- sinon le premier test en échec lève une erreur « ÉCHEC : … ».

begin;

insert into public.entreprises (id, nom) values
  ('a0050000-0000-4000-8000-0000000000e0', 'Entreprise totaux (test)');
insert into public.clients (id, entreprise_id, nom) values
  ('a0050000-0000-4000-8000-0000000000c1', 'a0050000-0000-4000-8000-0000000000e0', 'Client totaux');

-- Cas : numéro, remise globale, résultats attendus en centimes (mêmes valeurs que cas_totaux.json)
create temp table _cas (n int, remise numeric, ht_brut int, remise_app int, ht int, tva int, ttc int);
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

create temp table _lignes (n int, quantite numeric, prix_unitaire numeric, taux_tva numeric, remise numeric);
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

insert into public.factures (id, entreprise_id, client_id, numero, remise)
select ('a0050000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'a0050000-0000-4000-8000-0000000000e0', 'a0050000-0000-4000-8000-0000000000c1', 'T005-' || n, remise
from _cas;

insert into public.lignes_facture (entreprise_id, facture_id, description, quantite, prix_unitaire, taux_tva, remise)
select 'a0050000-0000-4000-8000-0000000000e0', ('a0050000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'Ligne ' || n, quantite, prix_unitaire, taux_tva, remise
from _lignes;

-- 1. Totaux de chaque cas
do $$
declare r record;
begin
  for r in
    select c.*, t.total_ht_brut, t.remise_appliquee, t.total_ht, t.total_tva, t.total_ttc
    from _cas c
    left join public.factures_totaux t on t.facture_id = ('a0050000-0000-4000-8000-' || lpad(c.n::text, 12, '0'))::uuid
    order by c.n
  loop
    if r.total_ttc is null then
      raise exception 'ÉCHEC cas % : facture absente de la vue', r.n;
    end if;
    if (r.total_ht_brut * 100, r.remise_appliquee * 100, r.total_ht * 100, r.total_tva * 100, r.total_ttc * 100)
       is distinct from (r.ht_brut::numeric, r.remise_app::numeric, r.ht::numeric, r.tva::numeric, r.ttc::numeric) then
      raise exception 'ÉCHEC cas % : obtenu HT brut %, remise %, HT %, TVA %, TTC % ; attendu (centimes) %, %, %, %, %',
        r.n, r.total_ht_brut, r.remise_appliquee, r.total_ht, r.total_tva, r.total_ttc,
        r.ht_brut, r.remise_app, r.ht, r.tva, r.ttc;
    end if;
  end loop;
end $$;

-- 2. La vue reste en security_invoker
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_options_to_table(c.reloptions) o
    where n.nspname = 'public' and c.relname = 'factures_totaux'
      and o.option_name = 'security_invoker' and lower(o.option_value) in ('on', 'true', '1', 'yes')
  ) then
    raise exception 'ÉCHEC : la vue public.factures_totaux n''est pas en security_invoker';
  end if;
end $$;

-- 3. Un utilisateur sans appartenance ne voit aucun total de cette entreprise
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0050000-0000-4000-8000-000000000099","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.factures_totaux
             where facture_id = 'a0050000-0000-4000-8000-000000000002') then
    raise exception 'ÉCHEC : la vue expose les totaux d''une autre entreprise';
  end if;
end $$;
reset role;

rollback;
