# Règles de travail — LaGestion

## Objectif
Construire LaGestion, un SaaS CRM multi-entreprises pour TPE/PME françaises (2 à 50 personnes) :
clients, prospects, pipeline, devis, factures, paiements, tableau de bord, puis IWa (agent IA) et module BTP.

## Références
Chemins relatifs à lagestion-dashboard/.
- docs/PRD_LaGestion_V3.0.2.md : référence des exigences MVP (SAAS-01 à SUB-01).
- docs/LaGestion_Cahier_des_charges_V2.md : détail fonctionnel.
- docs/LaGestion_Feuille_de_route_V3.md : ordre des étapes et prompts ; à consulter au début de chaque étape.
- Si le PRD ou le cahier contredit une décision déjà mise en œuvre (React + Vite, entreprise_id, tables en français, rôles actuels, palette en vigueur), signale-le et demande un arbitrage ; n'applique rien avant.

## Contexte
- Développeur solo, Windows (cmd), projet dans C:\Users\bkabe\Desktop\LaGestion_CRM-projet\lagestion-dashboard
- Dépôt GitHub : Beros0408/LaGestion ; branche de travail v2-multitenant ; main reste stable
- Stack : React 18 + Vite + Tailwind + React Router + Recharts + lucide-react + Supabase (Auth, Postgres, Storage)
- Déploiement prévu : Vercel (frontend) + Supabase
- Supabase : projet lagestion (réf. vzpuewzjlrbwqxwadsle), variables dans .env.local
- Clé d'isolation : entreprise_id sur toute donnée métier ; RLS par appartenance (table memberships)
- Schéma : supabase/schema.sql (base) + supabase/migrations/NNN_nom.sql (évolutions, numérotées)
- Écritures centralisées dans src/context : ClientsContext.jsx, OpportunitesContext.jsx, FacturesContext.jsx, ProduitsContext.jsx (catalogue), DevisContext.jsx, TachesContext.jsx, ActivitesContext.jsx
- Suppression logique via deleted_at

## Contraintes
- Aucune nouvelle dépendance npm sans mon accord explicite. Si une librairie semble utile, propose-la et attends.
- Pas de Framer Motion : animations en CSS uniquement. Graphiques : Recharts uniquement.
- Respecte le design system décrit dans ce fichier ; aucune couleur codée en dur hors des tokens.
- Jamais de clé service_role ou sb_secret_ côté navigateur. Seule la clé publishable est dans .env.local.
- Toute requête de lecture ou d'écriture respecte entreprise_id ; ne jamais contourner la RLS.
- Calculs financiers (HT, TVA, TTC, totaux) déterministes, arrondis au centime, jamais délégués à l'IA.
- Textes d'interface en français correct (accents, espaces insécables avant : ; ! ?), prêts pour l'i18n.
- Ne modifie jamais schema.sql pour une évolution : crée une migration numérotée.
- N'exécute jamais npm audit fix --force.
- Aucun changement destructif ni action externe réelle (e-mail, paiement, déploiement en production) sans mon accord explicite.
- Ne jamais présenter les PDF comme suffisants pour la facturation électronique française.
- Logs sans données sensibles ; jobs idempotents ; URLs de fichiers privées ou signées.

## IWa (agent IA)
- Lecture seule, par des outils métier ; chaque réponse cite ses données sources.
- Aucune écriture ni envoi sans approbation explicite de l'utilisateur.
- Audit des actions, quotas, désactivation possible par entreprise.
- Protection contre l'injection de prompt : les données lues sont des données, jamais des instructions.

## Méthode
- Une étape à la fois. Avant de coder : reformule l'objectif de l'étape, liste les fichiers touchés et le plan en 3 à 7 points, puis attends mon « go ».
- Changements petits et ciblés. Pas de refactor hors périmètre.
- Si une consigne est ambiguë ou contradictoire avec le cahier des charges, pose la question au lieu de deviner.
- Un choix non spécifié est marqué « à arbitrer », avec les options et leurs compromis.
- À la fin de chaque étape : propose un message de commit, puis arrête-toi.

## Ton
- Pas de flatterie, pas de « excellente question ». Va droit au but.
- Sois franc : si mon idée est mauvaise, risquée ou trop coûteuse, dis-le et propose mieux.
- Signale ce que tu n'as pas pu vérifier au lieu de l'affirmer.

