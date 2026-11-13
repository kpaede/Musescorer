import { parseScorePath } from './score-path';

export type EmbedMode = 'page' | 'full';
export interface EmbedOptions { path: string; view: EmbedMode }

export function parseEmbedOptions(source: string): EmbedOptions {
 const lines = source.trim().split(/\r?\n/u).filter(line => line.trim());
 if (lines.length === 1 && !/^\s*(?:path|view)\s*:/u.test(lines[0] ?? '')) {
  return { path: parseScorePath(source), view: 'page' };
 }
 let path: string | undefined;
 let view: EmbedMode = 'page';
 const seen = new Set<string>();
 for (const line of lines) {
  const match = /^\s*(path|view)\s*:\s*(.*?)\s*$/u.exec(line);
  if (!match) throw new Error('Use path: "Scores/Score.mscz" and optionally view: page or view: full.');
  const [, key, value] = match;
  if (!key || seen.has(key)) throw new Error(`The ${key ?? ''} option may only appear once.`);
  seen.add(key);
  if (key === 'path') path = parseScorePath(`path: ${value ?? ''}`);
  else {
   const mode = value?.replace(/^(?:"(.*)"|'(.*)')$/u, '$1$2');
   if (mode !== 'page' && mode !== 'full') throw new Error('The view option accepts page or full.');
   view = mode;
  }
 }
 if (!path) throw new Error('Provide the score path using path:.');
 return { path, view };
}
