/** A vault path or a single YAML path property. */
export function parseScorePath(source: string): string {
	let path = source.trim();
	if (!path || /[\r\n]/u.test(path)) {
		throw new Error('Provide one file path or path: "Scores/Score.mscz".');
	}
	if (/^path\s*:/u.test(path)) path = path.replace(/^path\s*:\s*/u, '');
	if (path.startsWith('"')) {
		try {
			const decoded: unknown = JSON.parse(path);
			if (typeof decoded !== 'string') throw new Error('Not a string');
			path = decoded;
		} catch {
			throw new Error('The file path contains invalid double quotes.');
		}
	} else if (path.startsWith("'")) {
		if (!path.endsWith("'") || path.length < 2) throw new Error('The file path has an unclosed quote.');
		path = path.slice(1, -1).replace(/''/gu, "'");
	}
	if (!path || Array.from(path).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || /^(?:\/|\\|[a-zA-Z]:|[a-zA-Z][\w+.-]*:)/u.test(path)) {
		throw new Error('The file path must be relative to the vault root.');
	}
	if (path.includes('\\') || path.split('/').some(part => part === '..')) {
		throw new Error('Use a vault path with / and without .. segments.');
	}
	path = path.split('/').filter(part => part && part !== '.').join('/');
	if (!/\.(?:mscz|mscx)$/iu.test(path)) throw new Error('Supported formats are .mscz and .mscx.');
	return path;
}
