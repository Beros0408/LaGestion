-- 010_acomptes.sql — Lagestion
-- Factures d'acompte et facture de solde (FR-007).
--   - types 'acompte' et 'solde' dans public.factures : même série FAC, même finalisation que la migration 008 ;
--   - acompte : depuis un devis accepté, en pourcentage ou en montant TTC, une ligne par taux, calculé en base ;
--     ses lignes sont vérifiées à la finalisation contre ce calcul ;
--   - plafonds sous verrou du devis : cumul strictement inférieur au TTC, base et TVA par taux ;
--   - devis avec acompte non annulé : ne quitte plus « accepté », n'est plus supprimé ;
--   - conversion : facture de solde s'il reste des acomptes nets, sinon facture normale ; refus si un acompte est
--     encore en brouillon ;
--   - acomptes_deduits : fixé par le trigger à la création du solde. Dès lors, un acompte n'accepte plus d'avoir,
--     la liste ne peut donc plus changer. Déduction par soustraction, taux par taux, jamais par recalcul ;
--   - brouillon de solde : modifiable, non supprimable ; une base par taux négative refuse la finalisation ;
--   - avoir total sur un solde : une ligne par taux, au montant net figé (les lignes du devis sont brutes).
-- Corrige aussi : verifier_devis (le statut converti exigeait une facture liée quelconque), lire_origine_avoir,
-- verifier_facture et factures_soldes (qui ne connaissaient que les types facture et avoir).
-- Comme les migrations 003, 007, 008 et 009, les règles ne s'appliquent qu'à un utilisateur authentifié :
-- le SQL Editor (rôle postgres, seed) reste libre, sauf les contrôles de plafond et le numéro d'un document émis.
-- Mentions légales : uniquement la référence au devis et le tableau des acomptes déduits.
-- S'applique après 009_avoirs.sql. Rejouable sans erreur.

begin;

-- 1. Colonnes et contraintes
alter table public.factures
  add column if not exists acompte_mode text,
  add column if not exists acompte_valeur numeric(14,2),
  add column if not exists acomptes_deduits jsonb;

alter table public.factures drop constraint if exists factures_type_check;
alter table public.factures add constraint factures_type_check
  check (type in ('facture', 'avoir', 'acompte', 'solde'));

alter table public.factures drop constraint if exists factures_acompte_mode_check;
alter table public.factures add constraint factures_acompte_mode_check
  check (acompte_mode is null or acompte_mode in ('pourcentage', 'montant'));

alter table public.factures drop constraint if exists factures_avoir_coherent;
alter table public.factures add constraint factures_avoir_coherent check (
  (type = 'avoir' and facture_origine_id is not null and coalesce(trim(motif), '') <> '' and devis_id is null)
  or (type = 'facture' and facture_origine_id is null and not avoir_total)
  or (type = 'acompte' and facture_origine_id is null and not avoir_total and devis_id is not null
      and acompte_mode is not null and acompte_valeur > 0)
  or (type = 'solde' and facture_origine_id is null and not avoir_total and devis_id is not null
      and acomptes_deduits is not null)
);

-- Un devis peut avoir plusieurs acomptes, mais une seule facture ou facture de solde.
drop index if exists public.uniq_factures_devis;
create unique index uniq_factures_devis on public.factures(devis_id)
  where devis_id is not null and type in ('facture', 'solde');

create index if not exists idx_factures_devis on public.factures(devis_id) where devis_id is not null;

-- 2. Totaux d'un devis avec le détail par taux : même règle que devis_totaux et totaux_facture_calcules
create or replace function public.totaux_devis_calcules(p_devis uuid) returns jsonb
language sql stable set search_path = public as $$
  with lignes as (
    select l.taux_tva, greatest(0, round(l.quantite * l.prix_unitaire, 2) - l.remise) * 100 as ht_c
    from public.lignes_devis l
    where l.devis_id = p_devis
  ),
  bases as (
    select taux_tva, sum(ht_c) as base_c from lignes group by taux_tva
  ),
  dev as (
    select coalesce(sum(b.base_c), 0) as ht_brut_c,
           least((select d.remise from public.devis d where d.id = p_devis) * 100, coalesce(sum(b.base_c), 0)) as remise_c
    from bases b
  ),
  parts as (
    select b.taux_tva, b.base_c, de.remise_c,
      case when de.ht_brut_c = 0 then 0 else div(de.remise_c * b.base_c, de.ht_brut_c) end as part_c,
      case when de.ht_brut_c = 0 then 0 else mod(de.remise_c * b.base_c, de.ht_brut_c) end as reste
    from bases b cross join dev de
  ),
  rangs as (
    select p.*,
      row_number() over (order by reste desc, taux_tva desc) as rang,
      remise_c - sum(part_c) over () as a_repartir
    from parts p
  ),
  nettes as (
    select taux_tva, base_c - part_c - case when rang <= a_repartir then 1 else 0 end as base_nette_c
    from rangs
  ),
  tva as (
    select taux_tva, base_nette_c, round(base_nette_c * taux_tva / 100) as tva_c from nettes
  ),
  somme as (
    select coalesce(sum(tva_c), 0) as tva_c,
      coalesce(jsonb_agg(jsonb_build_object(
        'taux', taux_tva,
        'base', round(base_nette_c / 100, 2),
        'tva', round(tva_c / 100, 2)) order by taux_tva desc), '[]'::jsonb) as detail
    from tva
  )
  select jsonb_build_object(
    'total_ht', round((de.ht_brut_c - de.remise_c) / 100, 2),
    'total_tva', round(s.tva_c / 100, 2),
    'total_ttc', round((de.ht_brut_c - de.remise_c + s.tva_c) / 100, 2),
    'tva_detail', s.detail)
  from dev de cross join somme s
$$;

-- 3. Calcul d'un acompte : base et TVA par taux, au prorata des bases nettes du devis.
--    En montant TTC, certains TTC sont inatteignables avec une TVA arrondie : le résultat peut s'écarter d'un centime.
create or replace function public.calculer_acompte(p_devis uuid, p_mode text, p_valeur numeric) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_totaux jsonb := public.totaux_devis_calcules(p_devis);
  v_ttc numeric := (v_totaux->>'total_ttc')::numeric;
  v_detail jsonb := '[]'::jsonb;
  r record;
  v_base numeric; v_tva numeric; v_ligne_ttc numeric;
  v_total_ht numeric := 0; v_total_tva numeric := 0;
