// Build the downloadable hotspot-shim zip the admin uploads to the router.

import JSZip from 'jszip';
import { generateShims } from './shims.js';

export async function buildShimZip() {
  const zip = new JSZip();
  for (const f of generateShims()) zip.file(f.name, f.content);
  // Include a short readme so whoever transfers the files knows what they are.
  zip.file(
    'README.txt',
    'Tikspot hotspot files — upload these to the MikroTik hotspot directory.\n' +
      'They redirect the hotspot login to the Tikspot container, which serves the\n' +
      'live, editable portal page. See the admin portal setup guide for details.\n',
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}
