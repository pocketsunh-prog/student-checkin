// Copies the static assets and public folder into the standalone output so that
// `node .next/standalone/server.js` (and `npm start`) serves the complete app.
// The Docker image performs the same copies explicitly; this keeps local
// production runs identical to the container.
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');

if (!existsSync(standalone)) {
  console.error('[prepare-standalone] .next/standalone is missing. Run `next build` first.');
  process.exit(1);
}

cpSync(join(root, 'public'), join(standalone, 'public'), { recursive: true, force: true });
cpSync(join(root, '.next', 'static'), join(standalone, '.next', 'static'), { recursive: true, force: true });

console.log('[prepare-standalone] Copied public/ and .next/static into .next/standalone.');
