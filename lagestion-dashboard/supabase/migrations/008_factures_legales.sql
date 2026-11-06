-- 008_factures_legales.sql — Lagestion
-- Numérotation légale et verrouillage des factures (sections 12 et AC-04 du cahier des charges V2).
--   - cycle de vie : brouillon (sans numéro, modifiable) → finalisée (numéro, contenu figé)
--     → envoyée, partiellement payée, payée, en retard ; plus aucun retour au brouillon ;
--   - numéro FAC-AAAA-NNNN attribué à la finalisation, en base, sous verrou par entreprise :
--     pas de séquence Postgres, un échec annule tout et ne consomme aucun numéro ;
--   - toute la finalisation vit dans le trigger : aucune écriture ne peut l'obtenir sans numéro ni totaux ;
--   - totaux et TVA par taux figés, identité du client et de l'émetteur figées ;
--   - facture finalisée : ni modification, ni suppression (la correction passera par un avoir) ;
--   - statut « annulée » inaccessible jusqu'à l'étape des avoirs (décision du 2026-11-06) ;
--   - paiement refusé sur un brouillon ou une facture annulée ;
--   - enregistrer_facture et enregistrer_devis : en-tête et lignes modifiés dans une seule transaction ;
--   - convertir_devis : brouillon sans numéro, échéance à émission + 30 jours.
-- Comme les migrations 003 et 007, les règles ne s'appliquent qu'à un utilisateur authentifié :
-- le SQL Editor (rôle postgres, seed) reste libre, sauf le numéro d'une facture émise, jamais modifiable.
-- Dates en heure de Paris : current_date est en UTC sur Supabase (faux entre minuit et 2 h).
-- Mentions légales : aucune ajoutée ici, à valider par un expert-comptable avant la première vraie facture.
-- S'applique après 007_devis.sql. Rejouable sans erreur.

begin;

-- 1. Colonnes : valeurs figées, remplies à la sortie du brouillon
alter table public.factures
  add column if not exists total_ht_brut numeric(14,2),
  add column if not exists remise_appliquee numeric(14,2),
  add column if not exists total_ht numeric(14,2),
  add column if not exists total_tva numeric(14,2),
  add column if not exists total_ttc numeric(14,2),
  add column if not exists tva_detail jsonb,
  add column if not exists client_fige jsonb,
  add column if not exists emetteur_fige jsonb,
  add column if not exists finalisee_le timestamptz;

alter table public.factures alter column numero drop not null;

-- 2. Statuts : en_attente remplacé par finalisee
alter table public.factures drop constraint if exists factures_statut_check;
update public.factures set statut = 'finalisee' where statut = 'en_attente';
alter table public.factures add constraint factures_statut_check
  check (statut in ('brouillon', 'finalisee', 'envoyee', 'payee', 'partiellement_payee', 'en_retard', 'annulee'));

-- 3. Fonctions de calcul et d'instantané
create or replace function public.date_du_jour_paris() returns date
language sql stable set search_path = pg_catalog as $$
  select (now() at time zone 'Europe/Paris')::date
$$;

-- Même règle que public.factures_totaux (migration 005) et calculerTotaux (src/utils/facture.js), avec le détail par taux.
create or replace function public.totaux_facture_calcules(p_facture uuid, p_remise numeric) returns jsonb
language sql stable set search_path = public as $$
  with lignes as (
    select l.taux_tva, greatest(0, round(l.quantite * l.prix_unitaire, 2) - l.remise) * 100 as ht_c
    from public.lignes_facture l
    where l.facture_id = p_facture
  ),
  bases as (
    select taux_tva, sum(ht_c) as base_c from lignes group by taux_tva
  ),
  fac as (
    select coalesce(sum(base_c), 0) as ht_brut_c,
           least(p_remise * 100, coalesce(sum(base_c), 0)) as remise_c
    from bases
  ),
  parts as (
    select b.taux_tva, b.base_c, fa.remise_c,
      case when fa.ht_brut_c = 0 then 0 else div(fa.remise_c * b.base_c, fa.ht_brut_c) end as part_c,
      case when fa.ht_brut_c = 0 then 0 else mod(fa.remise_c * b.base_c, fa.ht_brut_c) end as reste
    from bases b cross join fac fa
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
    'total_ht_brut', round(fa.ht_brut_c / 100, 2),
    'remise_appliquee', round(fa.remise_c / 100, 2),
    'total_ht', round((fa.ht_brut_c - fa.remise_c) / 100, 2),
    'total_tva', round(s.tva_c / 100, 2),
    'total_ttc', round((fa.ht_brut_c - fa.remise_c + s.tva_c) / 100, 2),
    'tva_detail', s.detail)
  from fac fa cross join somme s
