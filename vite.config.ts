import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.webp', 'hero-illustration.jpg'],
      manifest: {
        name: 'Bijli Recharge',
        short_name: 'Bijli',
        description: 'Quickly recharge SBPDCL prepaid electricity meters for your family.',
        start_url: '/Electricity-Recharge/',
        scope: '/Electricity-Recharge/',
        display: 'standalone',
        // display_override tries window-controls-overlay on desktop first, falls back to standalone
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        lang: 'en-IN',
        dir: 'ltr',
        theme_color: '#2563eb',
        background_color: '#0e1726',
        categories: ['utilities', 'finance'],
        icons: [
          {
            src: 'icons/icon-48.webp',
            sizes: '48x48',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: 'icons/icon-72.webp',
            sizes: '72x72',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: 'icons/icon-96.webp',
            sizes: '96x96',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: 'icons/icon-128.webp',
            sizes: '128x128',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: 'icons/icon-192.webp',
            sizes: '192x192',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: 'icons/icon-256.webp',
            sizes: '256x256',
            type: 'image/webp',
            purpose: 'any'
          },
          {
            src: 'icons/icon-512.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Cache all app shell assets
        globPatterns: ['**/*.{js,css,html,svg,webp,jpg,png,woff2,woff}'],

        // Runtime caching strategies
        runtimeCaching: [
          // Google Fonts — cache-first (fonts rarely change)
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          // SBPDCL portal — NetworkFirst (must be fresh for balance/payment)
          {
            urlPattern: /^https:\/\/wss\.sbpdcl\.co\.in\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sbpdcl-portal',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 5 }
            }
          }
        ],

        // Skip waiting so updates take effect immediately
        skipWaiting: true,
        clientsClaim: true,

        // Navigate fallback to index.html (SPA routing)
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ],
  // Use '/' for Android/Capacitor builds, '/Electricity-Recharge/' for GitHub Pages
  base: process.env.VITE_BASE_URL ?? '/',
})
