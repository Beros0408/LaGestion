-- 009_avoirs.sql — Lagestion
-- Avoirs (FR-007, AC-04) : seule façon de corriger ou d'annuler une facture finalisée.
--   - un avoir est une ligne de public.factures (type = 'avoir') : mêmes lignes, RLS, audit et finalisation ;
--   - lignes positives en base (contraintes conservées), signe porté par le document : totaux figés négatifs ;
--   - numéro AV-AAAA-NNNN, série distincte, continue par entreprise, attribué à la finalisation sous verrou ;
--   - référence obligatoire à la facture d'origine, motif obligatoire ;
--   - avoir total : reprend les totaux figés de la facture, sans recalcul ;
--   - plafonds sous verrou de la facture d'origine : TTC et, pour chaque taux, base et TVA ;
--     quand un avoir épuise la base d'un taux, sa TVA prend le reste exact, pour pouvoir solder au centime ;
--   - la facture passe « annulée » dès que le cumul des avoirs finalisés atteint son TTC ;
--   - finalisation d'un avoir réservée à admin, manager et comptable ; le commercial prépare le brouillon ;
--   - paiements.sens : le remboursement du trop-perçu est plafonné et permis sur une facture annulée ;
--   - vue factures_soldes : reste à payer et trop-perçu, même règle que src/utils/facture.js.
-- Comme les migrations 003, 007 et 008, les règles ne s'appliquent qu'à un utilisateur authentifié :
-- le SQL Editor (rôle postgres, seed) reste libre, sauf le numéro d'une facture émise.
-- Acomptes et facture de solde : étape suivante (migration 010).
-- S'applique après 008_factures_legales.sql. Rejouable sans erreur.

begin;

-- 1. Colonnes
alter table public.factures
  add column if not exists type text not null default 'facture',
  add column if not exists facture_origine_id uuid references public.factures(id),
  add column if not exists avoir_total boolean not null default false,
  add column if not exists motif text;

alter table public.paiements
  add column if not exists sens text not null default 'encaissement';

alter table public.factures drop constraint if exists factures_type_check;
alter table public.factures add constraint factures_type_check check (type in ('facture', 'avoir'));

alter table public.factures drop constraint if exists factures_avoir_coherent;
alter table public.factures add constraint factures_avoir_coherent check (
  (type = 'avoir' and facture_origine_id is not null and coalesce(trim(motif), '') <> '' and devis_id is null)
  or (type = 'facture' and facture_origine_id is null and not avoir_total)
);

alter table public.paiements drop constraint if exists paiements_sens_check;
alter table public.paiements add constraint paiements_sens_check check (sens in ('encaissement', 'remboursement'));

create index if not exists idx_factures_origine on public.factures(facture_origine_id)
  where facture_origine_id is not null;

drop trigger if exists trg_factures_origine on public.factures;
create trigger trg_factures_origine before insert or update of facture_origine_id, entreprise_id on public.factures
  for each row when (new.facture_origine_id is not null)
  execute function public.verifier_entreprise('factures', 'facture_origine_id');

-- 2. Numérotation : série AV distincte, même mécanique que prochain_numero_facture (migration 008)
create or replace function public.prochain_numero_avoir(p_entreprise uuid, p_date date) returns text
language plpgsql set search_path = public as $$
declare
  v_prefixe constant text := 'AV-' || to_char(p_date, 'YYYY') || '-';
  v_max bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('avoirs:' || p_entreprise::text, 0));
  select coalesce(max(substring(numero from length(v_prefixe) + 1)::bigint), 0) into v_max
    from public.factures
   where entreprise_id = p_entreprise and numero ~ ('^' || v_prefixe || '[0-9]+$');
  return v_prefixe || lpad((v_max + 1)::text, 4, '0');
end $$;

-- 3. Facture d'origine : verrouillée jusqu'à la fin de la transaction, ce qui sérialise les avoirs et les remboursements
create or replace function public.lire_origine_avoir(p_facture uuid) returns public.factures
language plpgsql set search_path = public as $$
declare
  f public.factures;
begin
  select * into f from public.factures where id = p_facture and deleted_at is null for no key update;
  if not found then
    raise exception 'La facture d''origine de cet avoir est introuvable.';
  end if;
  if f.type <> 'facture' then
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
  return f;
end $$;

