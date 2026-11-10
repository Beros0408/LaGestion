-- 016_multi_entreprises.sql — LaGestion
-- Changement d'entreprise (prompt 13, point 5). La base est déjà étanche par entreprise (RLS par appartenance) ;
-- seul le chemin du logo ne l'était pas : un admin pouvait inscrire dans entreprises.logo_url le chemin d'un logo
-- d'une autre entreprise dont il est aussi membre.
--   - contrainte entreprises_logo_dossier : logo_url vide ou {id de l'entreprise}/logo-{horodatage}.png|jpg,
--     même règle que cheminLogoAutorise (src/utils/entrepriseCourante.js) ;
--   - garde : si une ligne existante ne respecte pas cette règle, la migration s'arrête sans rien modifier
--     et liste les entreprises concernées ; à corriger à la main (logo_url = null), puis relancer.
-- Les logos déjà figés dans emetteur_fige des documents émis ne sont pas concernés.
-- S'applique après 015_description_lignes.sql. Rejouable sans erreur.

begin;

alter table public.entreprises drop constraint if exists entreprises_logo_dossier;

do $$
declare
  n int;
  liste text;
begin
  select count(*), string_agg(id::text || ' (' || coalesce(logo_url, '') || ')', ', ' order by id)
    into n, liste
    from public.entreprises
   where logo_url is not null
     and logo_url !~ ('^' || id::text || '/logo-[0-9]+\.(png|jpg)$');
  if n > 0 then
    raise exception 'Migration 016 arrêtée : % entreprise(s) avec un chemin de logo hors de leur dossier : %. Rien n''a été modifié.', n, liste
      using hint = 'Vérifiez ces lignes, mettez logo_url à null (ou au bon chemin), puis relancez la migration.';
  end if;
end $$;

alter table public.entreprises add constraint entreprises_logo_dossier
  check (logo_url is null or logo_url ~ ('^' || id::text || '/logo-[0-9]+\.(png|jpg)$'));

-- Contrôle final
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'entreprises_logo_dossier' and contype = 'c' and convalidated) then
    raise exception 'Contrôle : contrainte entreprises_logo_dossier absente ou non validée';
  end if;
end $$;

commit;
