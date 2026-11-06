-- 011_reglements_relances.sql — Lagestion
-- Suivi des règlements et relances assistées (FR-008).
--   - la colonne statut ne garde que le cycle de vie : brouillon, finalisee, envoyee, annulee ;
--   - payée, partiellement payée et en retard sont calculés à la lecture (fonction statut_paiement, vue factures_soldes),
--     avec la même règle que statutCalcule (src/utils/facture.js) : le retard arrive sans aucune écriture, un trigger
--     ne pourrait pas le poser, et une tâche planifiée créerait une seconde source de vérité ;
--   - plafond sous verrou de la facture : encaissé net + nouvel encaissement ≤ TTC − avoirs ;
--     un avoir postérieur au paiement crée toujours un trop-perçu, remboursable comme à la migration 009 ;
--   - relances : table sans modification ni suppression pour les utilisateurs ; tous les contrôles sont dans le trigger,
--     aucune écriture directe ne les contourne. Mise en demeure réservée à admin, manager et comptable ;
--   - aucun envoi : l'application prépare le texte, l'utilisateur le copie.
-- Mentions légales : les modèles de relance les citent ; rien n'est ajouté aux factures.
-- Comme les migrations 003, 007 à 010, les règles ne s'appliquent qu'à un utilisateur authentifié : le SQL Editor
-- (rôle postgres, seed) reste libre, sauf les contraintes.
-- S'applique après 010_acomptes.sql. Rejouable sans erreur.

begin;

-- 1. Statuts existants : payée, partiellement payée et en retard redeviennent envoyée, puis sont recalculés.
--    Une facture marquée payée sans règlement réapparaît impayée : listée ici, aucun paiement n'est créé.
do $$
declare r record; n int := 0; v_total int;
begin
  for r in
    select f.numero, s.total_ttc, s.avoirs_ttc, s.encaisse_net
    from public.factures f join public.factures_soldes s on s.facture_id = f.id
    where f.statut = 'payee' and s.total_ttc - s.avoirs_ttc - s.encaisse_net > 0
    order by f.numero
  loop
    n := n + 1;
    raise notice 'Marquée payée sans règlement complet : % (TTC %, avoirs %, encaissé %)', r.numero, r.total_ttc, r.avoirs_ttc, r.encaisse_net;
  end loop;
  raise notice 'Factures marquées payées sans règlement complet : %', n;

  n := 0;
  for r in
    select f.numero, s.total_ttc, s.avoirs_ttc, s.encaisse_net
    from public.factures f join public.factures_soldes s on s.facture_id = f.id
    where s.encaisse_net > s.total_ttc - s.avoirs_ttc and f.statut <> 'annulee'
    order by f.numero
  loop
    n := n + 1;
    raise notice 'Encaissé supérieur au dû : % (TTC %, avoirs %, encaissé %)', r.numero, r.total_ttc, r.avoirs_ttc, r.encaisse_net;
  end loop;
  raise notice 'Factures dont l''encaissé dépasse le dû : %', n;

  update public.factures set statut = 'envoyee' where statut in ('payee', 'partiellement_payee', 'en_retard');
  get diagnostics v_total = row_count;
  raise notice 'Factures repassées à envoyée, statut désormais calculé : %', v_total;
end $$;

alter table public.factures drop constraint if exists factures_statut_check;
alter table public.factures add constraint factures_statut_check
  check (statut in ('brouillon', 'finalisee', 'envoyee', 'annulee'));

-- 2. Statut de paiement : même règle que statutCalcule (src/utils/facture.js)
create or replace function public.statut_paiement(
  p_statut text, p_type text, p_echeance date, p_ttc numeric, p_avoirs numeric, p_encaisse numeric,
  p_jour date default public.date_du_jour_paris()
) returns text
language sql stable set search_path = public as $$
  select case
    when p_type = 'avoir' or p_statut in ('brouillon', 'annulee') then p_statut
    when coalesce(p_ttc, 0) - coalesce(p_avoirs, 0) - coalesce(p_encaisse, 0) <= 0 then 'payee'
    when p_echeance is not null and p_echeance < p_jour then 'en_retard'
    when coalesce(p_encaisse, 0) > 0 then 'partiellement_payee'
    else p_statut
  end
$$;
revoke all on function public.statut_paiement(text, text, date, numeric, numeric, numeric, date) from public, anon;
grant execute on function public.statut_paiement(text, text, date, numeric, numeric, numeric, date) to authenticated;