-- 4. Totaux d'un avoir, négatifs, après contrôle des plafonds
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
    if exists (
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
      'total_ht_brut', -p_origine.total_ht_brut,
      'remise_appliquee', -p_origine.remise_appliquee,
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

revoke all on function public.prochain_numero_avoir(uuid, date) from public, anon;
revoke all on function public.lire_origine_avoir(uuid) from public, anon;
revoke all on function public.totaux_avoir(uuid, numeric, public.factures, boolean) from public, anon;
grant execute on function public.prochain_numero_avoir(uuid, date) to authenticated;
grant execute on function public.lire_origine_avoir(uuid) to authenticated;
grant execute on function public.totaux_avoir(uuid, numeric, public.factures, boolean) to authenticated;

-- 5. Règles de la facture et de l'avoir : reprend verifier_facture (migration 008)
create or replace function public.verifier_facture() returns trigger
language plpgsql set search_path = public as $$
declare
  v_utilisateur constant boolean := auth.uid() is not null;
  v_jour date;
  v_emetteur public.entreprises;
  v_origine public.factures;
  v_totaux jsonb;
begin
  if tg_op = 'DELETE' then
    if v_utilisateur and old.statut <> 'brouillon' then
      raise exception 'Une facture finalisée ne peut pas être supprimée. Sa correction passe par un avoir.';
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
      if new.type = 'avoir' then
        if coalesce(trim(new.motif), '') = '' then
          raise exception 'Le motif de l''avoir est obligatoire.';
        end if;
        v_origine := public.lire_origine_avoir(new.facture_origine_id);
        new.client_id := v_origine.client_id;
        new.date_echeance := null;
        new.remise := case when new.avoir_total then v_origine.remise else 0 end;
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
      if new.type = 'facture' then
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
    else
      v_totaux := public.totaux_facture_calcules(new.id, new.remise);
      new.client_fige := public.instantane_client(new.client_id);
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
       or new.avoir_total is distinct from old.avoir_total then
      raise exception 'Le type d''un document et sa facture d''origine ne peuvent pas être modifiés.';
    end if;
    if new.type = 'avoir' then
      if coalesce(trim(new.motif), '') = '' then
        raise exception 'Le motif de l''avoir est obligatoire.';
      end if;
      if new.client_id is distinct from old.client_id or new.remise is distinct from old.remise
         or new.date_echeance is not null then
        raise exception 'Le client, la remise et l''échéance d''un avoir ne peuvent pas être modifiés.';
      end if;
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
         new.type, new.facture_origine_id, new.avoir_total, new.motif)
     is distinct from
     row(old.client_id, old.date_emission, old.date_echeance, old.remise, old.conditions_paiement,
         old.mode_paiement, old.message_client, old.total_ht_brut, old.remise_appliquee, old.total_ht,
         old.total_tva, old.total_ttc, old.tva_detail, old.client_fige, old.emetteur_fige, old.finalisee_le,
         old.type, old.facture_origine_id, old.avoir_total, old.motif)
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

-- 6. Le cumul des avoirs finalisés atteint le TTC : la facture passe « annulée »
create or replace function public.annuler_facture_soldee() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.factures f set statut = 'annulee'
   where f.id = new.facture_origine_id and f.statut <> 'annulee'
     and f.total_ttc = (
       select coalesce(sum(-a.total_ttc), 0) from public.factures a
        where a.facture_origine_id = f.id and a.type = 'avoir' and a.statut <> 'brouillon'
     );
  return null;
end $$;

drop trigger if exists trg_factures_annulation_avoir on public.factures;
create trigger trg_factures_annulation_avoir after update of statut on public.factures
  for each row when (new.type = 'avoir' and old.statut = 'brouillon' and new.statut <> 'brouillon')
  execute function public.annuler_facture_soldee();

