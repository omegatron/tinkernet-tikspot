#!/usr/bin/env node
// Image-size budget gate.
//
// Usage: node scripts/check-size.mjs <image-ref> [maxMB]
// Exits non-zero if the image exceeds the budget (default 250 MB), so it can be
// wired into `npm run build:local` and CI to keep the container fit for
// hotspot-class MikroTik devices.
//
// We measure the UNCOMPRESSED size — what occupies the router's flash/disk once
// the image is imported. The robust, cross-environment way to get this is to sum
// the per-layer sizes from `docker history`: that equals what a standard Docker
// daemon reports as the image size, and (unlike `docker images` / `docker image
// inspect` on Docker Desktop's containerd store) it is not distorted by snapshot
// bookkeeping or compressed-blob reporting.

import { execFileSync } from 'node:child_process';

const ref = process.argv[2] ?? 'tikspot:dev';
const MB = 1000 * 1000; // docker uses base-1000 units in its display
const maxBytes = Number(process.argv[3] ?? 250) * MB;

// Warn at 80% of the ceiling so we notice growth before hitting the hard limit.
const WARN = maxBytes * 0.8;

function parseDockerSize(s) {
  const m = /^([\d.]+)\s*([kKmMgG]?)B$/.exec(s.trim());
  if (!m) return NaN;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = unit === 'g' ? 1e9 : unit === 'm' ? 1e6 : unit === 'k' ? 1e3 : 1;
  return n * mult;
}

let size;
try {
  const out = execFileSync('docker', ['history', ref, '--no-trunc', '--format', '{{.Size}}'], {
    encoding: 'utf8',
  });
  const lines = out.trim().split('\n').filter(Boolean);
  if (lines.length === 0) throw new Error(`image "${ref}" not found locally`);
  size = lines.reduce((sum, l) => {
    const b = parseDockerSize(l);
    return sum + (Number.isNaN(b) ? 0 : b);
  }, 0);
} catch (err) {
  console.error(`Could not read size of image "${ref}". Is it built and loaded locally?`);
  console.error(String(err.message ?? err));
  process.exit(2);
}

const mb = (size / MB).toFixed(1);
const limitMb = (maxBytes / MB).toFixed(0);

if (size > maxBytes) {
  console.error(`❌ ${ref} is ${mb} MB uncompressed — over the ${limitMb} MB budget.`);
  process.exit(1);
}

const note = size > WARN ? ` (headroom getting tight before ${limitMb} MB — watch this)` : '';
console.log(`✅ ${ref} is ${mb} MB uncompressed — within the ${limitMb} MB budget${note}.`);