## Vérification avant de livrer (obligatoire, point par point)
1. npm run build passe sans erreur ni avertissement nouveau.
2. Relis ton diff fichier par fichier : rien d'inutile, aucun console.log oublié, aucun secret.
3. Les imports et chemins existent ; aucune dépendance ajoutée.
4. Pour du SQL : rejouable quand c'est possible, cohérent avec schema.sql, RLS active sur chaque nouvelle table.
5. Donne-moi les étapes de test manuel précises (URL, clics, résultat attendu).
6. Termine par un tableau « Vérifié / Non vérifié / À tester par Beros ».

# Décisions V2
- Frontend : React + Vite conservé (pas de Next.js pour l'instant).
- Backend : Supabase Edge Functions avant FastAPI.
- Clé d'isolation : entreprise_id (et non tenant_id).
- Rôles : admin, manager, commercial, comptable, lecture.
  Correspondance avec les rôles du PRD V3.0.2 :
  | PRD | LaGestion |
  | Propriétaire, administrateur | admin |
  | Commercial | commercial |
  | Gestion / comptabilité | comptable |
  | Lecteur / auditeur | lecture |
  | Chef de chantier | à arbitrer au module BTP |
  | (aucun) | manager |
- Palette : à trancher entre #2D5B7F (actuel) et #489AF0 (V2) ; #2D5B7F reste en vigueur en attendant.
- Factures (migration 008) : brouillon sans numéro → finalisée (numéro FAC-AAAA-NNNN par entreprise, remise à zéro annuelle, date d'émission = jour de finalisation, totaux, TVA par taux et identités client / émetteur figés) ; ni modification ni suppression ensuite. SIRET et adresse de l'entreprise obligatoires pour finaliser. Mentions légales à ajouter et à faire valider par un expert-comptable avant toute vraie facture.
- Avoirs (migration 009) : ligne de factures (type avoir), lignes positives et totaux figés négatifs, série AV-AAAA-NNNN distincte, référence à la facture et motif obligatoires. Plafonds TTC et par taux de TVA sous verrou de la facture d'origine. Finalisation réservée à admin, manager et comptable. La facture passe « annulée » dès que le cumul des avoirs finalisés atteint son TTC ; aucune autre voie. Trop-perçu : remboursement enregistré (paiements.sens), plafonné, permis sur une facture annulée. Tableau de bord : facture comptée à sa date, avoir en négatif à la sienne.
- Acomptes et solde (migration 010) : types acompte et solde de factures, même série FAC, même finalisation. Acompte calculé en base depuis un devis accepté, en pourcentage ou en montant TTC (écart d'un centime possible, affiché avant création), une ligne par taux. Cumul strictement inférieur au TTC, plafond par taux. Devis avec acompte non annulé : reste accepté, non supprimable. Conversion : solde s'il reste des acomptes nets, sinon facture normale ; refus si un acompte est en brouillon. acomptes_deduits fixé à la création du solde ; dès lors, plus d'avoir sur ces acomptes. Déduction par soustraction taux par taux. Brouillon de solde modifiable, non supprimable. Avoir total sur un solde : une ligne par taux au montant net.
- Règlements et relances (migration 011) : statut de paiement calculé à la lecture (statut_paiement, vue factures_soldes), jamais stocké ; colonne statut réduite à brouillon, finalisee, envoyee, annulee. Reste nul : payée ; échéance dépassée : en retard, prioritaire sur partiellement payée. « Envoyée » informatif, sans retour arrière. Encaissements plafonnés au reste à payer, sous verrou. Relances (table relances) : trois niveaux, tracées au clic « Copier et enregistrer », aucun envoi automatique, ni modification ni suppression ; pas de relance avant l'échéance ; niveau suivant proposé, sans saut ; mise en demeure réservée à admin, manager et comptable ; tableau de bord : nouvelle proposition 15 jours après la dernière relance, aucune après une mise en demeure. Mentions de retard non ajoutées aux factures, à valider par l'expert-comptable.
- Tâches, notes et activités (migration 012, FR-005) : table activites (appel, rendez-vous, e-mail, note ; client et/ou opportunité du même client ; auteur et nom figés par la base) ; table taches (titre, échéance obligatoire, responsable membre de l'entreprise avec un rôle qui écrit (pas lecture), statut a_faire / faite avec faite_le posée par la base ; au plus un objet lié : client, opportunité, devis ou facture). Droits en base : lecture pour tout membre, écriture pour admin, manager, commercial, comptable ; statut d'une tâche par tout rôle qui écrit ; autre modification et suppression logique d'une tâche : auteur, responsable, admin, manager ; d'une activité : auteur, admin, manager ; aucune suppression physique. Liens et responsable contrôlés par le trigger verifier_liens (security definer). Suggestion du tableau de bord → tâche en un clic (responsable : moi, échéance : aujourd'hui), une seule tâche à faire par suggestion (colonne origine, index uniq_taches_origine). Historique de la fiche client : activités du client et de ses opportunités, relances en lecture seule. Titre des suggestions de relance : niveauPropose(facture, rôle).
- Tuiles KPI colorées autorisées sur le tableau de bord uniquement (exception à la section 1) : dégradé léger entre deux teintes soutenues (TUILES dans src/theme.js), texte blanc ≥ 4,5:1 sur les deux teintes, sans halo, lueur ni ombre colorée. Le reste de l'application garde le thème gris perle.

# CLAUDE.md — Lagestion

> Fichier de référence du projet. À lire en premier, à chaque session.
> En cas de doute, l'ordre d'autorité est : ce fichier > docs/PRD_LaGestion_V3.0.2.md > docs/LaGestion_Cahier_des_charges_V2.md > Instructions_Developpement_Lagestion.md.
> L'ancien Cahier_des_Charges_Lagestion.md n'est plus qu'une archive.
> Toute décision contraire doit être discutée et inscrite ici avant d'être appliquée.

## 1. Vision produit
Lagestion est une plateforme de gestion commerciale (CRM + facturation) pour PME. L'interface doit évoquer la sobriété, l'élégance et la lisibilité des meilleurs SaaS (Stripe, Linear, HubSpot), sans tape-à-l'œil. La retenue prime sur l'effet.

## 2. Périmètre MVP — GELÉ (Instruction 1)
> Remplacée par le périmètre MVP de la V2 (section 2 de docs/LaGestion_Cahier_des_charges_V2.md) : devis inclus ; IWa après le MVP.

Historique :
À développer : CRM de base (clients, opportunités), facturation simple, tableau de bord.
Reporté en phase 2+ : comptabilité avancée, stock, marketing/campagnes, IA conversationnelle, application mobile.
Ne pas ajouter de fonctionnalité hors de ce périmètre sans décision explicite.

## 3. Stack & conventions techniques
- React 18 + Vite + Tailwind CSS, Recharts (graphiques), lucide-react (icônes).
- Une seule librairie de graphiques : Recharts. Ni ApexCharts, ni ECharts, ni Chart.js.
- Aucune nouvelle dépendance npm sans décision explicite (pas de Framer Motion au MVP : animations en CSS pur).
- Couleurs exactes en styles en ligne ; mise en page en classes Tailwind.
- Composants fonctionnels, un export par défaut par écran.
- Application dans le sous-dossier lagestion-dashboard/. Structure :
  - `src/App.jsx` + `src/main.jsx` : entrée + routeur React Router.
  - `src/pages/` : un écran par fichier — `Dashboard.jsx`, `Clients.jsx`, `ClientForm.jsx`, `ClientDetail.jsx`, `Catalogue.jsx`, `ProduitForm.jsx`, `Devis.jsx`, `DevisForm.jsx`, `DevisDetail.jsx`, `AvoirForm.jsx`, `AcompteForm.jsx`, `Impayes.jsx`, `MesTaches.jsx`…
  - `src/components/` : briques partagées (`Layout.jsx`, `Card.jsx`, `ConfirmDialog.jsx`, `ChoixCatalogue.jsx`, `FenetreRelance.jsx`, `BadgeStatutFacture.jsx`, `BarreReglement.jsx`, `BadgeTache.jsx`, `FenetreFormulaire.jsx`, `FenetreTache.jsx`, `FenetreActivite.jsx`, `form/*`, `charts/*`, `document/*` : lignes, récapitulatif et cartes communs aux factures et aux devis).
  - `src/context/` : état applicatif partagé (`ClientsContext.jsx`, `ProduitsContext.jsx`, `DevisContext.jsx`, `TachesContext.jsx`, `ActivitesContext.jsx`…).
  - `src/hooks/` : hooks partagés (`usePiegeFocus.js` : focus piégé des fenêtres modales).
  - `src/data/` : jeux de données statiques du MVP.
  - `src/theme.js` : tokens couleurs + formatters `euro` / `num`.
  - `src/index.css` : Tailwind + utilitaires globaux (`.lg-card`, focus ring).

## 4. Design tokens — Couleurs (palette du cahier, section 5.1.2)
Primaire (#2D5B7F = 600)
| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
| #EDF3F8 | #D4E2EE | #A9C4DC | #7DA5C9 | #5283A6 | #3A6B8F | #2D5B7F | #244A68 | #1C3950 | #142838 |

Secondaire (#4A9B8E = 500)
| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
| #EAF5F3 | #D2EBE6 | #A6D6CE | #7AC2B5 | #5FAD9F | #4A9B8E | #3E8479 | #336C63 | #27534C | #1B3B36 |

Accent (#F4A261 = 500)
| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
| #FEF4EB | #FCE6D2 | #FACDA5 | #F7B47E | #F5A86F | #F4A261 | #E98A3F | #CF6F27 | #A5571F | #7C4117 |

Neutres
Thème « gris perle » :
| Fond de page #E3E7EB | Surface (cartes, tableaux, menus, champs) #ECEFF2 | Survol #DDE2E7 | Bordure #C9D1D8 | Bordure des champs #717D89 | Texte secondaire #4F5A5F | Texte principal #2D3436 |
Le blanc pur #FFFFFF est réservé au texte sur fond plein (boutons primaires, avatars).
Tokens (src/theme.js) : bgMain #E3E7EB · bgCard #ECEFF2 · bgHover #DDE2E7 · border #C9D1D8 (cartes, tableaux, séparateurs) · borderInput #717D89 (input, select, textarea : contraste ≥ 3:1) · textSecondary #4F5A5F · onPrimary #FFFFFF.
Barre latérale sombre : sidebarBg #1B2A38 · sidebarHover #223444 (survol, bloc profil) · sidebarActiveBg #26394B · sidebarText #E4E8EC · sidebarTextMuted #9AA8B5 · sidebarAccent #A9C4DC (texte et liseré du lien actif) · sidebarBorder #2E4256 · sidebarFocus #7DA5C9 (anneau de focus).
Échelle neutre de référence : 300 #CBD5DA · 400 #9AA5AD · 700 #4B545A · 800 #3A4146.
Fonds teintés : alpha(couleur, opacité) ; ombres : OMBRE.xs/sm/md/lg ; classes Tailwind lg-* (ex. hover:bg-lg-hover) générées depuis theme.js.

Graphiques (≥ 3:1 sur #ECEFF2) : chart1 #2D5B7F · chart2 #3E8479 · chart3 #C2651F · chart4 #5283A6 · chart5 #1E8A4C · chart6 #7A5BA8 · chart7 #A5571F · chart8 #717D89 (« Non renseigné »).
Entonnoir du pipeline (dégradé gauche → droite, texte blanc ≥ 4,5:1, y compris au survol avec voile blanc de 5 %) : #244A68→#2D5B7F · #3B6688→#45729A · #2F665D→#37766C · #1B6E3E→#1E7A45.
Texte d'alerte sur carte : errorText #B03A2E (5,21:1 sur #ECEFF2) ; le rouge #E74C3C (3,31:1) reste réservé aux icônes, bordures et fonds.
Tuiles du tableau de bord (début → fin) : bleu #244A68→#2D5B7F · vert #1B6E3E→#1E7A45 · orange #974F1C→#A5571F · vert d'eau #27534C→#336C63 · violet #4E3F7A→#5B4B8A · bleu nuit #1C3950→#244A68.

Fonctionnelles : succès #27AE60 · avertissement #F39C12 · erreur #E74C3C · info #3498DB.
Fonds fonctionnels : la couleur à 12 % d'opacité (ex. succès → rgba(39,174,96,0.12)).
Textes fonctionnels (tout texte coloré, y compris dans les badges) : successText #186A3A · warningText #855407 · infoText #1A6191 · errorText #B03A2E · accentText #96480A (accent, ex. étape « Négociation »).
≥ 4,6:1 sur carte, survol, fond de page et teinte de badge posée dessus (pire cas : teinte sur #DDE2E7). Les couleurs fonctionnelles brutes restent réservées aux icônes, points, bordures, fonds teintés et graphiques ; jamais au texte.
Avatars (initiales blanches, AVATARS dans src/theme.js) : bleu #244A68 (9,32:1) · vert d'eau #336C63 (6,06:1) · orange #A5571F (5,27:1) · vert #1B6E3E (6,28:1) · violet #7A5BA8 (5,40:1) ; le profil utilise le vert d'eau.
Badge « En retard » : fond opaque (rouge à 10 % posé sur #ECEFF2) pour que errorText reste ≥ 4,5:1 sur tout support.

Couleur de catégorie (KPI) : CA = primaire · Clients = secondaire · Factures impayées = erreur · Pipeline = primaire-700.

### Couleurs d'état (statut de paiement)
Couleurs sémantiques, distinctes de la palette de marque : elles informent, elles ne décorent pas. Jetons COULEURS_ETAT, couleurEtat(statut, type), ETAT_REGLEMENT et PISTE_JAUGE dans src/theme.js. Jamais la couleur seule : icône et libellé toujours présents.
| Statut | État | Trait (liseré, icône, jauge) | Texte | Badge (opaque) |
| Payée | succès | successText #186A3A | successText | #D4E7E0 (12 %) |
| Partiellement payée | avertissement | warningText #855407 | warningText | #EDE5D7 (12 %) |
| Finalisée, envoyée, à échoir, échéance aujourd'hui | information | infoText #1A6191 | infoText | #D6E5EF (12 %) |
| En retard | erreur | errorText #B03A2E | errorText | #ECDFE0 (10 %) |
| Brouillon, annulée, tout avoir | neutre | textSecondary #4F5A5F | textSecondary | #D9DDE0 (12 %) |
Badges : la couleur brute (success, warning, info, error, textSecondary) mélangée à la carte #ECEFF2, en couleur opaque (melange). Les couleurs brutes ne servent qu'à ces fonds : sur la carte, elles n'atteignent pas 3:1. Aucun fond de ligne teinté.
Échéance et règlement, séparés (Impayés, carte « Factures liées ») : statutCalcule et statut_paiement inchangés ; deux fonctions dérivées dans src/utils/facture.js.
- etatEcheance(facture, jour) : en_retard si l'échéance est passée, echeance_aujourdhui le jour même (ni retard, ni relance, comme statut_paiement), sinon a_echoir. Le badge d'échéance n'utilise que l'information (À échoir, icône Clock ; Échéance aujourd'hui, icône CalendarClock) et l'erreur (En retard, icône AlertCircle).
- etatReglement(facture) : soldee, partielle ou non_reglee (totalPaye face à totalTTC − totalAvoirs). La jauge n'utilise que l'avertissement (partielle) et le succès (soldée) ; non réglée : jauge vide. Badge d'échéance et jauge ne partagent aucune couleur (testé).
- Jauge (BarreReglement) : toute facture émise de TTC net positif, de 0 % à 100 % ; jamais sur un brouillon, un avoir, une facture annulée, ni si les paiements ne sont pas chargés (reglementAffichable).
- Carte « Factures liées » : document à encaisser → badge d'échéance ; autre document → statut habituel (soldée = Payée, jauge verte à 100 %).
Contrastes calculés (WCAG), sur la carte #ECEFF2 :
| État | Texte et icône / badge | Liseré / carte | Partie remplie / piste |
| succès | 5,16 | 5,76 | 4,86 |
| avertissement | 5,14 | 5,57 | 4,70 |
| information | 5,16 | 5,75 | — |
| erreur | 4,64 (4,50 à 12 % : écarté) | 5,21 | — |
| neutre | 5,19 | 6,15 | — |
Piste de la jauge : fond PISTE_JAUGE, textSecondary à 12 % sur la carte (#D9DDE0, 1,18:1 sur la carte), et contour de 1 px CONTOUR_JAUGE, textSecondary à 70 % (#7E878B, 3,18:1 sur la carte) : une jauge vide reste visible. Le texte « X € réglés sur Y € » (textSecondary, 6,15:1) porte l'information.
Tâches (etatTache, ETAT_TACHE, BadgeTache) : à venir → neutre (icône Circle, « À faire ») ; aujourd'hui → information (CalendarClock, « Aujourd'hui ») ; en retard → erreur et liseré de 4 px (AlertCircle) ; faite → succès (CheckCircle2). Échéance du jour : pas en retard, comme les factures. Aucun fond de ligne teinté. Compteur de l'en-tête : « N tâches en retard » en errorText (5,21:1), tâches dont l'utilisateur est responsable, masqué à zéro ; sous 640 px, icône et nombre seuls (nom accessible complet).
Règlements d'un client (situationClient, ETAT_SITUATION) : En retard (erreur) si au moins une facture l'est, sinon Partiel (avertissement), sinon À jour (succès) ; « — » sans document émis.
Application : liseré de 4 px pour « En retard » uniquement, partout (première cellule). Impayés : s'ouvre sur « Échues » (une échéance aujourd'hui est « À échoir », totaux compris), badge d'échéance, colonne Retard (« 12 j » en errorText, « Aujourd'hui » en textPrimary medium, « — »), jauge à largeur fixe sous le reste à payer. Carte « Factures liées » : colonnes Numéro, TTC, Reste ; badge sous le numéro ; jauge sur une ligne à part sous chaque facture ; aucun défilement horizontal à 1440, 768 et 400 px. Liste des factures : badge de statut (statutCalcule), pas de jauge. Liste des clients : colonne « Solde ».
Contrôle : tests/couleursEtat.test.js recalcule ces contrastes.

## 5. Design tokens — Typographie
Police : Inter (repli system-ui, sans-serif). Chiffres en tabular-nums.
| Style | Taille | Poids |
| H1 | 34 px | 700 |
| H2 | 28 px | 600 |
| KPI | 40 px | 700 |
| Titre de carte | 18 px | 600 |
| Corps | 15 px | 400-500 |
| Légende | 13 px | 400 |
Le gris secondaire est réservé aux informations secondaires.

## 6. Design tokens — Espacements, rayons, ombres
Échelle d'espacement (px) : 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64.
Rayons : carte 16 px · bouton 12 px · champ 12 px · modale 20 px · badge plein (pilule).
Ombres :
- XS : 0 1px 2px rgba(45,52,54,.04)
- SM : 0 1px 3px rgba(45,52,54,.06)
- MD : 0 4px 12px rgba(45,52,54,.08)
- LG : 0 12px 28px rgba(45,52,54,.10)
- XL : 0 20px 40px rgba(45,52,54,.12)

## 7. Grille & responsive
- Sidebar : 216 px. Repliée en icônes seules (72 px) sous 1280 px. Tiroir sous 768 px.
- Contenu : 12 colonnes, gap 24 px, padding 32 px (24 px sous 1280 px).
- Aucun élément flottant au-dessus du contenu : le bouton de l'assistant est retiré tant que l'assistant n'existe pas (WCAG 2.2, critère 2.4.11) ; à réintroduire au prompt 19 sans masquer aucun contrôle.
- Barre latérale : libellés et badges « Phase 2 » sur une ligne, icônes non rétrécissables ; aucune entrée rognée.
- En-tête (Layout) : fil d'Ariane « LaGestion / <page> » et recherche (« Rechercher… », texte indicatif en textSecondary : 5,71:1 sur bgMain) ; h1 = libellePage, masqué (sr-only) sauf sur /dashboard où il affiche « Bonjour {prénom} ». Le titre visible de chaque page reste son h2 (passage en h1 : prompt 14).
- Liste large (Impayés) : tableau à partir de 1 280 px, cartes en dessous (mêmes lignes, l'autre présentation en display: none) ; 0 px de défilement à 1 845, 1 280, 768 et 390 px.
- Orthographe : « LaGestion » partout dans l'interface.

## 8. Composants (conventions)
Briques réutilisables : Card, Button (états : normal, survol, pressé, chargement, désactivé, ghost, outline), Input/Select/Checkbox/Switch, Badge, KpiCard. Toute recette « CSS premium » se traduit en composant React + tokens, jamais en feuille CSS séparée.

**Card** (`src/components/Card.jsx`) : conteneur de surface partagé par toutes les cartes du tableau de bord.
- Base : fond surface (#ECEFF2), bordure 1 px (#C9D1D8), rayon 16 px, padding 20 px, ombre SM (`0 1px 3px rgba(45,52,54,.06)`).
- Survol : translation `-2px`, ombre MD (`0 4px 12px rgba(45,52,54,.08)`), bordure primaire-200 (#A9C4DC), transition 200 ms sur `transform`, `box-shadow`, `border-color`.
- Apparition : fondu + translation 8 px vers le haut, 400 ms, avec un décalage de 60 ms par carte via le prop `index` (`animation-delay: index * 60ms`).
- `prefers-reduced-motion: reduce` désactive transitions et animation.
- Interdit sur les cartes : halo, lueur, pulsation, rotation, ombre colorée.

**BadgeStatutFacture** (`src/components/BadgeStatutFacture.jsx`) : statut issu de statutCalcule, ou état d'échéance issu de etatEcheance (Impayés, factures liées) ; prop `type` (un avoir est neutre). Jetons d'état, fond opaque, icône + libellé : CheckCircle2 payée · CircleDashed partiellement payée · Clock finalisée, envoyée ou à échoir · CalendarClock échéance aujourd'hui · AlertCircle en retard · FileEdit brouillon · Ban annulée · FileMinus avoir.

**BarreReglement** (`src/components/BarreReglement.jsx`) : « X € réglés sur Y € », encaissé net (totalPaye) sur TTC net des avoirs (totalTTC − totalAvoirs), de 0 % à 100 %, couleur selon etatReglement. Affichée si reglementAffichable (document émis de TTC net positif, ni avoir ni annulé, paiements chargés) ; pleine largeur du parent, l'écran fixe la largeur. role="progressbar", aria-label, aria-valuemin/now/max, aria-valuetext ; chiffres tabulaires ; aucune animation.

## 9. Accessibilité — RÈGLES NON NÉGOCIABLES (WCAG 2.2 AA)
- Contraste texte ≥ 4,5:1 (≥ 3:1 pour le grand texte).
- Focus visible sur tout élément interactif.
- Navigation clavier complète.
- aria-label sur chaque bouton-icône ; repères sémantiques (header, nav, main).
- Jamais d'information portée par la seule couleur.

## 10. Performance — RÈGLES NON NÉGOCIABLES (Instruction 8)
- React.memo sur les composants lourds ; chargement différé des écrans et graphiques volumineux.
- Recharts via ResponsiveContainer ; éviter les re-rendus inutiles.
- Animations uniquement sur transform et opacity (compatibles GPU) ; recherche avec debounce.

## 11. Graphiques (Recharts uniquement)
Autorisé : dégradé sous la courbe, lignes objectif/prévision en pointillés, infobulle riche personnalisée, animation au chargement (par défaut), donut à valeur centrale + segment actif et variation au survol, barres à coins arrondis avec remplissage animé.
Interdit (sobriété) : halo, rotation au chargement, points lumineux, ombres portées décoratives sur les tracés.

## 12. Reporté sciemment
- Mode sombre : préparer les tokens en variables CSS, ne pas l'implémenter au MVP.
- Framer Motion : non (CSS pur).
- Effets décoratifs (glow, halo, rotation, pulse) : écartés.
- Widgets comptables (trésorerie, encaissements, retards) : phase 2, quand les données existeront.

## 13. À venir
### Étape Paramètres
Mentions légales manquantes (voir la mémoire du projet et le plan de l'étape 08), à valider par un expert-comptable avant toute vraie facture.

## 14. Workflow
- Lancer l'app : depuis lagestion-dashboard/, commande `npm run dev`, URL http://localhost:5173.
- Sauvegarde : git add <fichiers concernés, nommés un par un> ; git commit ; git push (dépôt https://github.com/Beros0408/LaGestion).
- Ne jamais utiliser git add . ; ne jamais ajouter FONGOLA -SUP/ ni my-video/.