-- 3. Vue : reprend la migration 010, avec le statut calculé et les jours de retard
create or replace view public.factures_soldes with (security_invoker = on) as
select f.id as facture_id,
  t.total_ttc,
  a.avoirs_ttc,
  p.encaisse_net,
  greatest(0, t.total_ttc - a.avoirs_ttc - p.encaisse_net) as reste_a_payer,
  greatest(0, p.encaisse_net - (t.total_ttc - a.avoirs_ttc)) as trop_percu,
  public.statut_paiement(f.statut, f.type, f.date_echeance, t.total_ttc, a.avoirs_ttc, p.encaisse_net) as statut_calcule,
  case when t.total_ttc - a.avoirs_ttc - p.encaisse_net > 0 and f.date_echeance is not null
       then greatest(0, public.date_du_jour_paris() - f.date_echeance) else 0 end as jours_retard
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

-- 4. Règles des documents : reprend verifier_facture (migration 010) ; les statuts calculés ne se posent plus
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
    elsif new.statut in ('payee', 'partiellement_payee', 'en_retard') then
      raise exception 'Ce statut est calculé à partir des règlements et de l''échéance : il ne se choisit pas.';
    elsif old.statut = 'annulee' or new.statut = 'finalisee' then
      raise exception 'Ce changement de statut n''est pas autorisé.';
    end if;
  end if;

  return new;
end $$;

-- 5. Paiements : reprend verifier_paiement (migration 009), avec le plafond des encaissements
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

  select coalesce(sum(-a.total_ttc), 0) into v_avoirs
    from public.factures a
   where a.facture_origine_id = f.id and a.type = 'avoir' and a.statut <> 'brouillon';

  if new.sens = 'encaissement' then
    if f.statut = 'annulee' then
      raise exception 'Une facture annulée ne peut pas recevoir de paiement.';
    end if;
    if tg_op = 'UPDATE' and v_encaisse + new.montant < v_rembourse then
      raise exception 'Ce paiement a déjà été remboursé : supprimez d''abord le remboursement.';
    end if;
    -- Plafond : encaissé net + ce montant ≤ TTC − avoirs. Le verrou sur la facture sérialise les encaissements.
    if (v_encaisse - v_rembourse) + new.montant > coalesce(f.total_ttc, 0) - v_avoirs then
      raise exception 'Encaissement refusé : le reste à payer de cette facture est de % €.',
        greatest(coalesce(f.total_ttc, 0) - v_avoirs - (v_encaisse - v_rembourse), 0);
    end if;
    return new;
  end if;
  v_trop_percu := (v_encaisse - v_rembourse) - (coalesce(f.total_ttc, 0) - v_avoirs);
  if new.montant > v_trop_percu then
    raise exception 'Remboursement refusé : le trop-perçu de cette facture est de % €.', greatest(v_trop_percu, 0);
  end if;
  return new;
end $$;

-- 6. Relances
create table if not exists public.relances (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  facture_id uuid not null references public.factures(id) on delete cascade,
  niveau smallint not null check (niveau between 1 and 3),
  objet text not null check (trim(objet) <> ''),
  corps text not null check (trim(corps) <> ''),
  destinataire text,
  reste_a_payer numeric(14,2) not null,
  auteur uuid references auth.users(id) on delete set null,
  auteur_nom text not null default 'Utilisateur',
  created_at timestamptz not null default now()
);
create index if not exists idx_relances_facture on public.relances(facture_id, created_at desc);
create index if not exists idx_relances_entreprise on public.relances(entreprise_id);

