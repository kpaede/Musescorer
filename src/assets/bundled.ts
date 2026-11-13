import { brotliDecompress } from 'node:zlib';
import { Buffer } from 'node:buffer';
import { embedded } from 'musescorer:runtime-assets';
import type { RuntimeAssets } from './types';

/** All executable code, native bytes and licenses arrive in main.js. Decode only on demand. */
export class BundledAssets implements RuntimeAssets {
 list(): string[] { return Object.keys(embedded).sort(); }
 async read(name: string): Promise<string> { return new TextDecoder().decode(await this.readBinary(name)); }
 async readBinary(name: string): Promise<ArrayBuffer> {
  if (!Object.prototype.hasOwnProperty.call(embedded, name)) throw new Error(`Unknown bundled runtime asset: ${name}`);
  const asset = embedded[name]!;
  const compressed = Buffer.from(asset.brotli, 'base64');
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
   brotliDecompress(compressed, { maxOutputLength: asset.bytes }, (error, result) => {
    if (error) reject(new Error(`Could not decode bundled runtime asset ${name}: ${error.message}`));
    else resolve(result);
   });
  });
  if (bytes.byteLength !== asset.bytes) throw new Error(`Bundled runtime asset size mismatch: ${name}`);
  // An owned buffer can be transferred to the worker without detaching another caller's data.
  const output = new Uint8Array(bytes.byteLength); output.set(bytes);
  const hash = await crypto.subtle.digest('SHA-256', output.buffer);
  const actual = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== asset.sha256) throw new Error(`Bundled runtime asset checksum mismatch: ${name}`);
  return output.buffer;
 }
}
