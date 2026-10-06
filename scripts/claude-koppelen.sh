#!/bin/bash
# Eenmalig: koppelt de hooks aan je eigen Claude-abonnement (geen API-sleutel, geen extra kosten).
# 1. Claude opent je browser; meld je aan met je Claude-account en keur goed.
# 2. Het script haalt de code (begint met "sk-ant-oat") zelf uit wat Claude toont; je hoeft niets te kopiëren.
# De code gaat enkel naar je macOS-sleutelhanger ("Oxpecker Claude-token") en wordt nergens getoond of gelogd.
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/.local/node/bin:$PATH"
cd "$(dirname "$0")/.."
LABEL="Oxpecker Claude-token"

CLAUDE=$(ls -d "$HOME/Library/Application Support/Claude/claude-code/"*/*/claude.app/Contents/MacOS/claude 2>/dev/null | sort -V | tail -1 || true)
[ -z "$CLAUDE" ] && CLAUDE=$(command -v claude || true)
if [ -z "$CLAUDE" ]; then echo "Claude-programma niet gevonden. Open eerst de Claude-app."; exit 1; fi

echo "Stap 1: je browser opent. Meld je aan en keur goed. Je hoeft daarna niets te kopiëren."
# De uitvoer van setup-token gaat naar een tijdelijk bestand dat enkel jij kan lezen; de code wordt eruit gehaald
# (ook als ze over twee regels staat) en het bestand wordt meteen gewist.
LOG=$(mktemp -t oxpecker-claude)
chmod 600 "$LOG"
trap 'rm -f "$LOG"' EXIT
script -q "$LOG" "$CLAUDE" setup-token
TOKEN=$(python3 - "$LOG" <<'PY'
import re, sys
t = open(sys.argv[1], 'rb').read().decode('utf8', 'ignore')
t = re.sub(r'\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\r', '', t)
m = re.search(r'(sk-ant-oat[A-Za-z0-9_-]+)[ \t]*\n[ \t]*([A-Za-z0-9_-]+)?', t)
code = m.group(1) if m else ''
# Afgebroken over twee regels? Dan de volgende regel erbij (enkel als de code nog te kort is).
if m and len(code) < 100 and m.group(2):
    code += m.group(2)
print(code)
PY
)
rm -f "$LOG"
echo
[ ${#TOKEN} -lt 100 ] && TOKEN=""
case "$TOKEN" in sk-ant-*) ;; *) echo "Ik vond geen code in wat Claude toonde. Niets bewaard. Probeer het script nog eens."; exit 1 ;; esac
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
