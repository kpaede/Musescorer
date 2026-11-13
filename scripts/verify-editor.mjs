import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const lock = JSON.parse(await readFile('editor-lock.json','utf8'));
for(const file of lock.files) {
 const bytes = await readFile(file.path);
 if(createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Original editor source checksum mismatch: ${file.path}`);
}
console.log(`Verified ${lock.files.length} pinned OTS editor inputs.`);
