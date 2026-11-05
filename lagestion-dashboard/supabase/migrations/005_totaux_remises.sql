-- 005_totaux_remises.sql — Lagestion
-- Une seule règle de calcul des totaux (option B), identique à calculerTotaux (src/utils/facture.js) :
--   1. HT de ligne = max(0, round(quantité × prix unitaire, 2) − remise de ligne) ;
--   2. remise globale plafonnée au HT brut, répartie au prorata de la base de chaque taux
--      (plus fort reste ; à reste égal, le taux le plus élevé reçoit le centime) ;
--   3. TVA arrondie au centime par taux sur la base remisée ; TTC = HT net + TVA.
-- S'applique après 004_secteur_clients.sql. Rejouable sans erreur.
-- Colonnes existantes conservées dans le même ordre (total_ht devient le HT net), deux colonnes ajoutées.
-- La vue reste en security_invoker : la RLS des tables sous-jacentes s'applique à l'appelant.
-- Ne modifie aucune donnée ; liste en NOTICE les factures non brouillon dont le TTC change.

begin;

create or replace view public.factures_totaux with (security_invoker = on) as
with lignes as (
  select l.facture_id, l.taux_tva,
    greatest(0, round(l.quantite * l.prix_unitaire, 2) - l.remise) * 100 as ht_c
  from public.lignes_facture l
),
bases as (
  select facture_id, taux_tva, sum(ht_c) as base_c
  from lignes group by facture_id, taux_tva
),
fac as (
  select f.id as facture_id,
    coalesce(sum(b.base_c), 0) as ht_brut_c,
    least(f.remise * 100, coalesce(sum(b.base_c), 0)) as remise_c
  from public.factures f
  left join bases b on b.facture_id = f.id
  group by f.id, f.remise
),
parts as (
  select b.facture_id, b.taux_tva, b.base_c, fa.remise_c,
    case when fa.ht_brut_c = 0 then 0 else div(fa.remise_c * b.base_c, fa.ht_brut_c) end as part_c,
    case when fa.ht_brut_c = 0 then 0 else mod(fa.remise_c * b.base_c, fa.ht_brut_c) end as reste
  from bases b join fac fa on fa.facture_id = b.facture_id
),
rangs as (
  select p.*,
    row_number() over (partition by facture_id order by reste desc, taux_tva desc) as rang,
    remise_c - sum(part_c) over (partition by facture_id) as a_repartir
  from parts p
),
nettes as (
  select facture_id, taux_tva,
    base_c - part_c - case when rang <= a_repartir then 1 else 0 end as base_nette_c
  from rangs
),
tva as (
  select facture_id, sum(round(base_nette_c * taux_tva / 100)) as tva_c
  from nettes group by facture_id
)
select fa.facture_id,
  round((fa.ht_brut_c - fa.remise_c) / 100, 2) as total_ht,
  round(coalesce(t.tva_c, 0) / 100, 2) as total_tva,
  round((fa.ht_brut_c - fa.remise_c + coalesce(t.tva_c, 0)) / 100, 2) as total_ttc,
  round(fa.ht_brut_c / 100, 2) as total_ht_brut,
  round(fa.remise_c / 100, 2) as remise_appliquee
from fac fa
left join tva t on t.facture_id = fa.facture_id;

-- Contrôle : la vue doit rester en security_invoker (sinon elle contournerait la RLS).
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_options_to_table(c.reloptions) o
    where n.nspname = 'public' and c.relname = 'factures_totaux'
      and o.option_name = 'security_invoker' and lower(o.option_value) in ('on', 'true', '1', 'yes')
  ) then
    raise exception 'Contrôle : la vue public.factures_totaux n''est pas en security_invoker';
  end if;
end $$;

-- Factures non brouillon dont le TTC change par rapport à la règle précédente de l'application
-- (remise globale retirée du TTC, sans arrondi par ligne ni par taux). Information seulement.
do $$
declare r record; n integer := 0;
begin
  for r in
    select f.numero, f.statut,
      round(greatest(0, coalesce(sum(greatest(0, l.quantite * l.prix_unitaire - l.remise) * (1 + l.taux_tva / 100)), 0) - f.remise), 2) as ancien_ttc,
      t.total_ttc as nouveau_ttc
    from public.factures f
    join public.factures_totaux t on t.facture_id = f.id
    left join public.lignes_facture l on l.facture_id = f.id
    where f.deleted_at is null and f.statut <> 'brouillon'
    group by f.id, f.numero, f.statut, f.remise, t.total_ttc
    having round(greatest(0, coalesce(sum(greatest(0, l.quantite * l.prix_unitaire - l.remise) * (1 + l.taux_tva / 100)), 0) - f.remise), 2) <> t.total_ttc
    order by f.numero
  loop
    n := n + 1;
    raise notice 'TTC modifié : % (%) — ancien % €, nouveau % €', r.numero, r.statut, r.ancien_ttc, r.nouveau_ttc;
  end loop;
  raise notice 'Factures non brouillon dont le TTC change : %', n;
end $$;

commit;