-- 7. Paiements : encaissement sur une facture émise et non annulée ; remboursement plafonné au trop-perçu.
--    Verrou sur la facture : pas de remboursement simultané au-delà du plafond, ni de croisement avec un avoir.
create or replace function public.verifier_paiement() returns trigger
language plpgsql set search_path = public as $$
declare
  f public.factures;
  v_paiement public.paiements;
  v_encaisse numeric; v_rembourse numeric; v_avoirs numeric; v_trop_percu numeric;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_paiement := case when tg_op = 'DELETE' then old else new end;
  select * into f from public.factures where id = v_paiement.facture_id for no key update;
  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select coalesce(sum(montant) filter (where sens = 'encaissement'), 0),
         coalesce(sum(montant) filter (where sens = 'remboursement'), 0)
    into v_encaisse, v_rembourse
    from public.paiements p
   where p.facture_id = f.id and (tg_op = 'INSERT' or p.id <> v_paiement.id);

  if tg_op = 'DELETE' then
    if old.sens = 'encaissement' and v_encaisse < v_rembourse then
      raise exception 'Ce paiement a déjà été remboursé : supprimez d''abord le remboursement.';
    end if;
    return old;
  end if;

  if f.type = 'avoir' then
    raise exception 'Un avoir ne reçoit pas de paiement : le remboursement s''enregistre sur la facture d''origine.';
  end if;
  if f.statut = 'brouillon' then
    raise exception 'Finalisez cette facture avant d''enregistrer un paiement.';
  end if;
  if tg_op = 'UPDATE' and new.sens is distinct from old.sens then
    raise exception 'Le sens d''un paiement ne peut pas être modifié.';
  end if;

  if new.sens = 'encaissement' then
    if f.statut = 'annulee' then
      raise exception 'Une facture annulée ne peut pas recevoir de paiement.';
    end if;
    if tg_op = 'UPDATE' and v_encaisse + new.montant < v_rembourse then
      raise exception 'Ce paiement a déjà été remboursé : supprimez d''abord le remboursement.';
    end if;
    return new;
  end if;

  select coalesce(sum(-a.total_ttc), 0) into v_avoirs
    from public.factures a
   where a.facture_origine_id = f.id and a.type = 'avoir' and a.statut <> 'brouillon';
  v_trop_percu := (v_encaisse - v_rembourse) - (coalesce(f.total_ttc, 0) - v_avoirs);
  if new.montant > v_trop_percu then
    raise exception 'Remboursement refusé : le trop-perçu de cette facture est de % €.', greatest(v_trop_percu, 0);
  end if;
  return new;
end $$;

drop trigger if exists trg_paiements_regles on public.paiements;
create trigger trg_paiements_regles before insert or update or delete on public.paiements
  for each row execute function public.verifier_paiement();

-- 8. Vues : l'avoir est négatif, y compris en brouillon ; une facture émise renvoie ses valeurs figées
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
  coalesce(fg.total_ht, s.signe * round((fa.ht_brut_c - fa.remise_c) / 100, 2)) as total_ht,
  coalesce(fg.total_tva, s.signe * round(coalesce(t.tva_c, 0) / 100, 2)) as total_tva,
  coalesce(fg.total_ttc, s.signe * round((fa.ht_brut_c - fa.remise_c + coalesce(t.tva_c, 0)) / 100, 2)) as total_ttc,
  coalesce(fg.total_ht_brut, s.signe * round(fa.ht_brut_c / 100, 2)) as total_ht_brut,
  coalesce(fg.remise_appliquee, s.signe * round(fa.remise_c / 100, 2)) as remise_appliquee
from fac fa
join public.factures fg on fg.id = fa.facture_id
cross join lateral (select case when fg.type = 'avoir' then -1 else 1 end as signe) s
left join tva t on t.facture_id = fa.facture_id;

-- Même règle que resteAPayer et tropPercu (src/utils/facture.js)
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
where f.type = 'facture';
grant select on public.factures_soldes to authenticated;

-- 9. Création d'un avoir depuis une facture émise : tout réussit ou rien.
--    Total : mêmes lignes et même remise que la facture. Partiel : p_lignes, remise nulle.
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

  if p_total then
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
revoke all on function public.creer_avoir(uuid, text, boolean, jsonb) from public, anon;
grant execute on function public.creer_avoir(uuid, text, boolean, jsonb) to authenticated;

-- 10. enregistrer_facture : reprend la migration 008, avec le motif ; les lignes d'un avoir total sont celles de la facture
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

-- 11. Contrôles finaux
do $$
declare n int; f text; v text;
begin
  foreach f in array array['trg_factures_regles', 'trg_factures_origine', 'trg_factures_annulation_avoir'] loop
    select count(*) into n from pg_trigger
     where not tgisinternal and tgrelid = 'public.factures'::regclass and tgname = f;
    if n <> 1 then raise exception 'Contrôle : trigger % absent', f; end if;
  end loop;
  select count(*) into n from pg_trigger
   where not tgisinternal and tgrelid = 'public.paiements'::regclass and tgname = 'trg_paiements_regles';
  if n <> 1 then raise exception 'Contrôle : trigger trg_paiements_regles absent'; end if;

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

  foreach f in array array['public.creer_avoir(uuid,text,boolean,jsonb)', 'public.enregistrer_facture(uuid,jsonb,jsonb)',
                           'public.totaux_avoir(uuid,numeric,public.factures,boolean)', 'public.lire_origine_avoir(uuid)'] loop
    if (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception 'Contrôle : % ne doit pas être en security definer', f;
    end if;
  end loop;
end $$;

-- 12. Supabase : nouvelles colonnes, vues et fonctions visibles immédiatement par l'API (cache de schéma)
notify pgrst, 'reload schema';

commit;
