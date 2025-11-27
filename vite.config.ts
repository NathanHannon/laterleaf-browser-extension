import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5200,
    strictPort: true,
    hmr: {
      port: 5200,
    },
  },
  plugins: [
    react(),
    crx({ manifest }),
  ],
})
