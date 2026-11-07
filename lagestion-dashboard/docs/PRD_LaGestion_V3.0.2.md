# LaGestion — PRD MVP V3.0.2
**Référence :** cahier des charges V3.0.2 du 24/10/2026 (périmètre MVP), complété par V3.0.1 (vision globale). **Statut :** spécification de travail, décisions à valider.

## 1. Vision et cible
SaaS B2B multi-entreprises pour TPE/PME généralistes et petites entreprises BTP (1–20 salariés). Promesse : parcours prospect → devis → facture → paiement ; pour BTP, devis → chantier → dépenses → facture d'acompte/solde sans ressaisie. Français et anglais dès le départ.

## 2. Personnes et permissions
Propriétaire, administrateur, commercial, gestion/comptabilité, chef de chantier, lecteur/auditeur. Permissions vérifiées côté serveur et via RLS ; un utilisateur peut appartenir à plusieurs entreprises sans fuite de données. Inviter, retirer, suspendre des membres ; modules et quotas selon abonnement.

## 3. Exigences MVP (P0 obligatoire)
| ID | Module | Exigences | Acceptation |
|---|---|---|---|
| SAAS-01 | Fondation | Auth, tenants, memberships, invitations, rôles, plans, quotas | Utilisateur A ne lit/modifie/exporte aucune donnée du tenant B ; tests automatisés |
| CRM-01 | CRM | Clients, contacts, prospects, pipeline simple, notes, activités | Création, modification, recherche, filtres, historique ; permissions testées |
| VEN-01 | Vente | Catalogue/lignes, taxes, remises, devis, statuts, conversion en facture | Totaux exacts en décimal ; devis accepté converti sans ressaisie |
| FAC-01 | Facturation | Factures, avoirs, acomptes, échéances, PDF, numérotation | Numérotation cohérente, calculs testés, documents validés non supprimés physiquement |
| PAY-01 | Paiements | Enregistrement manuel, solde, impayés, brouillon de relance | Paiement partiel et complet reflétés dans le solde ; envoi seulement après validation |
| BTP-01 | BTP | Chantier lié au devis, budget, dépenses, pièces, marge estimée | Dépense affectée au bon chantier ; écarts budget/réel visibles |
| KPI-01 | Pilotage | CA, devis en attente, impayés, budgets chantier | Chiffres dérivés des mêmes données métier, filtrés par tenant |
| IWA-01 | IA hybride | Questions sur données autorisées, synthèses, alertes, brouillons | Aucune écriture ni envoi sans approbation ; sources affichées, coûts tracés |
| EXP-01 | Exports | CSV UTF-8, XLSX, PDF ; clients, ventes, factures, impayés, chantiers | Filtres identiques et totaux cohérents ; génération serveur, audit et contrôle d'accès |
| UX-01 | Interface | FR/EN, responsive, accessible, personnalisation simple | Pas de chaînes métier en dur ; navigation clavier ; parcours E2E desktop/mobile |
| SUB-01 | Abonnement | Starter, Business IA, BTP Pro, essais, suspension, quotas | Contrôles de droits serveur ; tarifs à définir, webhooks vérifiés |

## 4. Parcours de recette E2E
**Généraliste :** créer prospect → qualifier → établir devis → accepter → générer facture → enregistrer paiement → constater mise à jour KPI.
**BTP :** créer client → devis main-d'œuvre/matériaux/quantités → chantier → dépenses et documents → comparer budget/réel → facture acompte/solde.
**Sécurité :** 2 tenants distincts ; refuser accès croisé via UI, API, base, Storage, IWa et exports.

## 5. IWa : politique produit
Lecture seulement sur les enregistrements autorisés par outils métier ; calculs de TVA, marges et montants effectués par code déterministe. Réponses avec références d'enregistrements. Brouillons de relance, explication de tableaux de bord, alertes sur devis/factures/chantiers. Toute écriture ou action externe exige une approbation explicite dans le MVP. Quotas et plafond de dépense IA par entreprise, audit, défense contre injection, désactivation par tenant. Les automatisations autonomes complexes sont hors MVP.

## 6. Architecture cible
Next.js + TypeScript strict + Tailwind + composants accessibles sur Vercel. Supabase Auth/PostgreSQL/Storage ; RLS tenant_id sur toutes les entités métier ; API serveur validée ; migrations SQL versionnées ; services métier isolés des fournisseurs. Adaptateurs pour LLM, e-mail, abonnements et future facturation électronique. Jobs asynchrones idempotents si nécessaire. Secrets côté serveur uniquement ; URLs de fichiers privées/signées. Prévoir export/migration vers autre hébergeur.

## 7. Entités minimales
`tenants, memberships, users, roles, customers, contacts, leads, opportunities, activities, quotes, quote_lines, invoices, invoice_lines, credit_notes, payments, reminders, projects, project_costs, attachments, audit_logs, ai_requests, subscriptions`. Ajouter selon nécessité sans complexifier le MVP. Montants DECIMAL/NUMERIC et devise explicite ; intégrité référentielle et clés composites tenant quand pertinent.

## 8. UX/UI
Palette suggérée #489AF0, #245A8D, #F7F9FC, #243247, #C8A55A ; contraste WCAG 2.2 AA à vérifier. Menu latéral, recherche, listes filtrables, formulaires courts, erreurs utiles, états vides, IWa accessible. Maquettes à valider : Dashboard, Clients, Pipeline, Devis, Factures, Chantiers, IWa, Paramètres. FR par défaut ; dates/nombres/devises localisés ; langue des documents indépendante.

## 9. Sécurité et conformité
RGPD, minimisation, conservation, droits des personnes, audit, MFA admins, sauvegardes et restauration testée, rate limiting, tests d'accès croisé, revue des dépendances. Les factures PDF seules ne garantissent pas la conformité à la facturation électronique française : intégration future à une plateforme agréée et validation juridique/comptable avant commercialisation. Ne jamais présenter le logiciel comme conforme sans preuve.

## 10. Hors MVP
Comptabilité générale, paie, stocks avancés, marketing multicanal, app native, marketplace, planification BTP multi-équipes, situations de travaux complexes, agent autonome sans supervision, rapports IA avancés planifiés.

## 11. Phases et portes de validation
0 Architecture/maquettes/backlog/sécurité (2–3 sem.) ; 1 Socle SaaS FR/EN et CRM (4–6) ; 2 Devis/factures/paiements (4–6) ; 3 BTP/dashboard/exports (4–5) ; 4 IWa/tests/pilotes (4–6). Durées indicatives, non garanties. Avant chaque phase : architecture, risques, tests et validation humaine. Définition de terminé : critères d'acceptation, tests unitaires/intégration/E2E, revue sécurité, doc, UX FR/EN, démo.

## 12. Indicateurs et décisions ouvertes
Piloter 10–15 entretiens, puis 5 entreprises pilotes ; mesurer temps de tâches, adoption, incidents, rétention, disposition à payer. Arbitrer avant implémentation : prestataires LLM/e-mail/paiement, tarifs et quotas, hébergement workers, facturation électronique, numérotation/avoirs, politique de rétention et gestion fiscale. Ne jamais inventer ces décisions.
