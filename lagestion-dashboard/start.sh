#!/usr/bin/env bash
# Démarrage du tableau de bord Lagestion
set -e

echo "→ Vérification de Node.js…"
if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js n'est pas installé. Installez-le depuis https://nodejs.org (version 18 ou supérieure)."
  exit 1
fi

echo "→ Installation des dépendances (première fois uniquement)…"
npm install

echo "→ Lancement du serveur de développement…"
echo "   Le navigateur s'ouvrira automatiquement sur http://localhost:5173"
npm run dev
