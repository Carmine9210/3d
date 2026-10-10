#!/bin/bash
# Mac: doppio clic (la prima volta: tasto destro → Apri). Linux: bash 3-PUBBLICA-SU-NETLIFY.command
cd "$(dirname "$0")/sito" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js non è installato. Si apre la pagina di download: installa la versione LTS, poi riapri questo file."
  (open https://nodejs.org/it/download 2>/dev/null || xdg-open https://nodejs.org/it/download 2>/dev/null) &
  read -r -p "Premi Invio per chiudere…" _
  exit 1
fi
node scripts/pubblica.mjs
echo ""
read -r -p "Premi Invio per chiudere…" _
