import { readFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const api = 'https://api.github.com';

async function github(path) {
 const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
 const response = await fetch(`${api}${path}`, {
  headers: {
   Accept: 'application/vnd.github+json',
   'X-GitHub-Api-Version': '2022-11-28',
   'User-Agent': 'MuseScorer-upstream-check',
   ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  signal: AbortSignal.timeout(30_000),
 });
 if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status} for ${path}. Check connectivity, API limits and token access.`);
 return response.json();
}

function repositoryName(url) {
 const match = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/?$/u.exec(url);
 if (!match) throw new Error('Invalid pinned GitHub repository URL.');
 return match[1];
}

export async function checkUpstreams(engine, editor, request = github) {
 if (engine.otsRepository !== editor.repository || engine.otsCommit !== editor.commit) {
  throw new Error('Editor and engine must track the same reviewed OTS commit.');
 }
 const sources = [
  { name: 'OTS editor and engine', repository: repositoryName(engine.otsRepository), pinned: engine.otsCommit },
  { name: 'Obsidian sample plugin', repository: 'obsidianmd/obsidian-sample-plugin', pinned: engine.sampleCommit },
 ];
 const results = await Promise.all(sources.map(async source => {
  if (!/^[a-f\d]{40}$/u.test(source.pinned)) throw new Error(`Invalid commit pin for ${source.name}.`);
  const metadata = await request(`/repos/${source.repository}`);
  if (typeof metadata.default_branch !== 'string' || !metadata.default_branch) throw new Error(`Missing default branch for ${source.name}.`);
  const head = await request(`/repos/${source.repository}/commits/${encodeURIComponent(metadata.default_branch)}`);
  if (typeof head.sha !== 'string' || !/^[a-f\d]{40}$/u.test(head.sha)) throw new Error(`Invalid upstream commit for ${source.name}.`);
  return {
   ...source, latest: head.sha, changed: head.sha !== source.pinned,
   url: `https://github.com/${source.repository}/compare/${source.pinned}...${head.sha}`,
  };
 }));
 const release = await request('/repos/musescore/MuseScore/releases/latest');
 if (typeof release.tag_name !== 'string' || !release.tag_name) throw new Error('Missing MuseScore release tag.');
 results.push({
  name: 'MuseScore stable release', repository: 'musescore/MuseScore',
  pinned: engine.museScoreVersion, latest: release.tag_name,
  changed: release.tag_name.replace(/^v/u, '') !== engine.museScoreVersion,
  url: `https://github.com/musescore/MuseScore/releases/tag/${encodeURIComponent(release.tag_name)}`,
 });
 return results;
}

export function formatReport(results) {
 const rows = results.map(result => `| ${result.name} | \`${result.pinned}\` | \`${result.latest}\` | [${result.changed ? 'Review changes' : 'Matches pin'}](${result.url}) |`);
 return [
  '# MuseScorer upstream check', '',
  '| Source | Pinned | Upstream | Status |',
  '| --- | --- | --- | --- |', ...rows, '',
  'Changed means the default branch or stable release differs from the pin; it does not establish compatibility or commit ancestry.', '',
  'No dependencies were changed. Review OTS editor and engine together; the Obsidian template is a development reference. See docs/upstream.md.', '',
 ].join('\n');
}

async function main() {
 const flags = new Set(process.argv.slice(2));
 for (const flag of flags) if (!['--json', '--fail-on-update'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
 const [engine, editor] = await Promise.all(['engine-lock.json', 'editor-lock.json'].map(async name => JSON.parse(await readFile(new URL(name, root), 'utf8'))));
 const results = await checkUpstreams(engine, editor);
 const report = formatReport(results);
 console.log(flags.has('--json') ? JSON.stringify(results, null, 2) : report);
 if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
 if (flags.has('--fail-on-update') && results.some(result => result.changed)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 main().catch(error => { console.error(`Upstream check failed: ${error.message}`); process.exitCode = 1; });
}
