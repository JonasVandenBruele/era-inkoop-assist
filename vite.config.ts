import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const versie = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

// BASE_PATH wordt door de GitHub Pages-workflow gezet (bv. /era-inkoop-assist/).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: { __APP_VERSIE__: JSON.stringify(versie) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'ERA Inkoop Assist',
        short_name: 'Dagplanner',
        description: 'Dagplanner voor inkopers',
        lang: 'nl-BE',
        display: 'standalone',
        start_url: base,
        scope: base,
        background_color: '#ffffff',
        theme_color: '#000085',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'fixtures/**/*.test.ts', 'supabase/**/*.test.ts'],
    // De databasetests starten een volledige Postgres in het geheugen; dat duurt soms even.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
