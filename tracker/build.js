const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const outfile = path.join(__dirname, 'dist', 'eye.min.js');

esbuild.build({
  entryPoints: [path.join(__dirname, 'src', 'eye.js')],
  bundle: false,
  minify: true,
  target: ['es5'],
  outfile,
}).then(() => {
  const stat = fs.statSync(outfile);
  const kb = (stat.size / 1024).toFixed(2);
  console.log(`Built eye.min.js — ${kb} KB`);

  const LIMIT = 8192; // 8 KB raw (target < 4 KB gzipped)
  if (stat.size > LIMIT) {
    console.error(`ERROR: bundle is ${stat.size} bytes, exceeds ${LIMIT} byte limit!`);
    process.exit(1);
  }

  // Copy to backend public directory so Laravel serves it at /tracker/eye.js
  const publicDest = path.join(__dirname, '..', 'backend', 'public', 'tracker');
  fs.mkdirSync(publicDest, { recursive: true });
  fs.copyFileSync(outfile, path.join(publicDest, 'eye.js'));
  console.log(`Copied to backend/public/tracker/eye.js`);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
