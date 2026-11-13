# Development and runtime details

For installation and everyday use, see the [user guide](../README.md). This page describes building, testing and maintaining the plugin.

## Build and install

Use Node.js 22+ and npm:

```sh
npm ci
npm run build
npm test
npm run lint
npm run test:engine
npm run test:obsidian
npm run package
npm run test:install
```

`npm run dev` watches plugin source changes. The build checks both plugin and original editor with strict TypeScript and verifies SHA-256 checksums for the editor and engine inputs, including the soundfont. Original UI sources live in `vendor/ots-editor`; Obsidian adapters live in `editor-app` and `src/full-editor`. On first build, `setup:editor` installs the original editor's dependencies from its separate lockfile. WASM, data, music fonts and soundfont are included in the source tree; no C++ build is needed to start. `scripts/embedded-assets.mjs` packs the runtime and legal notices into the main bundle. `engine/`, `engine.js`, `renderer-worker.js` and `full-editor/` are build/test intermediates, not installation requirements.

`npm run test:engine` uses the installed Chrome app on macOS. Set `CHROME_PATH=/path/to/chromium` elsewhere. It checks actual SVG output, native edits and saving, undo/redo and nonzero synthesized PCM without HTTP requests from the engine.

`npm run test:obsidian` requires a running Obsidian instance with its CLI enabled. It creates its own temporary fixture notes and scores in the development vault, leaving user examples unchanged. It checks hover controls, both modes, page gaps, real audio buffers, pause/resume with a frozen audio clock and retained highlighting, native page following in both modes, the disabled Performance command, the complete editor in a leaf, edits, native copy saving and draft recovery. Temporary test files are removed and focus emulation is restored. Reports and screenshots are written to `test-results/`.

For a manual installation, copy the **three files** from `dist/musescorer/` into `<Vault>/.obsidian/plugins/musescorer/`, or extract `dist/MuseScorer.zip` into `<Vault>/.obsidian/plugins/`. The archive contains a `musescorer/` folder with exactly those three files. The GitHub release workflow attaches the same standard assets.

`npm run test:install` installs a byte-identical copy of `main.js` and `styles.css` into a fresh temporary plugin folder in the same development vault. Only the test manifest identity changes to avoid registration conflicts. It checks offline licenses and runs the real viewer, playback, full-editor and page-following tests, then removes the test installation and restores the development plugin. Recovery drafts remain user data; no engine/editor files are created at runtime.

`npm run lint` checks both `src/` and the local `editor-app/` adapters with type-aware ESLint, then runs `npm run lint:css` against the plugin stylesheet and all vendored editor CSS. React type declarations are installed at the repository root as well as in the original editor dependency tree, so review tools can resolve the adapter imports from either TypeScript configuration. Node platform imports use their explicit `node:` names.

The editor stylesheet uses standard CSS. The original Tailwind theme values and layer utilities are maintained in `editor-app/theme.json`; `scripts/editor-theme.mjs` registers them through PostCSS during the build. The compiler output is unchanged by this separation. Stylelint rejects unknown at-rules even when suppression comments are present, matching the reviewer behavior. Reduced-motion overrides use selector specificity, including pseudo-elements. Keep this adaptation in the upstream patch and checksum inventory, and review the theme configuration when updating OTS styles.

The permanent plugin ID is `musescorer`, matching the installed folder name. The display name remains MuseScorer. If upgrading from the preliminary beta with ID `MuseScorer`, disable that installation, rename its folder to `musescorer` and replace the three program files; keep existing recovery drafts.

## Runtime files and offline operation

`main.js` contains the complete original editor, worker code, native engine, resource data, fonts, soundfont and legal notices. Each resource is Brotli-compressed and Base64-encoded at build time. A lazy reader decodes it in memory using the desktop runtime's built-in Brotli support and checks its size and SHA-256 before use. Nothing is extracted or installed as additional program files.

The three-file installation is approximately **40 MB**. Decoded resources still include about 13.6 MB of native WASM, 13.8 MB of engine data, 6.6 MB of additional fonts, a 23.7 MB soundfont and 3.3 MB of editor assets. The original soundfont and font coverage are preserved. Compression reduces the distribution size; it does not remove those capabilities.

Rendering and playback never download assets from a CDN. Engine resources come from the installed `main.js`; the editor runs in a local iframe whose content policy blocks remote asset requests. The engine, soundfont and editor are decoded only when requested. Loading the JavaScript bundle itself still has a startup/memory cost.

Use **Show credits and licenses** in the command palette to read the bundled attribution, GPL and individual font/soundfont licenses offline. Original license bytes are preserved inside the distribution. Source and build inputs are available in this repository.

The separate developer/upstream check contacts GitHub, and initial development dependency installation uses npm. Neither is part of score rendering or playback. Disk size is different from RAM use: the native wrapper requests an initial 512 MiB WASM heap, with additional memory for scores, audio and fonts. Sync Standard cannot synchronize this large `main.js`; install the plugin separately on each desktop device.

## Upstream updates

The OTS editor and engine are pinned to reviewed commits in `editor-lock.json` and `engine-lock.json`. Three small frontend adaptations are recorded in `patches/ots-editor-obsidian.patch`; the remaining Obsidian integration stays outside the vendored source.

```sh
npm run check:upstream
```

This developer command checks GitHub for changes to OTS, the Obsidian sample template and the latest MuseScore release. It reports review links without changing any dependency. The [plugin repository](https://github.com/kpaede/Musescorer) includes a weekly/manual GitHub Actions check. A separate [OTS fork](https://github.com/kpaede/OTS_WebEditor) preserves the connection to the original [OurTextScores/OTS_WebEditor](https://github.com/OurTextScores/OTS_WebEditor) repository for source review and contributions. See [the upstream maintenance guide](upstream.md) for the Git remotes and update procedure.

Available upstream changes appear as warning annotations and a comparison summary. A new release is not a workflow failure; network/API errors or inconsistent pins still fail the check. No dependency is upgraded automatically.

## Architecture and limits

One lazily started WASM engine processes previews, editor sessions and synthesis sequentially in a shared worker. Preview scores are destroyed after SVG export. Editor sessions persist until closed; an editor or active playback prevents idle worker termination. The SVG cache is limited to 32 MiB. Without persistent sessions, the worker is recycled after 60 seconds idle or 16 preview jobs. Each request has a two-minute timeout.

The OTS wrapper starts with a 512 MiB WASM heap, plus scores and soundfont memory. Large scores or many editor tabs may use substantially more. The plugin has no telemetry, running web service or online synchronization.

Native page breaks, empty pages and text-frame pages are preserved. MuseScore recalculates layout when opening a file. Other desktop versions, custom system fonts and missing CJK fallback fonts can produce rendering differences. Unicode filenames are supported independently. A legacy fixture does not establish compatibility with every old format. Mobile is not supported.

Engine API/build details: [engine integration](engine.md). Validation: [test results](validation.md). Third-party licenses: [notices](../THIRD_PARTY_NOTICES.md).
