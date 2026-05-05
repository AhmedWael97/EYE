const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const outfile = path.join(__dirname, 'dist', 'eye.min.js');

// ── Build eye.min.js (core tracker, no dependencies, <8 KB) ──────────────────
const corePromise = esbuild.build({
  entryPoints: [path.join(__dirname, 'src', 'eye.js')],
  bundle: false,
  minify: true,
  target: ['es5'],
  outfile,
}).then(() => {
  const stat = fs.statSync(outfile);
  const kb = (stat.size / 1024).toFixed(2);
  console.log(`Built eye.min.js — ${kb} KB`);

  const LIMIT = 12288; // 12 KB raw (target < 4 KB gzipped)
  if (stat.size > LIMIT) {
    console.error(`ERROR: bundle is ${stat.size} bytes, exceeds ${LIMIT} byte limit!`);
    process.exit(1);
  }

  // Copy to backend public directory so Laravel serves it at /tracker/eye.js
  const publicDest = path.join(__dirname, '..', 'backend', 'public', 'tracker');
  fs.mkdirSync(publicDest, { recursive: true });
  fs.copyFileSync(outfile, path.join(publicDest, 'eye.js'));
  console.log(`Copied to backend/public/tracker/eye.js`);
});

// ── Build eye-replay.min.js (rrweb bundled, ~80 KB, lazy-loaded) ─────────────
const replayOutfile = path.join(__dirname, 'dist', 'eye-replay.min.js');

const replayPromise = esbuild.build({
  entryPoints: [path.join(__dirname, 'src', 'eye-replay.js')],
  bundle: true,
  minify: true,
  target: ['es6'],
  format: 'iife',
  outfile: replayOutfile,
}).then(() => {
  const stat = fs.statSync(replayOutfile);
  const kb = (stat.size / 1024).toFixed(2);
  console.log(`Built eye-replay.min.js — ${kb} KB`);

  const publicDest = path.join(__dirname, '..', 'backend', 'public', 'tracker');
  fs.mkdirSync(publicDest, { recursive: true });
  fs.copyFileSync(replayOutfile, path.join(publicDest, 'eye-replay.js'));
  console.log(`Copied to backend/public/tracker/eye-replay.js`);
});

Promise.all([corePromise, replayPromise]).catch((err) => {
  console.error(err);
  process.exit(1);
});
