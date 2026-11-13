import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
export async function verifyEngine() {
 const lock = JSON.parse(await readFile(path.join(root, 'engine-lock.json'), 'utf8'));
 for (const file of lock.files) {
  const bytes = await readFile(path.join(root, file.path));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== file.sha256) throw new Error(`Engine checksum mismatch: ${file.path}. Restore the pinned assets; Git LFS pointers are not WASM.`);
 }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 await verifyEngine();
 console.log('Pinned engine sources, WASM, data and fonts verified.');
}
