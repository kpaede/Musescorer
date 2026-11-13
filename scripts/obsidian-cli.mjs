import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

/** Some Electron CLI processes print their complete reply but retain a process handle. */
export async function obsidianCli(vault, command, ...args) {
 const pending = exec('obsidian', [`vault=${vault}`, command, ...args], { timeout: 30000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024 });
 const child = pending.child;
 child.stdin?.end();
 let output = '';
 const complete = new Promise(resolve => {
  child.stdout.on('data', data => {
   output += String(data);
   if (!output.endsWith('\n')) return;
   const text = output.trim();
   try {
    const reply = text.split(/\r?\n/u).filter(line => line.startsWith('=> ')).at(-1);
    if (command === 'eval' && reply) JSON.parse(reply.slice(3));
    else if (command === 'dev:cdp') JSON.parse(text);
    else if (command === 'dev:screenshot' && text.startsWith('/')) { /* Complete screenshot path. */ }
    else return;
    resolve({ stdout: command === 'eval' ? reply : output });
   } catch { /* Wait until the complete JSON reply has arrived. */ }
  });
 });
 const { stdout } = await Promise.race([pending, complete]);
 if (child.exitCode === null) {
  // Only the newly spawned CLI client is targeted; never the running Obsidian application.
  const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 1000);
  child.once('close', () => clearTimeout(timer));
 }
 const reply = command === 'eval' ? stdout.trim().split(/\r?\n/u).filter(line => line.startsWith('=> ')).at(-1) : undefined;
 return reply ?? stdout.trim();
}
