-- 015_description_lignes.sql — LaGestion
-- Désignation obligatoire sur les lignes (mention obligatoire des factures) : une description vide ou faite
-- d'espaces est refusée sur lignes_facture (factures, avoirs, acomptes, soldes) et lignes_devis.
--   - texte_vide : espaces, tabulations, retours à la ligne, espace insécable (U+00A0), espace fine insécable (U+202F)
--     et U+FEFF ignorés ; même règle que descriptionVide (src/utils/lignesDocument.js) ;
--   - lignes vides d'un BROUILLON (supprimé ou non) : description « Ligne sans description » ;
--   - lignes d'un document émis (finalisé, envoyé, payé, annulé) ou d'un devis non brouillon : jamais modifiées ;
--     s'il en existe, la contrainte reste « not valid » (nouvelles écritures contrôlées) et la migration le signale.
-- Comme les migrations précédentes, les triggers de règles laissent passer le rôle postgres (auth.uid() nul).
-- S'applique après 014_mentions.sql. Rejouable sans erreur.

begin;

-- 1. Règle unique
create or replace function public.texte_vide(p text) returns boolean
language sql immutable set search_path = public as $$
  select btrim(coalesce(p, ''), E' \t\n\r\f\u000b  ﻿') = ''
$$;
revoke all on function public.texte_vide(text) from public, anon;
grant execute on function public.texte_vide(text) to authenticated;

-- 2. Corrections des brouillons, puis contraintes (validées s'il ne reste aucune ligne vide)
alter table public.lignes_facture drop constraint if exists lignes_facture_description_non_vide;
alter table public.lignes_devis drop constraint if exists lignes_devis_description_non_vide;

do $$
declare
  n_factures int;
  n_devis int;
  reste_factures int;
  reste_devis int;
begin
  update public.lignes_facture l set description = 'Ligne sans description'
    from public.factures f
   where f.id = l.facture_id and f.statut = 'brouillon' and public.texte_vide(l.description);
  get diagnostics n_factures = row_count;

  update public.lignes_devis l set description = 'Ligne sans description'
    from public.devis d
   where d.id = l.devis_id and d.statut = 'brouillon' and public.texte_vide(l.description);
  get diagnostics n_devis = row_count;

  raise notice 'Lignes de brouillon corrigées (« Ligne sans description ») : % ligne(s) de facture, % ligne(s) de devis.',
    n_factures, n_devis;

  select count(*) into reste_factures from public.lignes_facture where public.texte_vide(description);
  select count(*) into reste_devis from public.lignes_devis where public.texte_vide(description);

  alter table public.lignes_facture add constraint lignes_facture_description_non_vide
    check (not public.texte_vide(description)) not valid;
  alter table public.lignes_devis add constraint lignes_devis_description_non_vide
    check (not public.texte_vide(description)) not valid;

  if reste_factures = 0 then
    alter table public.lignes_facture validate constraint lignes_facture_description_non_vide;
  else
    raise warning 'lignes_facture : % ligne(s) vide(s) de documents émis, conservées ; contrainte laissée « not valid ».', reste_factures;
  end if;
  if reste_devis = 0 then
    alter table public.lignes_devis validate constraint lignes_devis_description_non_vide;
  else
    raise warning 'lignes_devis : % ligne(s) vide(s) de devis non brouillon, conservées ; contrainte laissée « not valid ».', reste_devis;
  end if;
end $$;

-- 3. Contrôles finaux
do $$
declare n int;
begin
  select count(*) into n from pg_constraint
   where conname in ('lignes_facture_description_non_vide', 'lignes_devis_description_non_vide') and contype = 'c';
  if n <> 2 then raise exception 'Contrôle : % contrainte(s) de description sur 2', n; end if;
  if not public.texte_vide(E'  \t') or public.texte_vide('Pose') then
    raise exception 'Contrôle : texte_vide inattendue';
  end if;
end $$;

commit;