$$;

create or replace function public.instantane_client(p_client uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('nom', nom, 'type', type, 'siren', siren, 'tva_intra', tva_intra,
                            'adresse', adresse, 'telephone', telephone, 'email', email)
  from public.clients where id = p_client
$$;

create or replace function public.instantane_emetteur(p_entreprise uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('nom', nom, 'siret', siret, 'adresse', adresse)
  from public.entreprises where id = p_entreprise
$$;

-- Verrou par entreprise jusqu'à la fin de la transaction. Factures supprimées comprises ;
-- DEMO-NNNN et anciens formats restent hors séquence.
create or replace function public.prochain_numero_facture(p_entreprise uuid, p_date date) returns text
language plpgsql set search_path = public as $$
declare
  v_prefixe constant text := 'FAC-' || to_char(p_date, 'YYYY') || '-';
  v_max bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('factures:' || p_entreprise::text, 0));
  select coalesce(max(substring(numero from length(v_prefixe) + 1)::bigint), 0) into v_max
    from public.factures
   where entreprise_id = p_entreprise and numero ~ ('^' || v_prefixe || '[0-9]+$');
  return v_prefixe || lpad((v_max + 1)::text, 4, '0');
end $$;

revoke all on function public.totaux_facture_calcules(uuid, numeric) from public, anon;
revoke all on function public.instantane_client(uuid) from public, anon;
revoke all on function public.instantane_emetteur(uuid) from public, anon;
revoke all on function public.prochain_numero_facture(uuid, date) from public, anon;
grant execute on function public.totaux_facture_calcules(uuid, numeric) to authenticated;
grant execute on function public.instantane_client(uuid) to authenticated;
grant execute on function public.instantane_emetteur(uuid) to authenticated;
grant execute on function public.prochain_numero_facture(uuid, date) to authenticated;
revoke all on function public.date_du_jour_paris() from public, anon;
grant execute on function public.date_du_jour_paris() to authenticated;

-- 4. Factures existantes
--    Brouillon : le numéro est retiré (DEMO-NNNN reste, il marque les données de démonstration).
--    Facture émise : numéro conservé, totaux et identités figés à l'état actuel.
do $$
declare n int;
begin
  update public.factures set numero = null
   where statut = 'brouillon' and numero is not null and numero not like 'DEMO-%';
  get diagnostics n = row_count;
  raise notice 'Numéros retirés de brouillons : %', n;
end $$;

do $$
declare r record;
begin
  for r in
    select entreprise_id, numero, count(*) as nb
    from public.factures where numero is not null
    group by entreprise_id, numero having count(*) > 1
  loop
    raise notice 'Numéro en double : % dans l''entreprise % (% factures, supprimées comprises)', r.numero, r.entreprise_id, r.nb;
  end loop;
  if found then
    raise exception 'Migration 008 interrompue : des numéros de facture existent en double (voir les NOTICE). Rien n''a été modifié.';
  end if;
end $$;

drop index if exists public.uniq_factures_numero;
create unique index uniq_factures_numero on public.factures (entreprise_id, numero)
  where numero is not null;

alter table public.factures drop constraint if exists factures_emise_avec_numero;
alter table public.factures add constraint factures_emise_avec_numero
  check (statut = 'brouillon' or numero is not null);

do $$
declare n int;
begin
  update public.factures f
     set total_ht_brut = (s.t->>'total_ht_brut')::numeric,
         remise_appliquee = (s.t->>'remise_appliquee')::numeric,
         total_ht = (s.t->>'total_ht')::numeric,
         total_tva = (s.t->>'total_tva')::numeric,
         total_ttc = (s.t->>'total_ttc')::numeric,
         tva_detail = s.t->'tva_detail',
         client_fige = s.c,
         emetteur_fige = s.e,
         finalisee_le = f.updated_at
    from (select id,
                 public.totaux_facture_calcules(id, remise) as t,
                 public.instantane_client(client_id) as c,
                 public.instantane_emetteur(entreprise_id) as e
            from public.factures
           where statut <> 'brouillon' and total_ttc is null) s
   where f.id = s.id;
  get diagnostics n = row_count;
  raise notice 'Factures émises existantes figées : %', n;
end $$;

-- Trous déjà présents dans les séries FAC-AAAA-NNNN : information seulement, à montrer à l'expert-comptable.
do $$
declare r record; n int := 0;
begin
  for r in
    with serie as (
      select entreprise_id, left(numero, 9) as prefixe, substring(numero from 10)::bigint as rang
      from public.factures
      where numero ~ '^FAC-[0-9]{4}-[0-9]+$'
    )
    select s.entreprise_id, s.prefixe, g.rang
    from (select entreprise_id, prefixe, max(rang) as dernier from serie group by 1, 2) s
    cross join lateral generate_series(1, s.dernier) as g(rang)
    where not exists (select 1 from serie x where x.entreprise_id = s.entreprise_id
                      and x.prefixe = s.prefixe and x.rang = g.rang)
    order by 1, 2, 3
  loop
    n := n + 1;
    raise notice 'Trou de numérotation : % (entreprise %)', r.prefixe || lpad(r.rang::text, 4, '0'), r.entreprise_id;
  end loop;
  raise notice 'Trous de numérotation existants : %', n;
end $$;

-- 5. Règles de la facture : finalisation, verrouillage, statuts
create or replace function public.verifier_facture() returns trigger
language plpgsql set search_path = public as $$
declare
  v_utilisateur constant boolean := auth.uid() is not null;
  v_jour date;
  v_emetteur public.entreprises;
  v_totaux jsonb;
begin
  if tg_op = 'DELETE' then
    if v_utilisateur and old.statut <> 'brouillon' then
      raise exception 'Une facture finalisée ne peut pas être supprimée. Sa correction passera par un avoir.';
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

    if new.statut = 'finalisee' then
      if new.deleted_at is not null then
        raise exception 'Une facture supprimée ne peut pas être finalisée.';
      end if;
      if not exists (select 1 from public.lignes_facture l where l.facture_id = new.id) then
        raise exception 'Cette facture ne contient aucune ligne : finalisation impossible.';
      end if;
      if not exists (select 1 from public.clients c where c.id = new.client_id and c.deleted_at is null) then
        raise exception 'Le client de cette facture a été supprimé : finalisation impossible.';
      end if;
      v_jour := public.date_du_jour_paris();
      if new.date_echeance is null then
        raise exception 'Renseignez une date d''échéance avant de finaliser cette facture.';
      end if;
      if new.date_echeance < v_jour then
        raise exception 'La date d''échéance de cette facture est dépassée. Corrigez-la avant de finaliser.';
      end if;
      select * into v_emetteur from public.entreprises where id = new.entreprise_id;
      if coalesce(trim(v_emetteur.siret), '') = '' then
        raise exception 'Renseignez le SIRET de l''entreprise avant de finaliser une facture.';
      end if;
      if coalesce(trim(v_emetteur.adresse), '') = '' then
        raise exception 'Renseignez l''adresse de l''entreprise avant de finaliser une facture.';
      end if;
      -- En dernier : aucun numéro n'est calculé tant qu'un contrôle peut encore échouer.
      new.date_emission := v_jour;
      new.numero := public.prochain_numero_facture(new.entreprise_id, v_jour);
    end if;

    v_totaux := public.totaux_facture_calcules(new.id, new.remise);
    new.total_ht_brut := (v_totaux->>'total_ht_brut')::numeric;
    new.remise_appliquee := (v_totaux->>'remise_appliquee')::numeric;
    new.total_ht := (v_totaux->>'total_ht')::numeric;
    new.total_tva := (v_totaux->>'total_tva')::numeric;
    new.total_ttc := (v_totaux->>'total_ttc')::numeric;
    new.tva_detail := v_totaux->'tva_detail';
    new.client_fige := public.instantane_client(new.client_id);
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
    new.total_ht_brut := null; new.remise_appliquee := null; new.total_ht := null;
    new.total_tva := null; new.total_ttc := null; new.tva_detail := null;
    new.client_fige := null; new.emetteur_fige := null; new.finalisee_le := null;
    return new;
  end if;

  -- Facture émise : seuls le statut et les notes internes évoluent. devis_id peut passer à null
  -- (clé étrangère « on delete set null » lors de la suppression définitive du devis d'origine).
  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'Une facture finalisée ne peut pas être supprimée. Sa correction passera par un avoir.';
  end if;
  if row(new.client_id, new.date_emission, new.date_echeance, new.remise, new.conditions_paiement,
         new.mode_paiement, new.message_client, new.total_ht_brut, new.remise_appliquee, new.total_ht,
         new.total_tva, new.total_ttc, new.tva_detail, new.client_fige, new.emetteur_fige, new.finalisee_le)
     is distinct from
     row(old.client_id, old.date_emission, old.date_echeance, old.remise, old.conditions_paiement,
         old.mode_paiement, old.message_client, old.total_ht_brut, old.remise_appliquee, old.total_ht,
         old.total_tva, old.total_ttc, old.tva_detail, old.client_fige, old.emetteur_fige, old.finalisee_le)
     or (new.devis_id is distinct from old.devis_id and new.devis_id is not null) then
    raise exception 'Une facture finalisée ne peut plus être modifiée. Sa correction passera par un avoir.';
  end if;

  if new.statut is distinct from old.statut then
    if new.statut = 'brouillon' then
      raise exception 'Une facture finalisée ne peut pas repasser en brouillon.';
    end if;
    if new.statut = 'annulee' then
      raise exception 'L''annulation d''une facture finalisée passera par un avoir, pas encore disponible.';
    end if;
    if old.statut = 'annulee' or new.statut = 'finalisee' then
      raise exception 'Ce changement de statut n''est pas autorisé.';
    end if;
  end if;

  return new;
end $$;

-- 6. Lignes : verrou sur la facture parente pour exclure toute écriture pendant une finalisation.
--    Pendant la suppression d'un brouillon (cascade), la facture n'est plus lue : aucun blocage.
create or replace function public.verifier_ligne_facture() returns trigger
language plpgsql set search_path = public as $$
declare
  v_statut text;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select statut into v_statut from public.factures
   where id = case when tg_op = 'DELETE' then old.facture_id else new.facture_id end
   for no key update;
  if v_statut <> 'brouillon' then
    raise exception 'Les lignes d''une facture finalisée ne peuvent plus être modifiées.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- 7. Paiements : uniquement sur une facture émise et non annulée
create or replace function public.verifier_paiement() returns trigger
language plpgsql set search_path = public as $$
declare
  v_statut text;
begin
  if auth.uid() is null then
    return new;
  end if;
  select statut into v_statut from public.factures where id = new.facture_id;
  if v_statut = 'brouillon' then
    raise exception 'Finalisez cette facture avant d''enregistrer un paiement.';
  end if;
  if v_statut = 'annulee' then
    raise exception 'Une facture annulée ne peut pas recevoir de paiement.';
  end if;
  return new;
end $$;

drop trigger if exists trg_factures_regles on public.factures;
create trigger trg_factures_regles before insert or update or delete on public.factures
  for each row execute function public.verifier_facture();

drop trigger if exists trg_lignes_facture_regles on public.lignes_facture;
create trigger trg_lignes_facture_regles before insert or update or delete on public.lignes_facture
  for each row execute function public.verifier_ligne_facture();

drop trigger if exists trg_paiements_regles on public.paiements;
create trigger trg_paiements_regles before insert or update on public.paiements
  for each row execute function public.verifier_paiement();

-- 8. Vue : une facture émise renvoie ses valeurs figées, un brouillon la valeur calculée
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
  coalesce(fg.total_ht, round((fa.ht_brut_c - fa.remise_c) / 100, 2)) as total_ht,
  coalesce(fg.total_tva, round(coalesce(t.tva_c, 0) / 100, 2)) as total_tva,
  coalesce(fg.total_ttc, round((fa.ht_brut_c - fa.remise_c + coalesce(t.tva_c, 0)) / 100, 2)) as total_ttc,
  coalesce(fg.total_ht_brut, round(fa.ht_brut_c / 100, 2)) as total_ht_brut,
  coalesce(fg.remise_appliquee, round(fa.remise_c / 100, 2)) as remise_appliquee
from fac fa
join public.factures fg on fg.id = fa.facture_id
left join tva t on t.facture_id = fa.facture_id;

-- 9. Finalisation : le trigger fait le travail ; la fonction donne des messages clairs.
--    Le verrou FOR UPDATE fait attendre une finalisation simultanée, qui échoue ensuite sur le statut.
create or replace function public.finaliser_facture(p_facture_id uuid) returns text
language plpgsql set search_path = public as $$
declare
  f public.factures;
  v_numero text;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  select * into f from public.factures where id = p_facture_id and deleted_at is null;
  if not found then
    raise exception 'Cette facture est introuvable.';
  end if;
  if not public.has_role(f.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    raise exception 'Votre rôle ne permet pas de finaliser une facture.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into f from public.factures where id = p_facture_id and deleted_at is null for update;
  if not found then
    raise exception 'Cette facture est introuvable.';
  end if;
  if f.statut <> 'brouillon' then
    raise exception 'Cette facture est déjà finalisée.';
  end if;
  update public.factures set statut = 'finalisee' where id = p_facture_id
    returning numero into v_numero;
  return v_numero;
end $$;
revoke all on function public.finaliser_facture(uuid) from public, anon;
grant execute on function public.finaliser_facture(uuid) to authenticated;

-- 10. Modification d'un document : en-tête et lignes réussissent ou échouent ensemble.
--     p_entete : seuls les champs présents changent ; p_lignes null : lignes inchangées.
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
    raise exception 'Une facture finalisée ne peut plus être modifiée. Sa correction passera par un avoir.';
  end if;

  update public.factures set
    client_id = case when p_entete ? 'client_id' then (p_entete->>'client_id')::uuid else client_id end,
    date_emission = case when p_entete ? 'date_emission' then coalesce((p_entete->>'date_emission')::date, date_emission) else date_emission end,
    date_echeance = case when p_entete ? 'date_echeance' then (p_entete->>'date_echeance')::date else date_echeance end,
    remise = case when p_entete ? 'remise' then coalesce((p_entete->>'remise')::numeric, 0) else remise end,
    conditions_paiement = case when p_entete ? 'conditions_paiement' then p_entete->>'conditions_paiement' else conditions_paiement end,
    mode_paiement = case when p_entete ? 'mode_paiement' then p_entete->>'mode_paiement' else mode_paiement end,
    notes_internes = case when p_entete ? 'notes_internes' then p_entete->>'notes_internes' else notes_internes end,
    message_client = case when p_entete ? 'message_client' then p_entete->>'message_client' else message_client end
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
revoke all on function public.enregistrer_facture(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.enregistrer_facture(uuid, jsonb, jsonb) to authenticated;

-- Le verrouillage (accepté, converti) reste assuré par verifier_devis et verifier_ligne_devis.
create or replace function public.enregistrer_devis(p_id uuid, p_entete jsonb, p_lignes jsonb default null) returns void
language plpgsql set search_path = public as $$
declare
  d public.devis;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  select * into d from public.devis where id = p_id and deleted_at is null;
  if not found then
    raise exception 'Ce devis est introuvable.';
  end if;
  if not public.has_role(d.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    raise exception 'Votre rôle ne permet pas de modifier un devis.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.devis where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Ce devis est introuvable.';
  end if;

  update public.devis set
    client_id = case when p_entete ? 'client_id' then (p_entete->>'client_id')::uuid else client_id end,
    date_emission = case when p_entete ? 'date_emission' then coalesce((p_entete->>'date_emission')::date, date_emission) else date_emission end,
    date_validite = case when p_entete ? 'date_validite' then coalesce((p_entete->>'date_validite')::date, date_validite) else date_validite end,
    remise = case when p_entete ? 'remise' then coalesce((p_entete->>'remise')::numeric, 0) else remise end,
    notes_internes = case when p_entete ? 'notes_internes' then p_entete->>'notes_internes' else notes_internes end,
    message_client = case when p_entete ? 'message_client' then p_entete->>'message_client' else message_client end
  where id = p_id;

  if p_lignes is not null then
    delete from public.lignes_devis where devis_id = p_id;
    insert into public.lignes_devis (entreprise_id, devis_id, description, reference, unite,
                                     quantite, prix_unitaire, taux_tva, remise, position, produit_id)
    select d.entreprise_id, p_id, l.description, l.reference, l.unite,
           l.quantite, l.prix_unitaire, l.taux_tva, l.remise, l.position, l.produit_id
    from jsonb_to_recordset(p_lignes) as l(description text, reference text, unite text, quantite numeric,
      prix_unitaire numeric, taux_tva numeric, remise numeric, "position" integer, produit_id uuid);
  end if;
end $$;
revoke all on function public.enregistrer_devis(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.enregistrer_devis(uuid, jsonb, jsonb) to authenticated;

-- 11. Conversion : la facture naît brouillon, sans numéro, échéance à émission + 30 jours
create or replace function public.convertir_devis(p_devis_id uuid) returns uuid
language plpgsql set search_path = public as $$
declare
  d public.devis;
  v_jour date;
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

  v_jour := public.date_du_jour_paris();
  insert into public.factures (entreprise_id, client_id, date_emission, date_echeance, statut, remise, devis_id)
  values (d.entreprise_id, d.client_id, v_jour, v_jour + 30, 'brouillon', d.remise, d.id)
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

-- 12. Contrôles finaux
do $$
declare n int; f text;
begin
  select count(*) into n from pg_trigger
   where not tgisinternal and tgrelid = 'public.factures'::regclass and tgname = 'trg_factures_regles';
  if n <> 1 then raise exception 'Contrôle : trigger trg_factures_regles absent'; end if;
  select count(*) into n from pg_trigger
   where not tgisinternal and tgrelid = 'public.lignes_facture'::regclass and tgname = 'trg_lignes_facture_regles';
  if n <> 1 then raise exception 'Contrôle : trigger trg_lignes_facture_regles absent'; end if;
  select count(*) into n from pg_trigger
   where not tgisinternal and tgrelid = 'public.paiements'::regclass and tgname = 'trg_paiements_regles';
  if n <> 1 then raise exception 'Contrôle : trigger trg_paiements_regles absent'; end if;

  if exists (select 1 from public.factures where statut = 'en_attente') then
    raise exception 'Contrôle : il reste des factures en_attente';
  end if;
  select count(*) into n from public.factures where statut <> 'brouillon' and total_ttc is null;
  if n > 0 then raise exception 'Contrôle : % facture(s) émise(s) sans totaux figés', n; end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    cross join lateral pg_options_to_table(c.reloptions) o
    where ns.nspname = 'public' and c.relname = 'factures_totaux'
      and o.option_name = 'security_invoker' and lower(o.option_value) in ('on', 'true', '1', 'yes')
  ) then
    raise exception 'Contrôle : la vue public.factures_totaux n''est pas en security_invoker';
  end if;

  foreach f in array array['public.finaliser_facture(uuid)', 'public.enregistrer_facture(uuid,jsonb,jsonb)',
                           'public.enregistrer_devis(uuid,jsonb,jsonb)', 'public.convertir_devis(uuid)'] loop
    if (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception 'Contrôle : % ne doit pas être en security definer', f;
    end if;
  end loop;
end $$;

-- 13. Supabase : nouvelles colonnes et fonctions visibles immédiatement par l'API (cache de schéma)
notify pgrst, 'reload schema';

commit;