begin
  if v_ttc <= 0 then
    raise exception 'Ce devis n''a aucun montant à facturer.';
  end if;
  if p_mode = 'pourcentage' then
    if p_valeur is null or p_valeur <= 0 or p_valeur >= 100 then
      raise exception 'Le pourcentage de l''acompte doit être compris entre 0 et 100, bornes exclues.';
    end if;
  elsif p_mode = 'montant' then
    if p_valeur is null or p_valeur <= 0 or p_valeur >= v_ttc then
      raise exception 'Le montant de l''acompte doit être positif et inférieur au TTC du devis (% €).', v_ttc;
    end if;
  else
    raise exception 'Mode d''acompte inconnu.';
  end if;

  -- Répartition du montant TTC au plus fort reste, en centimes ; à reste égal, le taux le plus élevé.
  for r in
    with lignes as (
      select (d->>'taux')::numeric as taux, (d->>'base')::numeric as base, (d->>'tva')::numeric as tva
      from jsonb_array_elements(v_totaux->'tva_detail') d
      where (d->>'base')::numeric > 0
    ),
    parts as (
      select l.*, div(round(p_valeur * 100) * round((l.base + l.tva) * 100), round(v_ttc * 100)) as part_c,
             mod(round(p_valeur * 100) * round((l.base + l.tva) * 100), round(v_ttc * 100)) as reste
      from lignes l
    ),
    rangs as (
      select p.*, row_number() over (order by reste desc, taux desc) as rang,
             round(p_valeur * 100) - sum(part_c) over () as a_repartir
      from parts p
    )
    select taux, base, part_c + case when rang <= a_repartir then 1 else 0 end as ttc_c
    from rangs order by taux desc
  loop
    if p_mode = 'pourcentage' then
      v_base := round(r.base * p_valeur / 100, 2);
    else
      v_base := round(r.ttc_c / 100 / (1 + r.taux / 100), 2);
    end if;
    continue when v_base <= 0;
    v_tva := round(v_base * r.taux / 100, 2);
    v_total_ht := v_total_ht + v_base;
    v_total_tva := v_total_tva + v_tva;
    v_detail := v_detail || jsonb_build_object('taux', r.taux, 'base', v_base, 'tva', v_tva);
  end loop;

  if jsonb_array_length(v_detail) = 0 then
    raise exception 'Ce montant d''acompte est trop faible.';
  end if;
  return jsonb_build_object('tva_detail', v_detail, 'total_ht', v_total_ht, 'total_tva', v_total_tva,
                            'total_ttc', v_total_ht + v_total_tva);
end $$;

-- 4. Acomptes finalisés d'un devis, nets de leurs avoirs ; un acompte entièrement annulé n'y figure plus.
create or replace function public.acomptes_nets(p_devis uuid) returns jsonb
language plpgsql set search_path = public as $$
declare
  a public.factures;
  d record;
  v_base numeric; v_tva numeric;
  v_detail jsonb;
  v_ht numeric; v_total_tva numeric;
  v_resultat jsonb := '[]'::jsonb;
begin
  for a in
    select * from public.factures
     where devis_id = p_devis and type = 'acompte' and statut <> 'brouillon' and deleted_at is null
     order by date_emission, numero
  loop
    v_detail := '[]'::jsonb; v_ht := 0; v_total_tva := 0;
    for d in
      select (e->>'taux')::numeric as taux, (e->>'base')::numeric as base, (e->>'tva')::numeric as tva
      from jsonb_array_elements(a.tva_detail) e
    loop
      select d.base + coalesce(sum((x->>'base')::numeric), 0), d.tva + coalesce(sum((x->>'tva')::numeric), 0)
        into v_base, v_tva
        from public.factures av
        cross join lateral jsonb_array_elements(av.tva_detail) x
       where av.facture_origine_id = a.id and av.type = 'avoir' and av.statut <> 'brouillon'
         and (x->>'taux')::numeric = d.taux;
      if v_base <> 0 or v_tva <> 0 then
        v_detail := v_detail || jsonb_build_object('taux', d.taux, 'base', v_base, 'tva', v_tva);
        v_ht := v_ht + v_base;
        v_total_tva := v_total_tva + v_tva;
      end if;
    end loop;
    if v_ht + v_total_tva > 0 then
      v_resultat := v_resultat || jsonb_build_object(
        'facture_id', a.id, 'numero', a.numero, 'date', a.date_emission,
        'total_ht', v_ht, 'total_tva', v_total_tva, 'total_ttc', v_ht + v_total_tva, 'detail', v_detail);
    end if;
  end loop;
  return v_resultat;
end $$;

-- 5. Plafonds d'un acompte : cumul strictement inférieur au TTC du devis ; base et TVA par taux sans dépassement.
create or replace function public.controler_plafond_acompte(p_devis uuid, p_detail jsonb, p_ttc numeric) returns void
language plpgsql set search_path = public as $$
declare
  v_totaux jsonb := public.totaux_devis_calcules(p_devis);
  v_nets jsonb := public.acomptes_nets(p_devis);
  v_deja numeric;
  l record;
  v_base_devis numeric; v_tva_devis numeric; v_base_deja numeric; v_tva_deja numeric;
begin
  select coalesce(sum((n->>'total_ttc')::numeric), 0) into v_deja from jsonb_array_elements(v_nets) n;
  if v_deja + p_ttc >= (v_totaux->>'total_ttc')::numeric then
    raise exception 'Acompte refusé : le cumul des acomptes doit rester inférieur au TTC du devis (% € déjà facturés sur % €, % € demandés).',
      v_deja, (v_totaux->>'total_ttc')::numeric, p_ttc;
  end if;
  for l in
    select (e->>'taux')::numeric as taux, (e->>'base')::numeric as base, (e->>'tva')::numeric as tva
    from jsonb_array_elements(p_detail) e
  loop
    select (d->>'base')::numeric, (d->>'tva')::numeric into v_base_devis, v_tva_devis
      from jsonb_array_elements(v_totaux->'tva_detail') d
     where (d->>'taux')::numeric = l.taux;
    if not found then
      raise exception 'Le devis ne comporte pas de TVA à % %%.', l.taux;
    end if;
    select coalesce(sum((x->>'base')::numeric), 0), coalesce(sum((x->>'tva')::numeric), 0) into v_base_deja, v_tva_deja
      from jsonb_array_elements(v_nets) n
      cross join lateral jsonb_array_elements(n->'detail') x
     where (x->>'taux')::numeric = l.taux;
    if v_base_deja + l.base > v_base_devis or v_tva_deja + l.tva > v_tva_devis then
      raise exception 'Acompte refusé : à % %% de TVA, le cumul dépasserait le devis (reste % € HT et % € de TVA).',
        l.taux, v_base_devis - v_base_deja, v_tva_devis - v_tva_deja;
    end if;
  end loop;
end $$;

