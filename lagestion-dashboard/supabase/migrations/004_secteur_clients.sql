-- 004_secteur_clients.sql — Lagestion
-- Ajoute le secteur d'activité du client (texte libre, facultatif).
-- S'applique après 003_droits_lignes_et_suppression.sql. Rejouable sans erreur.
-- Politiques RLS inchangées : la colonne hérite de celles de public.clients.

begin;

alter table public.clients add column if not exists secteur text;

-- Contrôle final
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'clients'
                   and column_name = 'secteur' and data_type = 'text' and is_nullable = 'YES') then
    raise exception 'Contrôle : colonne public.clients.secteur absente ou mal typée';
  end if;
end $$;

commit;
