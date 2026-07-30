import fs from 'node:fs';
import path from 'node:path';

const manifestPath = path.resolve(process.cwd(), 'dist/firefox/manifest.json');

if (!fs.existsSync(manifestPath)) {
    console.error(`[patch-firefox-manifest] Manifest not found: ${manifestPath}`);
    process.exit(1);
}

const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);

manifest.background = manifest.background || {};

const serviceWorker = manifest.background.service_worker;
if (!serviceWorker) {
    console.error('[patch-firefox-manifest] No background.service_worker found to mirror into background.scripts');
    process.exit(1);
}

manifest.background.scripts = [serviceWorker];

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`[patch-firefox-manifest] Updated ${manifestPath} with background.scripts=["${serviceWorker}"]`);
