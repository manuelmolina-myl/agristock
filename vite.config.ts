import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'AgriStock — Gestión de Almacenes Agrícolas',
        short_name: 'AgriStock',
        description: 'Control total de tu almacén agrícola. Inventario, costeo multimoneda, diésel, reportes.',
        theme_color: '#16A34A',
        background_color: '#0A0A0B',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['business', 'productivity'],
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Take over open tabs the moment a new SW activates.  Without this,
        // users have to close every tab/PWA window to pick up new chunk
        // hashes, and a stale index.html keeps requesting JS files that no
        // longer exist — manifesting as MIME-type errors when Vercel's SPA
        // fallback serves index.html for the missing chunk URLs.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Hashed chunks under /assets/ must NEVER fall back to index.html.
        // If a chunk is gone we want a hard 404 so the dynamic-import
        // retry triggers a fresh SW install rather than parsing HTML as JS.
        navigateFallbackDenylist: [/^\/assets\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
