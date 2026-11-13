import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
        'vendor/**',
        'full-editor/**',
        'engine/**',
        'engine.js',
        'renderer-worker.js',
        'scripts/**',
        'tests/**',
        'licenses/**',
        'engine-lock.json',
        'editor-lock.json',
		'dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'stylelint.config.mjs', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
    {
        files: ['src/ui/licenses.ts'],
        rules: { 'obsidianmd/ui/sentence-case': ['warn', { brands: ['Obsidian', 'OTS_WebEditor', 'OurTextScores', 'MuseScore'] }] },
    },
);
