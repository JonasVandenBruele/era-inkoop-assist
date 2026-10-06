#!/bin/bash
# Eenmalig: koppelt de hooks aan je eigen Claude-abonnement (geen API-sleutel, geen extra kosten).
# Je meldt je aan in de browser; Claude bewaart die aanmelding zelf in je macOS-sleutelhanger en vernieuwt ze
# automatisch. Er wordt geen code getoond, gekopieerd of door dit script bewaard.
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/.."

CLAUDE=$(ls -d "$HOME/Library/Application Support/Claude/claude-code/"*/*/claude.app/Contents/MacOS/claude 2>/dev/null | sort -V | tail -1 || true)
[ -z "$CLAUDE" ] && CLAUDE=$(command -v claude || true)
if [ -z "$CLAUDE" ]; then echo "Claude-programma niet gevonden. Open eerst de Claude-app."; exit 1; fi

# Een halve code van een vorige poging mag de aanmelding niet in de weg zitten.
security delete-generic-password -s "Oxpecker Claude-token" >/dev/null 2>&1 || true

test_claude() {
  printf 'Antwoord enkel: ok' | env -u ANTHROPIC_API_KEY -u CLAUDE_CODE_OAUTH_TOKEN "$CLAUDE" -p --tools "" --model sonnet --no-session-persistence --output-format json 2>/dev/null | grep -q '"is_error":false'
}

if test_claude; then
  echo "Claude is al aangemeld."
else
  echo "Stap 1: je browser opent. Meld je aan met je Claude-account en keur goed."
  "$CLAUDE" auth login
  echo
  echo "Stap 2: even testen…"
  if ! test_claude; then
    echo "De test lukte niet. Laat het Claude weten (plak gerust deze melding, er staat geen code in)."
    exit 1
  fi
fi

echo "Gelukt. Om 07:00 en 19:00 maakt de mirror nu ook de hooks. Nu meteen de eerste hooks maken (± enkele minuten)…"
python3 "$HOME/Desktop/CLAUDE CODE/eraforce-mirror/mirror.py" hooks || true
echo "Klaar. Je mag dit venster sluiten."
