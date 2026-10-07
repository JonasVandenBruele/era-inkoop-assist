// Claude via Jonas' eigen abonnement (`claude -p`, zonder tools), niet via een API-sleutel (besluit Jonas 6/10/2026).
// Gedeeld door scripts/hooks-maken.ts en scripts/whatsapp-open.ts.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export const CLAUDE_TOKEN = 'Oxpecker Claude-token';

/** Het claude-programma: in PATH, ~/.local/bin, of de versie die de Claude-app meebrengt (nieuwste eerst). */
export function zoekClaude(): string | null {
  const kandidaten = [process.env.CLAUDE_PAD, join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  for (const k of kandidaten) if (k && existsSync(k)) return k;
  const basis = join(homedir(), 'Library/Application Support/Claude/claude-code');
  if (!existsSync(basis)) return null;
  const versies = readdirSync(basis)
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of versies) {
    for (const h of readdirSync(join(basis, v))) {
      const p = join(basis, v, h, 'claude.app/Contents/MacOS/claude');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/** Een geheim uit de macOS-sleutelhanger, of null. */
export function sleutel(dienst: string): string | null {
  try {
    return execFileSync('security', ['find-generic-password', '-s', dienst, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

/** Stuurt `invoer` (JSON) met een systeemprompt naar Claude en geeft de JSON-array uit het antwoord terug. */
export function vraagClaudeJson<T>(claude: string, token: string | null, systeem: string, invoer: unknown, model: string): T[] {
  const map = mkdtempSync(join(tmpdir(), 'oxpecker-claude-'));
  try {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY; // altijd via het abonnement, nooit een API-sleutel
    if (token) env.CLAUDE_CODE_OAUTH_TOKEN = token;
    const r = spawnSync(
      claude,
      ['-p', '--output-format', 'json', '--tools', '', '--model', model, '--no-session-persistence', '--setting-sources', '', '--strict-mcp-config', '--system-prompt', systeem],
      { input: JSON.stringify(invoer), encoding: 'utf8', cwd: map, env, timeout: 300_000, maxBuffer: 20 * 1024 * 1024 },
    );
    if (r.error) throw new Error(`claude start niet (${r.error.message.slice(0, 80)})`);
    let uit: { is_error?: boolean; result?: string; terminal_reason?: string };
    try {
      uit = JSON.parse(r.stdout);
    } catch {
      throw new Error(`claude gaf geen JSON (code ${r.status})`);
    }
    if (uit.is_error) throw new Error(/log ?in/i.test(uit.result ?? '') ? 'claude is niet aangemeld' : `claude-fout (${uit.terminal_reason ?? 'onbekend'})`);
    const tekst = uit.result ?? '';
    const lijst = JSON.parse(tekst.slice(tekst.indexOf('['), tekst.lastIndexOf(']') + 1)) as T[];
    return Array.isArray(lijst) ? lijst : [];
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}
