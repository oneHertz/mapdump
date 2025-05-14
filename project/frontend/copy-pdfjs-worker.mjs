import path from 'node:path';
import fs from 'node:fs';

const pdfjsDistPath = path.dirname(import.meta.resolve('pdfjs-dist/package.json'));
const pdfWorkerPath = path.join(pdfjsDistPath, 'build', 'pdf.worker.mjs');

fs.copyFileSync(pdfWorkerPath.substring(5), 'public/pdf.worker.js');