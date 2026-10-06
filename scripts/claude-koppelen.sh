#!/bin/bash
# Eenmalig: koppelt de hooks aan je eigen Claude-abonnement (geen API-sleutel, geen extra kosten).
# 1. Claude opent je browser; meld je aan met je Claude-account en keur goed.
# 2. Claude toont daarna een lange code (begint met "sk-ant-oat"). Kopieer die en plak ze hier.
# De code gaat enkel naar je macOS-sleutelhanger ("Oxpecker Claude-token") en wordt nergens getoond of gelogd.
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/.."
LABEL="Oxpecker Claude-token"

CLAUDE=$(ls -d "$HOME/Library/Application Support/Claude/claude-code/"*/*/claude.app/Contents/MacOS/claude 2>/dev/null | sort -V | tail -1 || true)
[ -z "$CLAUDE" ] && CLAUDE=$(command -v claude || true)
if [ -z "$CLAUDE" ]; then echo "Claude-programma niet gevonden. Open eerst de Claude-app."; exit 1; fi

echo "Stap 1: je browser opent. Meld je aan en keur goed."
"$CLAUDE" setup-token
echo
echo "Stap 2: kopieer de VOLLEDIGE code (ze staat over twee regels: van sk-ant-oat tot het einde van de regel eronder)."
read -r -s -p "Plak ze hier en druk op Enter (je ziet niets verschijnen): " TOKEN
echo
TOKEN=$(printf '%s' "$TOKEN" | tr -d '[:space:]')
# Kwam enkel de eerste regel mee? Dan de tweede regel er nog bij vragen.
while [ ${#TOKEN} -lt 100 ] && [ -n "$TOKEN" ]; do
  read -r -s -p "De code is nog niet volledig (${#TOKEN} tekens). Plak het stuk dat ontbreekt (de tweede regel) en druk op Enter: " MEER
  echo
  MEER=$(printf '%s' "$MEER" | tr -d '[:space:]')
  [ -z "$MEER" ] && break
  TOKEN="$TOKEN$MEER"
done
case "$TOKEN" in sk-ant-*) ;; *) echo "Dat lijkt geen geldige code (begint niet met sk-ant-). Niets bewaard."; exit 1 ;; esac
printf 'add-generic-password -U -a oxpecker -s "%s" -l "%s" -w "%s"\n' "$LABEL" "$LABEL" "$TOKEN" | security -i >/dev/null

echo "Stap 3: even testen…"
if printf 'Antwoord enkel: ok' | env -u ANTHROPIC_API_KEY CLAUDE_CODE_OAUTH_TOKEN="$TOKEN" "$CLAUDE" -p --tools "" --model sonnet --no-session-persistence --output-format json 2>/dev/null | grep -q '"is_error":false'; then
  unset TOKEN
  echo "Gelukt. Om 07:00 en 19:00 maakt de mirror nu ook de hooks. Nu meteen de eerste hooks maken…"
  python3 "$HOME/Desktop/CLAUDE CODE/eraforce-mirror/mirror.py" hooks || true
  echo "Klaar. Je mag dit venster sluiten."
else
  unset TOKEN
  security delete-generic-password -s "$LABEL" >/dev/null 2>&1 || true
  echo "De test lukte niet (de code werd weer verwijderd). Probeer het script nog eens; anders laat het Claude weten."
  exit 1
fi
