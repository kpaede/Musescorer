import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const directory = path.resolve('vendor/ots-editor');
const require = createRequire(path.join(directory, 'package.json'));
try { require.resolve('@tailwindcss/postcss'); require.resolve('react'); }
catch {
 console.log('Installing the original editor dependencies from its pinned lockfile.');
 execFileSync('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: directory, stdio: 'inherit' });
}
