# Règles de travail — LaGestion

## Objectif
Construire LaGestion, un SaaS CRM multi-entreprises pour TPE/PME françaises (2 à 50 personnes) :
clients, prospects, pipeline, devis, factures, paiements, tableau de bord, puis IWa (agent IA) et module BTP.
Référence fonctionnelle : docs/LaGestion_Cahier_des_charges_V2.md.

## Contexte
- Développeur solo, Windows (cmd), projet dans C:\Users\bkabe\Desktop\LaGestion_CRM-projet\lagestion-dashboard
- Dépôt GitHub : Beros0408/LaGestion ; branche de travail v2-multitenant ; main reste stable
- Stack : React 18 + Vite + Tailwind + React Router + Recharts + lucide-react + Supabase (Auth, Postgres, Storage)
- Déploiement prévu : Vercel (frontend) + Supabase
- Supabase : projet lagestion (réf. vzpuewzjlrbwqxwadsle), variables dans .env.local
- Clé d'isolation : entreprise_id sur toute donnée métier ; RLS par appartenance (table memberships)
- Schéma : supabase/schema.sql (base) + supabase/migrations/NNN_nom.sql (évolutions, numérotées)
- Écritures centralisées dans src/context : ClientsContext.jsx, OpportunitesContext.jsx, FacturesContext.jsx
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

## Méthode
- Une étape à la fois. Avant de coder : reformule l'objectif de l'étape, liste les fichiers touchés et le plan en 3 à 7 points, puis attends mon « go ».
- Changements petits et ciblés. Pas de refactor hors périmètre.
- Si une consigne est ambiguë ou contradictoire avec le cahier des charges, pose la question au lieu de deviner.
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
- Palette : à trancher entre #2D5B7F (actuel) et #489AF0 (V2) ; #2D5B7F reste en vigueur en attendant.
- Tuiles KPI colorées autorisées sur le tableau de bord uniquement (exception à la section 1) : dégradé léger entre deux teintes soutenues (TUILES dans src/theme.js), texte blanc ≥ 4,5:1 sur les deux teintes, sans halo, lueur ni ombre colorée. Le reste de l'application garde le thème gris perle.

# CLAUDE.md — Lagestion

> Fichier de référence du projet. À lire en premier, à chaque session.
> En cas de doute, l'ordre d'autorité est : ce fichier > docs/LaGestion_Cahier_des_charges_V2.md > Instructions_Developpement_Lagestion.md.
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
  - `src/pages/` : un écran par fichier — `Dashboard.jsx`, `Clients.jsx`, `ClientForm.jsx`, `ClientDetail.jsx`.
  - `src/components/` : briques partagées (`Layout.jsx`, `Card.jsx`, `form/*`, `charts/*`).
  - `src/context/` : état applicatif partagé (`ClientsContext.jsx`).
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

## 8. Composants (conventions)
Briques réutilisables : Card, Button (états : normal, survol, pressé, chargement, désactivé, ghost, outline), Input/Select/Checkbox/Switch, Badge, KpiCard. Toute recette « CSS premium » se traduit en composant React + tokens, jamais en feuille CSS séparée.

**Card** (`src/components/Card.jsx`) : conteneur de surface partagé par toutes les cartes du tableau de bord.
- Base : fond surface (#ECEFF2), bordure 1 px (#C9D1D8), rayon 16 px, padding 20 px, ombre SM (`0 1px 3px rgba(45,52,54,.06)`).
- Survol : translation `-2px`, ombre MD (`0 4px 12px rgba(45,52,54,.08)`), bordure primaire-200 (#A9C4DC), transition 200 ms sur `transform`, `box-shadow`, `border-color`.
- Apparition : fondu + translation 8 px vers le haut, 400 ms, avec un décalage de 60 ms par carte via le prop `index` (`animation-delay: index * 60ms`).
- `prefers-reduced-motion: reduce` désactive transitions et animation.
- Interdit sur les cartes : halo, lueur, pulsation, rotation, ombre colorée.

## 9. Accessibilité — RÈGLES NON NÉGOCIABLES (WCAG 2.1 AA)
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

## 13. Workflow
- Lancer l'app : depuis lagestion-dashboard/, commande `npm run dev`, URL http://localhost:5173.
- Sauvegarde : git add <fichiers concernés, nommés un par un> ; git commit ; git push (dépôt https://github.com/Beros0408/LaGestion).
- Ne jamais utiliser git add . ; ne jamais ajouter FONGOLA -SUP/ ni my-video/.
