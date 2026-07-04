# CLAUDE.md — Lagestion

> Fichier de référence du projet. À lire en premier, à chaque session.
> En cas de doute, l'ordre d'autorité est : ce fichier > Instructions_Developpement_Lagestion.md > Cahier_des_Charges_Lagestion.md.
> Toute décision contraire doit être discutée et inscrite ici avant d'être appliquée.

## 1. Vision produit
Lagestion est une plateforme de gestion commerciale (CRM + facturation) pour PME. L'interface doit évoquer la sobriété, l'élégance et la lisibilité des meilleurs SaaS (Stripe, Linear, HubSpot), sans tape-à-l'œil. La retenue prime sur l'effet.

## 2. Périmètre MVP — GELÉ (Instruction 1)
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
| 50 (#F8F9FA, fond) | 100 #F1F3F5 | 200 (#DFE6E9, bordure) | 300 #CBD5DA | 400 (#9AA5AD, texte atténué) | 500 #7B8794 | 600 (#636E72, texte secondaire) | 700 #4B545A | 800 #3A4146 | 900 (#2D3436, texte principal) |
Surface (cartes) : #FFFFFF.

Fonctionnelles : succès #27AE60 · avertissement #F39C12 · erreur #E74C3C · info #3498DB.
Fonds fonctionnels : la couleur à 12 % d'opacité (ex. succès → rgba(39,174,96,0.12)).

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
- Base : fond blanc, bordure 1 px neutre-200 (#DFE6E9), rayon 16 px, padding 20 px, ombre SM (`0 1px 3px rgba(45,52,54,.06)`).
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
- Sauvegarde : git add . ; git commit ; git push (dépôt https://github.com/Beros0408/LaGestion).
