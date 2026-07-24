import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import chromeManifest from './manifest.chrome.json'
import firefoxManifest from './manifest.firefox.json'

const targetBrowser = process.env.TARGET_BROWSER === 'firefox' ? 'firefox' : 'chrome'
const manifest = targetBrowser === 'firefox' ? firefoxManifest : chromeManifest

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 5200,
    strictPort: true,
    hmr: {
      port: 5200,
    },
  },
  build: {
    outDir: `dist/${targetBrowser}`,
    emptyOutDir: true,
  },
  plugins: [
    react(),
    crx({ manifest }),
  ],
})
