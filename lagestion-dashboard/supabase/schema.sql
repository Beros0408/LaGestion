-- Lagestion — Schéma complet de la base (Supabase / PostgreSQL)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create table public.entreprises (
  id uuid primary key default gen_random_uuid(),
  nom text not null, siret text, adresse text, secteur text, logo_url text,
  parametres jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_entreprises_updated before update on public.entreprises
  for each row execute function public.set_updated_at();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  entreprise_id uuid references public.entreprises(id) on delete set null,
  nom text,
  role text not null default 'commercial'
    check (role in ('admin','commercial','comptable','lecture')),
  langue text not null default 'fr',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create index idx_profiles_entreprise on public.profiles(entreprise_id);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid references public.entreprises(id) on delete cascade,
  type text not null default 'entreprise' check (type in ('particulier','entreprise')),
  nom text not null, email text, telephone text, adresse text,
  statut text not null default 'prospect' check (statut in ('actif','prospect','inactif')),
  tags text[] not null default '{}', notes text,
  score integer not null default 0 check (score between 0 and 100),
  siren text, siret text, tva_intra text, site_web text, date_naissance date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_clients_updated before update on public.clients
  for each row execute function public.set_updated_at();
create index idx_clients_entreprise on public.clients(entreprise_id);
create index idx_clients_statut on public.clients(statut) where deleted_at is null;
create index idx_clients_nom on public.clients(nom);
create index idx_clients_email on public.clients(email);
create unique index uniq_clients_email on public.clients (entreprise_id, lower(email))
  where email is not null and deleted_at is null;
create unique index uniq_clients_siren on public.clients (entreprise_id, siren)
  where siren is not null and deleted_at is null;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nom text not null, prenom text, fonction text, email text, telephone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_contacts_updated before update on public.contacts
  for each row execute function public.set_updated_at();
create index idx_contacts_client on public.contacts(client_id);

create table public.opportunites (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid references public.entreprises(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  nom text not null,
  montant numeric(12,2) not null default 0 check (montant >= 0),
  probabilite integer not null default 0 check (probabilite between 0 and 100),
  etape text not null default 'Qualification'
    check (etape in ('Qualification','Proposition','Négociation','Conclusion')),
  date_cloture date, responsable text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger trg_opportunites_updated before update on public.opportunites
  for each row execute function public.set_updated_at();
create index idx_opportunites_client on public.opportunites(client_id);
create index idx_opportunites_etape on public.opportunites(etape) where deleted_at is null;

create table public.factures (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid references public.entreprises(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  numero text not null,
  date_emission date not null default current_date,
  date_echeance date,
  statut text not null default 'brouillon'
    check (statut in ('brouillon','en_attente','envoyee','payee','partiellement_payee','en_retard','annulee')),
  remise numeric(12,2) not null default 0 check (remise >= 0),
  conditions_paiement text, mode_paiement text,
  notes_internes text, message_client text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (entreprise_id, numero)
);
create trigger trg_factures_updated before update on public.factures
  for each row execute function public.set_updated_at();
create index idx_factures_client on public.factures(client_id);
create index idx_factures_statut on public.factures(statut) where deleted_at is null;
create index idx_factures_echeance on public.factures(date_echeance);

create table public.lignes_facture (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references public.factures(id) on delete cascade,
  description text not null, reference text, unite text,
  quantite numeric(12,2) not null default 1 check (quantite > 0),
  prix_unitaire numeric(12,2) not null default 0 check (prix_unitaire >= 0),
  taux_tva numeric(4,2) not null default 20 check (taux_tva >= 0),
  remise numeric(12,2) not null default 0 check (remise >= 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_lignes_facture on public.lignes_facture(facture_id);

create table public.paiements (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references public.factures(id) on delete cascade,
  date date not null default current_date,
  montant numeric(12,2) not null check (montant > 0),
  mode text check (mode in ('virement','carte','cheque','especes','autre')),
  reference text,
  created_at timestamptz not null default now()
);
create index idx_paiements_facture on public.paiements(facture_id);

create or replace view public.factures_totaux as
select f.id as facture_id,
  coalesce(sum(l.quantite * l.prix_unitaire), 0) as total_ht,
  coalesce(sum(l.quantite * l.prix_unitaire * l.taux_tva / 100), 0) as total_tva,
  coalesce(sum(l.quantite * l.prix_unitaire * (1 + l.taux_tva/100)), 0) as total_ttc
from public.factures f
left join public.lignes_facture l on l.facture_id = f.id
group by f.id;

do $$
declare t text;
begin
  foreach t in array array[
    'entreprises','profiles','clients','contacts',
    'opportunites','factures','lignes_facture','paiements'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "acces_authentifies" on public.%I;', t);
    execute format('create policy "acces_authentifies" on public.%I
       for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
