# Oxpecker — ERA Inkoop Assist

*Altijd aanwezig, nooit opdringerig.* De eerste module is de **Dagplanner**.

Persoonlijke dagplanner voor een inkoper: wie bel ik vandaag, waarom, en wanneer past dat tussen mijn afspraken.
Het volledige plan staat in [PLAN.md](PLAN.md), de wijzigingen in [CHANGELOG.md](CHANGELOG.md).
De verkoopmodule (koperspool en matchmaking, voorlopig enkel als demo) staat beschreven in [VERKOOP.md](VERKOOP.md).

> Deze repository bevat **uitsluitend fictieve testdata**. Alle namen, adressen en telefoonnummers zijn verzonnen.

## Opbouw

- Statische web-app (Vite + React + TypeScript), installeerbaar op de iPhone (PWA), gepubliceerd via GitHub Pages.
- Supabase voor database, login en toegangsregels (`supabase/migrations`).
- Zonder Supabase-gegevens draait de app als **lokale demo** met testdata in de browser.

## Lokaal gebruiken

```bash
npm install
npm run dev        # app op http://localhost:5173
npm test           # alle tests (logica, testdata, database-toegangsregels)
npm run build      # productieversie in dist/
```

Supabase koppelen: kopieer `.env.example` naar `.env.local` en vul het projectadres en de publieke sleutel in.

## Mappen

| Map | Inhoud |
|---|---|
| `src/core` | klok, datums (Europe/Brussels), instellingen, data-toegang |
| `src/domain` | pure planningslogica, zonder database |
| `src/modules/dagplanner` | schermen van de Dagplanner |
| `src/adapters` | koppelingen met bronnen (later: ERAForce, Outlook, Plaud) |
| `fixtures` | generator voor fictieve testdata (vaste seed) |
| `supabase` | databasemigraties en tests van de toegangsregels |
| `prompts` | AI-prompts met versienummer (vanaf fase 4) |
