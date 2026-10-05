#!/bin/bash
# Eenmalig: maakt een willekeurig wachtwoord voor de importgebruiker van de ERAForce-mirror en bewaart het
# in je macOS-sleutelhanger ("Oxpecker import (Supabase)") en als GitHub-geheim MIRROR_IMPORT_PASSWORD.
# Het wachtwoord wordt nergens getoond of opgeslagen buiten die twee plaatsen.
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/.."
LABEL="Oxpecker import (Supabase)"
if security find-generic-password -s "$LABEL" >/dev/null 2>&1; then
  echo "Er staat al een wachtwoord in je sleutelhanger. Niets gewijzigd."; exit 0
fi
PW=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
printf 'add-generic-password -U -a oxpecker_import -s "%s" -l "%s" -w "%s"\n' "$LABEL" "$LABEL" "$PW" | security -i >/dev/null
printf '%s' "$PW" | gh secret set MIRROR_IMPORT_PASSWORD >/dev/null
unset PW
echo "Klaar: wachtwoord in je sleutelhanger en in GitHub. Je mag dit venster sluiten."
