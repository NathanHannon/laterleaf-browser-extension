# LaterLeaf Browser Extension

A "Save to LaterLeaf" Chrome extension built with React, TypeScript, and Vite.

## How it Works (Dev vs. Prod)

### 1. Development Mode (`npm run dev`)
In this mode, Vite runs a local server (usually `http://localhost:5200`).
- The extension is "hot-reloaded". When you save a file, the extension updates instantly in Chrome without needing a rebuild.
- **How to run:**
  1. Run `npm run dev` in this terminal.
  2. Open Chrome -> `chrome://extensions/`.
  3. Enable **Developer Mode**.
  4. Click **Load Unpacked**.
  5. Select the `dist` folder (yes, even in dev mode, CRXJS creates a special `dist` that points to the localhost server).
  6. Keep the terminal running.

### 2. Production Build (`npm run build`)
In this mode, Vite compiles your code into static HTML, JS, and CSS files.
- **There is no server.** The extension runs entirely within the browser using these static files.
- This is what you upload to the Chrome Web Store.
- **How to build:**
  1. Run `npm run build`.
  2. The `dist` folder now contains standalone files.
  3. You can zip this folder and upload it to the store.

## Project Structure

- **`src/popup`**: The React UI that appears when you click the extension icon.
- **`src/content`**: Scripts that run *on the web page* you are visiting (to extract content).
- **`src/background`**: Scripts that run in the background (service workers) to handle events.
- **`manifest.json`**: The configuration file that tells Chrome how to load the extension.

## Installation

1. `npm install`
2. Create `.env` file:
   ```
  VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
  VITE_API_BASE_URL=http://localhost:3000/api
  VITE_API_URL_VERSION=v1
   ```

## Commands

- `npm run dev`: Start dev server with HMR.
- `npm run dev:firefox`: Start Firefox-targeted dev build.
- `npm run dev:safari`: Start Safari-targeted dev build.
- `npm run build`: Build for production.
- `npm run build:firefox`: Build Firefox output into `dist/firefox`.
- `npm run build:safari`: Build Safari output into `dist/safari`.
- `npm run build:all`: Build Chrome, Firefox, and Safari outputs.