-- Tout est contrôlé ici : aucune écriture directe ne contourne les règles.
create or replace function public.verifier_relance() returns trigger
language plpgsql set search_path = public as $$
declare
  f public.factures;
  s record;
  v_dernier smallint;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op <> 'INSERT' then
    raise exception 'Une relance tracée ne peut être ni modifiée ni supprimée.';
  end if;
  -- Sans droit d'écriture : la RLS refuse, inutile d'aller plus loin.
  if not public.has_role(new.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    return new;
  end if;

  select * into f from public.factures where id = new.facture_id and deleted_at is null for no key update;
  if not found then
    raise exception 'Cette facture est introuvable.';
  end if;
  if f.type = 'avoir' then
    raise exception 'Un avoir ne se relance pas.';
  end if;
  if f.statut in ('brouillon', 'annulee') then
    raise exception 'Seule une facture émise et non annulée peut être relancée.';
  end if;
  select * into s from public.factures_soldes where facture_id = f.id;
  if coalesce(s.reste_a_payer, 0) <= 0 then
    raise exception 'Cette facture n''a plus de reste à payer.';
  end if;
  if f.date_echeance is null or f.date_echeance >= public.date_du_jour_paris() then
    raise exception 'Cette facture n''est pas encore échue : pas de relance avant l''échéance.';
  end if;
  if new.niveau = 3 and not public.has_role(new.entreprise_id, '{admin,manager,comptable}'::public.app_role[]) then
    raise exception 'Seul un administrateur, un manager ou un comptable peut préparer une mise en demeure.'
      using errcode = 'insufficient_privilege';
  end if;
  select coalesce(max(niveau), 0) into v_dernier from public.relances where facture_id = f.id;
  if new.niveau > v_dernier + 1 then
    raise exception 'Niveau de relance refusé : le niveau suivant de cette facture est le niveau %.', v_dernier + 1;
  end if;

  -- Valeurs tracées par la base, jamais par le navigateur
  new.reste_a_payer := s.reste_a_payer;
  new.auteur := auth.uid();
  new.auteur_nom := coalesce((select nullif(trim(p.nom), '') from public.profiles p where p.id = auth.uid()), 'Utilisateur');
  new.created_at := now();
  return new;
end $$;

drop trigger if exists trg_relances_entreprise on public.relances;
create trigger trg_relances_entreprise before insert or update on public.relances
  for each row execute function public.verifier_entreprise('factures', 'facture_id');

drop trigger if exists trg_relances_regles on public.relances;
create trigger trg_relances_regles before insert or update or delete on public.relances
  for each row execute function public.verifier_relance();

drop trigger if exists audit_relances on public.relances;
create trigger audit_relances after insert or update or delete on public.relances
  for each row execute function public.audit_trigger();

revoke all on public.relances from anon, authenticated;
grant select, insert on public.relances to authenticated;

alter table public.relances enable row level security;
drop policy if exists lecture_membres on public.relances;
drop policy if exists creation_equipe on public.relances;
create policy lecture_membres on public.relances for select to authenticated
  using (public.is_member(entreprise_id));
create policy creation_equipe on public.relances for insert to authenticated
  with check (public.has_role(entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]));

-- 7. Trace d'une relance préparée : aucun envoi. Le trigger fait les contrôles.
create or replace function public.preparer_relance(p_facture_id uuid, p_niveau integer, p_objet text, p_corps text, p_destinataire text default null)
returns uuid
language plpgsql set search_path = public as $$
declare
  f public.factures;
  v_relance uuid;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  select * into f from public.factures where id = p_facture_id and deleted_at is null;
  if not found then
    raise exception 'Cette facture est introuvable.';
  end if;
  if not public.has_role(f.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    raise exception 'Votre rôle ne permet pas de préparer une relance.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_objet), '') = '' or coalesce(trim(p_corps), '') = '' then
    raise exception 'L''objet et le texte de la relance sont obligatoires.';
  end if;
  insert into public.relances (entreprise_id, facture_id, niveau, objet, corps, destinataire, reste_a_payer)
  values (f.entreprise_id, p_facture_id, p_niveau, p_objet, p_corps, nullif(trim(p_destinataire), ''), 0)
  returning id into v_relance;
  return v_relance;
end $$;
revoke all on function public.preparer_relance(uuid, integer, text, text, text) from public, anon;
grant execute on function public.preparer_relance(uuid, integer, text, text, text) to authenticated;

-- 8. Contrôles finaux
do $$
declare n int; v text; f text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.relances'::regclass) then
    raise exception 'Contrôle : RLS inactive sur public.relances';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'relances';
  if n <> 2 then raise exception 'Contrôle : public.relances a % politique(s) au lieu de 2', n; end if;
  select count(*) into n from pg_trigger where not tgisinternal and tgrelid = 'public.relances'::regclass
    and tgname in ('trg_relances_entreprise', 'trg_relances_regles', 'audit_relances');
  if n <> 3 then raise exception 'Contrôle : % trigger(s) sur public.relances au lieu de 3', n; end if;
  if exists (select 1 from public.factures where statut in ('payee', 'partiellement_payee', 'en_retard', 'en_attente')) then
    raise exception 'Contrôle : il reste des statuts de paiement stockés';
  end if;
  foreach v in array array['factures_soldes', 'factures_totaux'] loop
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
  foreach f in array array['public.preparer_relance(uuid,integer,text,text,text)',
                           'public.verifier_relance()', 'public.verifier_paiement()', 'public.verifier_facture()'] loop
    if (select prosecdef from pg_proc where oid = f::regprocedure) then
      raise exception 'Contrôle : % ne doit pas être en security definer', f;
    end if;
  end loop;
end $$;

-- 9. Supabase : nouvelle table, vue et fonctions visibles immédiatement par l'API (cache de schéma)
notify pgrst, 'reload schema';

commit;
