# Lagestion — Tableau de bord (MVP)

Projet React (Vite + Tailwind + Recharts) du premier écran de Lagestion.

## Prérequis

- **Node.js 18 ou supérieur** : https://nodejs.org
  Vérifiez avec `node -v` dans un terminal.

## Lancement

Ouvrez un terminal dans ce dossier, puis exécutez les deux commandes suivantes :

```bash
npm install   # à faire une seule fois, installe les dépendances
npm run dev   # démarre le serveur de développement
```

Le navigateur s'ouvre automatiquement sur **http://localhost:5173**.
Sinon, ouvrez cette adresse manuellement.

### Raccourci (macOS / Linux)

```bash
chmod +x start.sh   # une seule fois
./start.sh
```

## Arrêter le serveur

Dans le terminal, appuyez sur **Ctrl + C**.

## Structure

```
lagestion-dashboard/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── start.sh
└── src/
    ├── main.jsx              ← point d'entrée
    ├── index.css             ← styles Tailwind
    └── LagestionDashboard.jsx ← le tableau de bord
```

## Construire pour la production

```bash
npm run build     # génère le dossier dist/
npm run preview   # prévisualise la version de production
```
