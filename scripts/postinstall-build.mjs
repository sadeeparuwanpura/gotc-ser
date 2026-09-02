/**
 * Compiles the server after `npm install`.
 *
 * Render's DEFAULT build command is a bare `npm install`, which installs packages but never
 * runs the TypeScript compiler — the service then starts against a `dist/` that was never
 * created and dies with MODULE_NOT_FOUND. Hooking the build onto `postinstall` makes a
 * default-configured host work.
 *
 * The proper fix is still to set the host's build command to
 *   npm install --include=dev && npm run build
 * because that also survives `NODE_ENV=production`, which makes npm skip devDependencies —
 * and TypeScript is one. When that happens there is no compiler to run, so this script skips
 * rather than failing the install, and prints what to change.
 *
 * A genuine type error still fails the build loudly. Silently shipping a stale dist/ would be
 * worse than not building at all.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compiler = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

if (!existsSync(compiler)) {
  console.log(
    [
      '',
      '[postinstall] TypeScript is not installed, so the server was not compiled.',
      '[postinstall] This is expected for a production-only install.',
      '',
      '[postinstall] If this ran on your host, set its Build Command to:',
      '[postinstall]     npm install --include=dev && npm run build',
      ''
    ].join('\n')
  );
  process.exit(0);
}

const result = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.build.json'], {
  cwd: root,
  stdio: 'inherit'
});

if (result.status !== 0) {
  console.error('\n[postinstall] The build failed. dist/ is not usable.\n');
}

process.exit(result.status ?? 1);
