import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = '/stock-hogar-pwa/'

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        // Separa las librerías pesadas para cachearlas aparte y acelerar la carga inicial.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('html5-qrcode')) return 'scanner-lib'
          if (id.includes('qrcode-generator')) return 'qr-lib'
          if (id.includes('lucide-react')) return 'icons'
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor'
          return undefined
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Stock Hogar',
        short_name: 'Stock Hogar',
        description: 'Control de stock del hogar con escáner de códigos de barras',
        lang: 'es-AR',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#059669',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
})
