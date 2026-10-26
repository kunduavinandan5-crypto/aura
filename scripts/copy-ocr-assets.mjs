// Copies the self-hosted OCR runtime (tesseract.js worker + wasm cores) into public/ocr so the app never
// loads scripts from a third-party CDN (the Content-Security-Policy only allows 'self').
// public/ocr/eng.traineddata.gz (language data) is committed to the repo.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'ocr');
mkdirSync(out, { recursive: true });

const worker = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
const coreDir = join(root, 'node_modules', 'tesseract.js-core');

if (!existsSync(worker) || !existsSync(coreDir)) {
  console.warn('[ocr] tesseract.js is not installed; photo text reading will be unavailable. Run npm install.');
  process.exit(0);
}

copyFileSync(worker, join(out, 'worker.min.js'));
let copied = 1;
for (const f of readdirSync(coreDir)) {
  if (/-lstm\.wasm\.js$/.test(f)) {
    copyFileSync(join(coreDir, f), join(out, f));
    copied++;
  }
}
console.log(`[ocr] copied ${copied} files to public/ocr`);