-- 6. Totaux d'un solde : lignes moins acomptes déduits, taux par taux, jamais par recalcul.
create or replace function public.totaux_solde(p_facture uuid, p_remise numeric, p_deduits jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_calc jsonb := public.totaux_facture_calcules(p_facture, p_remise);
  r record;
  v_detail jsonb := '[]'::jsonb;
  v_ht numeric := 0; v_tva numeric := 0;
begin
  for r in
    with lignes as (
      select (d->>'taux')::numeric as taux, (d->>'base')::numeric as base, (d->>'tva')::numeric as tva
      from jsonb_array_elements(v_calc->'tva_detail') d
    ),
    deduits as (
      select (x->>'taux')::numeric as taux, sum((x->>'base')::numeric) as base, sum((x->>'tva')::numeric) as tva
      from jsonb_array_elements(p_deduits) n
      cross join lateral jsonb_array_elements(n->'detail') x
      group by 1
    )
    select coalesce(l.taux, d.taux) as taux,
           coalesce(l.base, 0) - coalesce(d.base, 0) as base,
           coalesce(l.tva, 0) - coalesce(d.tva, 0) as tva
    from lignes l full join deduits d on d.taux = l.taux
    order by 1 desc
  loop
    if r.base < 0 or r.tva < 0 then
      raise exception 'Facture de solde refusée : à % %% de TVA, les acomptes déduits dépassent les lignes.', r.taux;
    end if;
    if r.base <> 0 or r.tva <> 0 then
      v_detail := v_detail || jsonb_build_object('taux', r.taux, 'base', r.base, 'tva', r.tva);
      v_ht := v_ht + r.base;
      v_tva := v_tva + r.tva;
    end if;
  end loop;
  if v_ht + v_tva <= 0 then
    raise exception 'Facture de solde refusée : les acomptes couvrent tout le montant.';
  end if;
  return jsonb_build_object(
    'total_ht_brut', (v_calc->>'total_ht_brut')::numeric,
    'remise_appliquee', (v_calc->>'remise_appliquee')::numeric,
    'total_ht', v_ht, 'total_tva', v_tva, 'total_ttc', v_ht + v_tva, 'tva_detail', v_detail);
end $$;

revoke all on function public.totaux_devis_calcules(uuid) from public, anon;
revoke all on function public.calculer_acompte(uuid, text, numeric) from public, anon;
revoke all on function public.acomptes_nets(uuid) from public, anon;
revoke all on function public.controler_plafond_acompte(uuid, jsonb, numeric) from public, anon;
revoke all on function public.totaux_solde(uuid, numeric, jsonb) from public, anon;
grant execute on function public.totaux_devis_calcules(uuid) to authenticated;
grant execute on function public.calculer_acompte(uuid, text, numeric) to authenticated;
grant execute on function public.acomptes_nets(uuid) to authenticated;
grant execute on function public.controler_plafond_acompte(uuid, jsonb, numeric) to authenticated;
grant execute on function public.totaux_solde(uuid, numeric, jsonb) to authenticated;

-- 7. Facture d'origine d'un avoir : reprend la migration 009, avec les types acompte et solde.
--    Un acompte verrouille aussi son devis, pour exclure tout croisement avec une conversion.
create or replace function public.lire_origine_avoir(p_facture uuid) returns public.factures
language plpgsql set search_path = public as $$
declare
  f public.factures;
begin
  select * into f from public.factures where id = p_facture and deleted_at is null for no key update;
  if not found then
    raise exception 'La facture d''origine de cet avoir est introuvable.';
  end if;
  if f.type = 'avoir' then
    raise exception 'Un avoir ne peut porter que sur une facture.';
  end if;
  if f.statut = 'brouillon' then
    raise exception 'Finalisez cette facture avant de créer un avoir.';
  end if;
  if f.statut = 'annulee' then
    raise exception 'Cette facture est déjà annulée : aucun nouvel avoir n''est possible.';
  end if;
  if coalesce(f.total_ttc, 0) <= 0 then
    raise exception 'Cette facture n''a aucun montant à créditer.';
  end if;
  if f.type = 'acompte' then
    perform 1 from public.devis d where d.id = f.devis_id for no key update;
    if exists (select 1 from public.factures s where s.devis_id = f.devis_id and s.type in ('facture', 'solde')) then
      raise exception 'Cet acompte a été déduit d''une facture de solde : la correction passe par le solde.';
    end if;
  end if;
  return f;
end $$;

-- 8. Totaux d'un avoir : reprend la migration 009. Avoir total sur un solde : une ligne par taux, au montant net figé.
create or replace function public.totaux_avoir(p_avoir uuid, p_remise numeric, p_origine public.factures, p_total boolean)
returns jsonb
language plpgsql set search_path = public as $$
declare
  v_calc jsonb;
  v_ligne record;
  v_deja_ttc numeric;
  v_base_origine numeric; v_tva_origine numeric;
  v_base_deja numeric; v_tva_deja numeric;
  v_reste_base numeric; v_reste_tva numeric; v_tva numeric;
  v_total_tva numeric := 0;
  v_detail jsonb := '[]'::jsonb;
begin
  select coalesce(sum(-total_ttc), 0) into v_deja_ttc
    from public.factures
   where facture_origine_id = p_origine.id and type = 'avoir' and statut <> 'brouillon' and id <> p_avoir;

  if p_total then
    if v_deja_ttc <> 0 then
      raise exception 'Un avoir a déjà été finalisé sur cette facture : un avoir total n''est plus possible. Créez un avoir partiel.';
    end if;
    if p_origine.type = 'solde' then
      if exists (
        (select quantite * prix_unitaire - remise, taux_tva from public.lignes_facture where facture_id = p_avoir)
        except
        (select (d->>'base')::numeric, (d->>'taux')::numeric from jsonb_array_elements(p_origine.tva_detail) d)
      ) or (select count(*) from public.lignes_facture where facture_id = p_avoir) <> jsonb_array_length(p_origine.tva_detail) then
        raise exception 'Les lignes d''un avoir total doivent rester celles de la facture d''origine.';
      end if;
    elsif exists (
      (select description, quantite, prix_unitaire, taux_tva, remise from public.lignes_facture where facture_id = p_avoir
       except
       select description, quantite, prix_unitaire, taux_tva, remise from public.lignes_facture where facture_id = p_origine.id)
      union all
      (select description, quantite, prix_unitaire, taux_tva, remise from public.lignes_facture where facture_id = p_origine.id
       except
       select description, quantite, prix_unitaire, taux_tva, remise from public.lignes_facture where facture_id = p_avoir)
    ) then
      raise exception 'Les lignes d''un avoir total doivent rester celles de la facture d''origine.';
    end if;
    return jsonb_build_object(
      'total_ht_brut', case when p_origine.type = 'solde' then -p_origine.total_ht else -p_origine.total_ht_brut end,
      'remise_appliquee', case when p_origine.type = 'solde' then 0 else -p_origine.remise_appliquee end,
      'total_ht', -p_origine.total_ht,
      'total_tva', -p_origine.total_tva,
      'total_ttc', -p_origine.total_ttc,
      'tva_detail', (select coalesce(jsonb_agg(jsonb_build_object(
          'taux', (d->>'taux')::numeric,
          'base', -(d->>'base')::numeric,
          'tva', -(d->>'tva')::numeric) order by (d->>'taux')::numeric desc), '[]'::jsonb)
        from jsonb_array_elements(p_origine.tva_detail) d));
  end if;

  v_calc := public.totaux_facture_calcules(p_avoir, p_remise);
  if (v_calc->>'total_ttc')::numeric <= 0 then
    raise exception 'Le montant de cet avoir doit être positif.';
  end if;

  for v_ligne in
    select (d->>'taux')::numeric as taux, (d->>'base')::numeric as base, (d->>'tva')::numeric as tva
    from jsonb_array_elements(v_calc->'tva_detail') d
    order by 1 desc
  loop
    select (d->>'base')::numeric, (d->>'tva')::numeric into v_base_origine, v_tva_origine
      from jsonb_array_elements(p_origine.tva_detail) d
     where (d->>'taux')::numeric = v_ligne.taux;
    if not found then
      raise exception 'La facture d''origine ne comporte pas de TVA à % %%.', v_ligne.taux;
    end if;

    select coalesce(sum(-(d->>'base')::numeric), 0), coalesce(sum(-(d->>'tva')::numeric), 0) into v_base_deja, v_tva_deja
      from public.factures a
      cross join lateral jsonb_array_elements(a.tva_detail) d
     where a.facture_origine_id = p_origine.id and a.type = 'avoir' and a.statut <> 'brouillon' and a.id <> p_avoir
       and (d->>'taux')::numeric = v_ligne.taux;

    v_reste_base := v_base_origine - v_base_deja;
    v_reste_tva := v_tva_origine - v_tva_deja;
    if v_ligne.base > v_reste_base then
      raise exception 'Avoir refusé : à % %% de TVA, il reste % € HT à créditer sur cette facture, pour % € demandés.',
        v_ligne.taux, v_reste_base, v_ligne.base;
    end if;
    -- Base épuisée : la TVA prend le reste exact ; sinon la TVA calculée, sans jamais dépasser le reste.
    v_tva := case when v_ligne.base = v_reste_base then v_reste_tva else least(v_ligne.tva, v_reste_tva) end;
    v_total_tva := v_total_tva + v_tva;
    v_detail := v_detail || jsonb_build_object('taux', v_ligne.taux, 'base', -v_ligne.base, 'tva', -v_tva);
  end loop;

  if v_deja_ttc + (v_calc->>'total_ht')::numeric + v_total_tva > p_origine.total_ttc then
    raise exception 'Avoir refusé : le cumul des avoirs dépasserait le TTC de la facture (reste % € TTC à créditer).',
      p_origine.total_ttc - v_deja_ttc;
  end if;

  return jsonb_build_object(
    'total_ht_brut', -(v_calc->>'total_ht_brut')::numeric,
    'remise_appliquee', -(v_calc->>'remise_appliquee')::numeric,
    'total_ht', -(v_calc->>'total_ht')::numeric,
    'total_tva', -v_total_tva,
    'total_ttc', -((v_calc->>'total_ht')::numeric + v_total_tva),
    'tva_detail', v_detail);
end $$;

-- 9. Règles des documents : reprend verifier_facture (migration 009), avec les types acompte et solde
create or replace function public.verifier_facture() returns trigger
language plpgsql set search_path = public as $$
declare
  v_utilisateur constant boolean := auth.uid() is not null;
  v_jour date;
  v_emetteur public.entreprises;
  v_origine public.factures;
  v_devis public.devis;
  v_attendu jsonb;
  v_totaux jsonb;
begin
  if tg_op = 'DELETE' then
    if v_utilisateur and old.statut <> 'brouillon' then
      raise exception 'Une facture finalisée ne peut pas être supprimée. Sa correction passe par un avoir.';
    end if;
    if v_utilisateur and old.type = 'solde' then
      raise exception 'Un brouillon de facture de solde ne peut pas être supprimé : ses acomptes ne seraient jamais déduits.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if v_utilisateur then
      if new.statut <> 'brouillon' then
        raise exception 'Une nouvelle facture commence toujours au statut brouillon.';
      end if;
      if new.numero is not null and new.numero not like 'DEMO-%' then
        new.numero := null;
      end if;
      new.total_ht_brut := null; new.remise_appliquee := null; new.total_ht := null;
      new.total_tva := null; new.total_ttc := null; new.tva_detail := null;
      new.client_fige := null; new.emetteur_fige := null; new.finalisee_le := null;
      if new.type <> 'solde' then
        new.acomptes_deduits := null;
      end if;
      if new.type = 'avoir' then
        if coalesce(trim(new.motif), '') = '' then
          raise exception 'Le motif de l''avoir est obligatoire.';
        end if;
        v_origine := public.lire_origine_avoir(new.facture_origine_id);
        new.client_id := v_origine.client_id;
        new.date_echeance := null;
        new.remise := case when new.avoir_total and v_origine.type <> 'solde' then v_origine.remise else 0 end;
      elsif new.type = 'acompte' then
        select * into v_devis from public.devis where id = new.devis_id and deleted_at is null;
        if not found then
          raise exception 'Le devis de cet acompte est introuvable.';
        end if;
        if v_devis.statut <> 'accepte' then
          raise exception 'Un acompte ne peut porter que sur un devis accepté.';
        end if;
        new.client_id := v_devis.client_id;
        new.remise := 0;
      elsif new.type = 'facture' and new.devis_id is not null
            and jsonb_array_length(public.acomptes_nets(new.devis_id)) > 0 then
        raise exception 'Ce devis a des acomptes : seule une facture de solde peut en être issue.';
      end if;
    end if;
    -- Solde : la base fixe les déductions, y compris pour le seed. Plus aucun avoir sur ces acomptes ensuite.
    if new.type = 'solde' then
      if exists (select 1 from public.factures a where a.devis_id = new.devis_id and a.type = 'acompte'
                 and a.statut = 'brouillon' and a.deleted_at is null) then
        raise exception 'Un acompte de ce devis est encore en brouillon : finalisez-le ou supprimez-le.';
      end if;
      new.acomptes_deduits := public.acomptes_nets(new.devis_id);
      if jsonb_array_length(new.acomptes_deduits) = 0 then
        raise exception 'Ce devis n''a aucun acompte à déduire.';
      end if;
    end if;
    return new;
  end if;

  -- Sortie du brouillon : un utilisateur passe obligatoirement par la finalisation
  if old.statut = 'brouillon' and new.statut <> 'brouillon' then
    if v_utilisateur and new.statut = 'annulee' then
      raise exception 'Un brouillon ne s''annule pas : supprimez-le.';
    end if;
    if v_utilisateur and new.statut <> 'finalisee' then
      raise exception 'Une facture doit d''abord être finalisée.';
    end if;

    if new.type = 'avoir' then
      if v_utilisateur and not public.has_role(new.entreprise_id, '{admin,manager,comptable}'::public.app_role[]) then
        raise exception 'Seul un administrateur, un manager ou un comptable peut finaliser un avoir.'
          using errcode = 'insufficient_privilege';
      end if;
      v_origine := public.lire_origine_avoir(new.facture_origine_id);
    elsif new.type = 'acompte' then
      -- Verrou du devis : sérialise les acomptes entre eux et avec la conversion.
      select * into v_devis from public.devis where id = new.devis_id and deleted_at is null for no key update;
      if not found then
        raise exception 'Le devis de cet acompte est introuvable.';
      end if;
      if v_devis.statut <> 'accepte' then
        raise exception 'Ce devis n''est plus au statut accepté : l''acompte ne peut pas être finalisé.';
      end if;
    end if;

    if new.statut = 'finalisee' then
      if new.deleted_at is not null then
        raise exception 'Une facture supprimée ne peut pas être finalisée.';
      end if;
      if not exists (select 1 from public.lignes_facture l where l.facture_id = new.id) then
        raise exception 'Cette facture ne contient aucune ligne : finalisation impossible.';
      end if;
      v_jour := public.date_du_jour_paris();
      -- Un avoir reste possible pour un client supprimé : son identité vient de la facture d'origine.
      if new.type <> 'avoir' then
        if not exists (select 1 from public.clients c where c.id = new.client_id and c.deleted_at is null) then
          raise exception 'Le client de cette facture a été supprimé : finalisation impossible.';
        end if;
        if new.date_echeance is null then
          raise exception 'Renseignez une date d''échéance avant de finaliser cette facture.';
        end if;
        if new.date_echeance < v_jour then
          raise exception 'La date d''échéance de cette facture est dépassée. Corrigez-la avant de finaliser.';
        end if;
      end if;
      select * into v_emetteur from public.entreprises where id = new.entreprise_id;
      if coalesce(trim(v_emetteur.siret), '') = '' then
        raise exception 'Renseignez le SIRET de l''entreprise avant de finaliser une facture.';
      end if;
      if coalesce(trim(v_emetteur.adresse), '') = '' then
        raise exception 'Renseignez l''adresse de l''entreprise avant de finaliser une facture.';
      end if;
    end if;

    -- Totaux avant le numéro : aucun numéro n'est calculé tant qu'un contrôle peut encore échouer.
    if new.type = 'avoir' then
      v_totaux := public.totaux_avoir(new.id, new.remise, v_origine, new.avoir_total);
      new.client_fige := coalesce(v_origine.client_fige, public.instantane_client(new.client_id));
    elsif new.type = 'solde' then
      v_totaux := public.totaux_solde(new.id, new.remise, new.acomptes_deduits);
      new.client_fige := public.instantane_client(new.client_id);
    else
      v_totaux := public.totaux_facture_calcules(new.id, new.remise);
      new.client_fige := public.instantane_client(new.client_id);
      if new.type = 'acompte' then
        -- Les lignes doivent être celles du calcul en base, le devis accepté étant lui-même verrouillé.
        v_attendu := public.calculer_acompte(new.devis_id, new.acompte_mode, new.acompte_valeur);
        if exists (
          (select round(l.quantite * l.prix_unitaire, 2) - l.remise, l.taux_tva from public.lignes_facture l where l.facture_id = new.id
           except
           select (d->>'base')::numeric, (d->>'taux')::numeric from jsonb_array_elements(v_attendu->'tva_detail') d)
          union all
          (select (d->>'base')::numeric, (d->>'taux')::numeric from jsonb_array_elements(v_attendu->'tva_detail') d
           except
           select round(l.quantite * l.prix_unitaire, 2) - l.remise, l.taux_tva from public.lignes_facture l where l.facture_id = new.id)
        ) then
          raise exception 'Les lignes d''un acompte ne correspondent plus à son calcul : supprimez-le et recréez-le.';
        end if;
        perform public.controler_plafond_acompte(new.devis_id, v_totaux->'tva_detail', (v_totaux->>'total_ttc')::numeric);
      end if;
    end if;

    if new.statut = 'finalisee' then
      new.date_emission := v_jour;
      new.numero := case when new.type = 'avoir'
        then public.prochain_numero_avoir(new.entreprise_id, v_jour)
        else public.prochain_numero_facture(new.entreprise_id, v_jour) end;
    end if;

    new.total_ht_brut := (v_totaux->>'total_ht_brut')::numeric;
    new.remise_appliquee := (v_totaux->>'remise_appliquee')::numeric;
    new.total_ht := (v_totaux->>'total_ht')::numeric;
    new.total_tva := (v_totaux->>'total_tva')::numeric;
    new.total_ttc := (v_totaux->>'total_ttc')::numeric;
    new.tva_detail := v_totaux->'tva_detail';
    new.emetteur_fige := public.instantane_emetteur(new.entreprise_id);
    new.finalisee_le := now();
    return new;
  end if;

  if old.statut <> 'brouillon' and new.numero is distinct from old.numero then
    raise exception 'Le numéro d''une facture émise ne peut pas être modifié.';
  end if;

  if not v_utilisateur then
    return new;
  end if;

  if old.statut = 'brouillon' then
    if new.numero is distinct from old.numero then
      raise exception 'Le numéro d''une facture est attribué uniquement à la finalisation.';
    end if;
    if new.type is distinct from old.type or new.facture_origine_id is distinct from old.facture_origine_id
       or new.avoir_total is distinct from old.avoir_total or new.devis_id is distinct from old.devis_id
       or new.acompte_mode is distinct from old.acompte_mode or new.acompte_valeur is distinct from old.acompte_valeur
       or new.acomptes_deduits is distinct from old.acomptes_deduits then
      raise exception 'Le type d''un document et son document d''origine ne peuvent pas être modifiés.';
    end if;
    if new.type = 'solde' and new.deleted_at is not null and old.deleted_at is null then
      raise exception 'Un brouillon de facture de solde ne peut pas être supprimé : ses acomptes ne seraient jamais déduits.';
    end if;
    if new.type = 'avoir' then
      if coalesce(trim(new.motif), '') = '' then
        raise exception 'Le motif de l''avoir est obligatoire.';
      end if;
      if new.client_id is distinct from old.client_id or new.remise is distinct from old.remise
         or new.date_echeance is not null then
        raise exception 'Le client, la remise et l''échéance d''un avoir ne peuvent pas être modifiés.';
      end if;
    elsif new.type = 'acompte' then
      if new.client_id is distinct from old.client_id or new.remise is distinct from old.remise then
        raise exception 'Le client et la remise d''un acompte ne peuvent pas être modifiés.';
      end if;
    elsif new.type = 'solde' and new.client_id is distinct from old.client_id then
      raise exception 'Le client d''une facture de solde ne peut pas être modifié.';
    end if;
    new.total_ht_brut := null; new.remise_appliquee := null; new.total_ht := null;
    new.total_tva := null; new.total_ttc := null; new.tva_detail := null;
    new.client_fige := null; new.emetteur_fige := null; new.finalisee_le := null;
    return new;
  end if;

  -- Document émis : seuls le statut et les notes internes évoluent. devis_id peut passer à null
  -- (clé étrangère « on delete set null » lors de la suppression définitive du devis d'origine).
  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'Une facture finalisée ne peut pas être supprimée. Sa correction passe par un avoir.';
  end if;
  if row(new.client_id, new.date_emission, new.date_echeance, new.remise, new.conditions_paiement,
         new.mode_paiement, new.message_client, new.total_ht_brut, new.remise_appliquee, new.total_ht,
         new.total_tva, new.total_ttc, new.tva_detail, new.client_fige, new.emetteur_fige, new.finalisee_le,
         new.type, new.facture_origine_id, new.avoir_total, new.motif,
         new.acompte_mode, new.acompte_valeur, new.acomptes_deduits)
     is distinct from
     row(old.client_id, old.date_emission, old.date_echeance, old.remise, old.conditions_paiement,
         old.mode_paiement, old.message_client, old.total_ht_brut, old.remise_appliquee, old.total_ht,
         old.total_tva, old.total_ttc, old.tva_detail, old.client_fige, old.emetteur_fige, old.finalisee_le,
         old.type, old.facture_origine_id, old.avoir_total, old.motif,
         old.acompte_mode, old.acompte_valeur, old.acomptes_deduits)
     or (new.devis_id is distinct from old.devis_id and new.devis_id is not null) then
    raise exception 'Une facture finalisée ne peut plus être modifiée. Sa correction passe par un avoir.';
  end if;

  if new.statut is distinct from old.statut then
    if old.type = 'avoir' and not (old.statut = 'finalisee' and new.statut = 'envoyee') then
      raise exception 'Ce changement de statut n''est pas autorisé sur un avoir.';
    end if;
    if new.statut = 'brouillon' then
      raise exception 'Une facture finalisée ne peut pas repasser en brouillon.';
    end if;
    if new.statut = 'annulee' then
      -- Posé par annuler_facture_soldee, ou accepté seulement si les avoirs couvrent tout le TTC.
      if coalesce(old.total_ttc, 0) <= 0 or old.total_ttc <> (
        select coalesce(sum(-a.total_ttc), 0) from public.factures a
         where a.facture_origine_id = old.id and a.type = 'avoir' and a.statut <> 'brouillon'
      ) then
        raise exception 'L''annulation d''une facture finalisée passe par un avoir total.';
      end if;
    elsif old.statut = 'annulee' or new.statut = 'finalisee' then
      raise exception 'Ce changement de statut n''est pas autorisé.';
    end if;
  end if;

  return new;
end $$;

-- 10. Règles du devis : reprend verifier_devis (migration 007).
--     Le statut converti exige désormais une facture ou un solde : un acompte ne suffit plus.
create or replace function public.verifier_devis() returns trigger
language plpgsql set search_path = public as $$
declare
  v_contenu_modifie boolean;
  v_acompte_actif boolean;
begin
  if tg_op = 'DELETE' then
    if auth.uid() is not null then
      if old.statut = 'converti' then
        raise exception 'Un devis converti ne peut plus être supprimé.';
      end if;
      if exists (select 1 from public.factures f where f.devis_id = old.id and f.type = 'acompte') then
        raise exception 'Ce devis a des acomptes : il ne peut pas être supprimé.';
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.numero is null or new.numero not like 'DEV-DEMO-%' then
      new.numero := public.prochain_numero_devis(new.entreprise_id);
    end if;
    if auth.uid() is not null and new.statut <> 'brouillon' then
      raise exception 'Un nouveau devis commence toujours au statut brouillon.';
    end if;
    return new;
  end if;

  if new.numero is distinct from old.numero then
    raise exception 'Le numéro d''un devis ne peut pas être modifié.';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if old.statut = 'converti' then
    raise exception 'Un devis converti ne peut plus être modifié ni supprimé.';
  end if;

  v_acompte_actif := exists (select 1 from public.factures f
    where f.devis_id = old.id and f.type = 'acompte' and f.statut <> 'annulee' and f.deleted_at is null);

  if new.deleted_at is not null and old.deleted_at is null and v_acompte_actif then
    raise exception 'Ce devis a des acomptes : il ne peut pas être supprimé.';
  end if;

  v_contenu_modifie := new.client_id is distinct from old.client_id
    or new.date_emission is distinct from old.date_emission
    or new.date_validite is distinct from old.date_validite
    or new.remise is distinct from old.remise
    or new.notes_internes is distinct from old.notes_internes
    or new.message_client is distinct from old.message_client;
  if old.statut = 'accepte' and v_contenu_modifie then
    raise exception 'Un devis accepté ne peut plus être modifié. Un administrateur ou un manager doit d''abord le repasser en envoyé.';
  end if;

  if new.statut is distinct from old.statut then
    if not (
      (old.statut = 'brouillon' and new.statut = 'envoye')
      or (old.statut = 'envoye' and new.statut in ('accepte', 'refuse', 'expire', 'brouillon'))
      or (old.statut = 'accepte' and new.statut in ('envoye', 'refuse', 'converti'))
      or (old.statut = 'refuse' and new.statut = 'brouillon')
      or (old.statut = 'expire' and new.statut in ('brouillon', 'envoye'))
    ) then
      raise exception 'Ce changement de statut n''est pas autorisé.';
    end if;

    if new.statut = 'accepte' and new.date_validite < current_date then
      raise exception 'La date de validité de ce devis est dépassée. Prolongez-la avant de l''accepter.';
    end if;

    if new.statut = 'converti'
       and not exists (select 1 from public.factures f where f.devis_id = new.id and f.type in ('facture', 'solde')) then
      raise exception 'Le statut converti est attribué uniquement par la transformation en facture.';
    end if;

    if old.statut = 'accepte' and new.statut <> 'converti' and v_acompte_actif then
      raise exception 'Ce devis a des acomptes : il ne peut plus quitter le statut accepté.';
    end if;

    -- Sortir du verrouillage (y compris vers refusé, qui mènerait à brouillon) : direction uniquement
    if old.statut = 'accepte' and new.statut <> 'converti'
       and not public.has_role(new.entreprise_id, '{admin,manager}'::public.app_role[]) then
      raise exception 'Seul un administrateur ou un manager peut modifier le statut d''un devis accepté.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end $$;

-- 11. Vues : un solde en brouillon se lit net de ses acomptes ; une facture émise renvoie ses valeurs figées
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
  coalesce(fg.total_ht, s.signe * round((fa.ht_brut_c - fa.remise_c) / 100, 2) - d.ht) as total_ht,
  coalesce(fg.total_tva, s.signe * round(coalesce(t.tva_c, 0) / 100, 2) - d.tva) as total_tva,
  coalesce(fg.total_ttc, s.signe * round((fa.ht_brut_c - fa.remise_c + coalesce(t.tva_c, 0)) / 100, 2) - d.ht - d.tva) as total_ttc,
  coalesce(fg.total_ht_brut, s.signe * round(fa.ht_brut_c / 100, 2)) as total_ht_brut,
  coalesce(fg.remise_appliquee, s.signe * round(fa.remise_c / 100, 2)) as remise_appliquee
from fac fa
join public.factures fg on fg.id = fa.facture_id
cross join lateral (select case when fg.type = 'avoir' then -1 else 1 end as signe) s
cross join lateral (
  select coalesce(sum((n->>'total_ht')::numeric), 0) as ht, coalesce(sum((n->>'total_tva')::numeric), 0) as tva
  from jsonb_array_elements(coalesce(fg.acomptes_deduits, '[]'::jsonb)) n
) d
left join tva t on t.facture_id = fa.facture_id;

-- Même règle que resteAPayer et tropPercu (src/utils/facture.js) ; tout document sauf l'avoir
create or replace view public.factures_soldes with (security_invoker = on) as
select f.id as facture_id,
  t.total_ttc,
  a.avoirs_ttc,
  p.encaisse_net,
  greatest(0, t.total_ttc - a.avoirs_ttc - p.encaisse_net) as reste_a_payer,
  greatest(0, p.encaisse_net - (t.total_ttc - a.avoirs_ttc)) as trop_percu
from public.factures f
join public.factures_totaux t on t.facture_id = f.id
cross join lateral (
  select coalesce(sum(-x.total_ttc), 0) as avoirs_ttc
  from public.factures x
  where x.facture_origine_id = f.id and x.type = 'avoir' and x.statut <> 'brouillon'
) a
cross join lateral (
  select coalesce(sum(case when y.sens = 'remboursement' then -y.montant else y.montant end), 0) as encaisse_net
  from public.paiements y
  where y.facture_id = f.id
) p
where f.type <> 'avoir';
grant select on public.factures_soldes to authenticated;

-- 12. Acompte : aperçu sans écriture, puis création dans une seule transaction, sous verrou du devis
create or replace function public.apercu_acompte(p_devis_id uuid, p_mode text, p_valeur numeric) returns jsonb
language plpgsql set search_path = public as $$
declare
  d public.devis;
  v_calc jsonb;
  v_totaux jsonb;
  v_deja numeric;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  select * into d from public.devis where id = p_devis_id and deleted_at is null;
  if not found then
    raise exception 'Ce devis est introuvable.';
  end if;
  if d.statut <> 'accepte' then
    raise exception 'Un acompte ne peut porter que sur un devis accepté.';
  end if;
  v_calc := public.calculer_acompte(p_devis_id, p_mode, p_valeur);
  perform public.controler_plafond_acompte(p_devis_id, v_calc->'tva_detail', (v_calc->>'total_ttc')::numeric);
  v_totaux := public.totaux_devis_calcules(p_devis_id);
  select coalesce(sum((n->>'total_ttc')::numeric), 0) into v_deja from jsonb_array_elements(public.acomptes_nets(p_devis_id)) n;
  return v_calc || jsonb_build_object('devis_ttc', v_totaux->'total_ttc', 'deja_ttc', v_deja);
end $$;
revoke all on function public.apercu_acompte(uuid, text, numeric) from public, anon;
grant execute on function public.apercu_acompte(uuid, text, numeric) to authenticated;

create or replace function public.creer_acompte(p_devis_id uuid, p_mode text, p_valeur numeric) returns uuid
language plpgsql set search_path = public as $$
declare
  d public.devis;
  v_calc jsonb;
  v_jour date;
  v_acompte uuid;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  select * into d from public.devis where id = p_devis_id and deleted_at is null;
  if not found then
    raise exception 'Ce devis est introuvable.';
  end if;
  if not public.has_role(d.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    raise exception 'Votre rôle ne permet pas de créer un acompte.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.devis where id = p_devis_id and deleted_at is null for update;
  if not found then
    raise exception 'Ce devis est introuvable.';
  end if;
  if d.statut <> 'accepte' then
    raise exception 'Un acompte ne peut porter que sur un devis accepté.';
  end if;
  if not exists (select 1 from public.clients c where c.id = d.client_id and c.deleted_at is null) then
    raise exception 'Le client de ce devis a été supprimé : acompte impossible.';
  end if;

  v_calc := public.calculer_acompte(p_devis_id, p_mode, p_valeur);
  perform public.controler_plafond_acompte(p_devis_id, v_calc->'tva_detail', (v_calc->>'total_ttc')::numeric);

  v_jour := public.date_du_jour_paris();
  insert into public.factures (entreprise_id, client_id, type, devis_id, acompte_mode, acompte_valeur, date_emission, date_echeance)
  values (d.entreprise_id, d.client_id, 'acompte', d.id, p_mode, p_valeur, v_jour, v_jour + 30)
  returning id into v_acompte;

  insert into public.lignes_facture (entreprise_id, facture_id, description, quantite, prix_unitaire, taux_tva, remise, position)
  select d.entreprise_id, v_acompte,
    case when p_mode = 'pourcentage'
      then 'Acompte de ' || replace(trim_scale(p_valeur)::text, '.', ',') || ' % sur le devis ' || d.numero
      else 'Acompte sur le devis ' || d.numero end
      || ' (TVA ' || replace(trim_scale((e->>'taux')::numeric)::text, '.', ',') || ' %)',
    1, (e->>'base')::numeric, (e->>'taux')::numeric, 0, (ordinality - 1)::integer
  from jsonb_array_elements(v_calc->'tva_detail') with ordinality as t(e, ordinality);

  return v_acompte;
end $$;
revoke all on function public.creer_acompte(uuid, text, numeric) from public, anon;
grant execute on function public.creer_acompte(uuid, text, numeric) to authenticated;

-- 13. Conversion : reprend la migration 008. Solde s'il reste des acomptes nets, sinon facture normale.
create or replace function public.convertir_devis(p_devis_id uuid) returns uuid
language plpgsql set search_path = public as $$
declare
  d public.devis;
  v_jour date;
  v_type text;
  v_facture uuid;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;

  select * into d from public.devis where id = p_devis_id and deleted_at is null;
  if not found then
    raise exception 'Ce devis est introuvable.';
  end if;
  if not public.has_role(d.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    raise exception 'Votre rôle ne permet pas de transformer un devis en facture.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into d from public.devis where id = p_devis_id and deleted_at is null for update;
  if not found then
    raise exception 'Ce devis est introuvable.';
  end if;
  if d.statut = 'converti' then
    raise exception 'Ce devis a déjà été converti.';
  end if;
  if d.statut <> 'accepte' then
    raise exception 'Seul un devis accepté peut être transformé en facture.';
  end if;
  if not exists (select 1 from public.clients c where c.id = d.client_id and c.deleted_at is null) then
    raise exception 'Le client de ce devis a été supprimé : transformation impossible.';
  end if;
  if not exists (select 1 from public.lignes_devis l where l.devis_id = d.id) then
    raise exception 'Ce devis ne contient aucune ligne.';
  end if;
  if exists (select 1 from public.factures a where a.devis_id = d.id and a.type = 'acompte'
             and a.statut = 'brouillon' and a.deleted_at is null) then
    raise exception 'Un acompte de ce devis est encore en brouillon : finalisez-le ou supprimez-le.';
  end if;

  v_type := case when jsonb_array_length(public.acomptes_nets(d.id)) > 0 then 'solde' else 'facture' end;
  v_jour := public.date_du_jour_paris();
  insert into public.factures (entreprise_id, client_id, type, date_emission, date_echeance, statut, remise, devis_id, acomptes_deduits)
  values (d.entreprise_id, d.client_id, v_type, v_jour, v_jour + 30, 'brouillon', d.remise, d.id,
          case when v_type = 'solde' then '[]'::jsonb end)
  returning id into v_facture;

  insert into public.lignes_facture (entreprise_id, facture_id, description, reference, unite,
                                     quantite, prix_unitaire, taux_tva, remise, position, produit_id)
  select l.entreprise_id, v_facture, l.description, l.reference, l.unite,
         l.quantite, l.prix_unitaire, l.taux_tva, l.remise, l.position, l.produit_id
  from public.lignes_devis l
  where l.devis_id = d.id;

  update public.devis set statut = 'converti' where id = d.id;

  return v_facture;
end $$;

-- 14. Avoir : reprend la migration 009. Avoir total sur un solde : une ligne par taux, au montant net figé.
create or replace function public.creer_avoir(p_facture_id uuid, p_motif text, p_total boolean, p_lignes jsonb default null)
returns uuid
language plpgsql set search_path = public as $$
declare
  f public.factures;
  v_avoir uuid;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  select * into f from public.factures where id = p_facture_id and deleted_at is null;
  if not found then
    raise exception 'Cette facture est introuvable.';
  end if;
  if not public.has_role(f.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    raise exception 'Votre rôle ne permet pas de créer un avoir.'
      using errcode = 'insufficient_privilege';
  end if;
  f := public.lire_origine_avoir(p_facture_id);
  if p_total and exists (select 1 from public.factures a where a.facture_origine_id = f.id and a.type = 'avoir' and a.statut <> 'brouillon') then
    raise exception 'Un avoir a déjà été finalisé sur cette facture : un avoir total n''est plus possible. Créez un avoir partiel.';
  end if;
  if not p_total and (p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0) then
    raise exception 'Un avoir partiel doit contenir au moins une ligne.';
  end if;

  insert into public.factures (entreprise_id, client_id, type, facture_origine_id, avoir_total, motif, date_emission)
  values (f.entreprise_id, f.client_id, 'avoir', f.id, p_total, p_motif, public.date_du_jour_paris())
  returning id into v_avoir;

  if p_total and f.type = 'solde' then
    insert into public.lignes_facture (entreprise_id, facture_id, description, quantite, prix_unitaire, taux_tva, remise, position)
    select f.entreprise_id, v_avoir,
      'Annulation de la facture de solde ' || f.numero || ' (TVA ' || replace(trim_scale((e->>'taux')::numeric)::text, '.', ',') || ' %)',
      1, (e->>'base')::numeric, (e->>'taux')::numeric, 0, (ordinality - 1)::integer
    from jsonb_array_elements(f.tva_detail) with ordinality as t(e, ordinality);
  elsif p_total then
    insert into public.lignes_facture (entreprise_id, facture_id, description, reference, unite,
                                       quantite, prix_unitaire, taux_tva, remise, position, produit_id)
    select l.entreprise_id, v_avoir, l.description, l.reference, l.unite,
           l.quantite, l.prix_unitaire, l.taux_tva, l.remise, l.position, l.produit_id
    from public.lignes_facture l
    where l.facture_id = f.id;
  else
    insert into public.lignes_facture (entreprise_id, facture_id, description, reference, unite,
                                       quantite, prix_unitaire, taux_tva, remise, position, produit_id)
    select f.entreprise_id, v_avoir, l.description, l.reference, l.unite,
           l.quantite, l.prix_unitaire, l.taux_tva, l.remise, l.position, l.produit_id
    from jsonb_to_recordset(p_lignes) as l(description text, reference text, unite text, quantite numeric,
      prix_unitaire numeric, taux_tva numeric, remise numeric, "position" integer, produit_id uuid);
  end if;

  return v_avoir;
end $$;

-- 15. enregistrer_facture : reprend la migration 009 ; les lignes d'un acompte sont celles du calcul en base
create or replace function public.enregistrer_facture(p_id uuid, p_entete jsonb, p_lignes jsonb default null) returns void
language plpgsql set search_path = public as $$
declare
  f public.factures;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  select * into f from public.factures where id = p_id and deleted_at is null;
  if not found then
    raise exception 'Cette facture est introuvable.';
  end if;
  if not public.has_role(f.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    raise exception 'Votre rôle ne permet pas de modifier une facture.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into f from public.factures where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Cette facture est introuvable.';
  end if;
  if f.statut <> 'brouillon' then
    raise exception 'Une facture finalisée ne peut plus être modifiée. Sa correction passe par un avoir.';
  end if;
  if f.avoir_total and p_lignes is not null then
    raise exception 'Les lignes d''un avoir total doivent rester celles de la facture d''origine.';
  end if;
  if f.type = 'acompte' and p_lignes is not null then
    raise exception 'Les lignes d''un acompte sont calculées : supprimez-le et recréez-le pour changer son montant.';
  end if;

  update public.factures set
    client_id = case when p_entete ? 'client_id' then (p_entete->>'client_id')::uuid else client_id end,
    date_emission = case when p_entete ? 'date_emission' then coalesce((p_entete->>'date_emission')::date, date_emission) else date_emission end,
    date_echeance = case when p_entete ? 'date_echeance' then (p_entete->>'date_echeance')::date else date_echeance end,
    remise = case when p_entete ? 'remise' then coalesce((p_entete->>'remise')::numeric, 0) else remise end,
    conditions_paiement = case when p_entete ? 'conditions_paiement' then p_entete->>'conditions_paiement' else conditions_paiement end,
    mode_paiement = case when p_entete ? 'mode_paiement' then p_entete->>'mode_paiement' else mode_paiement end,
    notes_internes = case when p_entete ? 'notes_internes' then p_entete->>'notes_internes' else notes_internes end,
    message_client = case when p_entete ? 'message_client' then p_entete->>'message_client' else message_client end,
    motif = case when p_entete ? 'motif' then p_entete->>'motif' else motif end
  where id = p_id;

  if p_lignes is not null then
    delete from public.lignes_facture where facture_id = p_id;
    insert into public.lignes_facture (entreprise_id, facture_id, description, reference, unite,
                                       quantite, prix_unitaire, taux_tva, remise, position, produit_id)
    select f.entreprise_id, p_id, l.description, l.reference, l.unite,
           l.quantite, l.prix_unitaire, l.taux_tva, l.remise, l.position, l.produit_id
    from jsonb_to_recordset(p_lignes) as l(description text, reference text, unite text, quantite numeric,
      prix_unitaire numeric, taux_tva numeric, remise numeric, "position" integer, produit_id uuid);
  end if;
end $$;

-- 16. Contrôles finaux
do $$
declare f text; v text;
begin
  foreach v in array array['factures_totaux', 'factures_soldes'] loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
      cross join lateral pg_options_to_table(c.reloptions) o
      where ns.nspname = 'public' and c.relname = v
        and o.option_name = 'security_invoker' and lower(o.option_value) in ('on', 'true', '1', 'yes')
    ) then
      raise exception 'Contrôle : la vue public.% n''est pas en security_invoker', v;
    end if;
  end loop;

  foreach f in array array['public.creer_acompte(uuid,text,numeric)', 'public.apercu_acompte(uuid,text,numeric)',
                           'public.convertir_devis(uuid)', 'public.creer_avoir(uuid,text,boolean,jsonb)',
                           'public.enregistrer_facture(uuid,jsonb,jsonb)', 'public.calculer_acompte(uuid,text,numeric)',
                           'public.acomptes_nets(uuid)', 'public.controler_plafond_acompte(uuid,jsonb,numeric)',
                           'public.totaux_solde(uuid,numeric,jsonb)', 'public.totaux_devis_calcules(uuid)'] loop
    if (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception 'Contrôle : % ne doit pas être en security definer', f;
    end if;
  end loop;
end $$;

-- 17. Supabase : nouvelles colonnes, vues et fonctions visibles immédiatement par l'API (cache de schéma)
notify pgrst, 'reload schema';

commit;
