# MuseScorer for Obsidian Desktop

Embed native MuseScore scores in Obsidian, with local rendering, playback and the complete OTS notation editor. Uses the real MuseScore Studio **4.7.4** engine from [OTS_WebEditor](https://github.com/OurTextScores/OTS_WebEditor), built on the [official Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin). Native files load directly without intermediate MusicXML conversion. Requires Obsidian Desktop **1.7.2+**. Runtime operation is offline.

## Credits — built on OTS_WebEditor

> [!IMPORTANT]
> **MuseScorer is an Obsidian adaptation of [OTS_WebEditor by OurTextScores and its contributors](https://github.com/OurTextScores/OTS_WebEditor).** The complete notation editor, its interaction tools, native engine bridge and original playback/following systems come from that project. This plugin would not exist without their work.

Please visit the [original OTS_WebEditor repository](https://github.com/OurTextScores/OTS_WebEditor) and [OurTextScores editor](https://www.ourtextscores.com/score-editor). Credit for the original editor and its continued development belongs to the upstream authors and contributors. MuseScorer adds Obsidian integration: note embeds, local hosting, vault saving/recovery and embed playback controls.

The underlying engraving and synthesis engine is the work of the [MuseScore project and its contributors](https://github.com/musescore/MuseScore). The Obsidian scaffold comes from the [official sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin). Original licenses and attribution are preserved in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/`.

## Runtime files and offline operation

`main.js` is only the small Obsidian integration bundle (approximately 37 KB). The native engine, fonts, soundfont and original editor are separate local files shipped with the plugin:

| Component | Approximate size |
| --- | --- |
| `engine/webmscore.lib.wasm`: native engraving and synthesis engine | 13.6 MB |
| `engine/webmscore.lib.data`: native engine resources | 13.8 MB |
| Additional local fonts in `engine/resources/` | 6.6 MB |
| `engine/soundfont.sf3`: FluidR3Mono playback instruments | 23.7 MB |
| Complete local editor in `full-editor/` | 3.3 MB |

The complete installation is approximately **62 MB**, or **33 MB** as a ZIP (decimal units; sizes vary with builds). Rendering and playback do not download these assets from a CDN. The Obsidian vault adapter reads their bytes from the installed plugin folder and transfers them to the worker. The editor runs in a local iframe with remote network access blocked by its content policy. Missing runtime assets produce an error instead of triggering an online download.

The separate developer/upstream check contacts GitHub, and initial development dependency installation uses npm. Neither is part of score rendering or playback. Disk size is also different from RAM use: the native wrapper requests an initial 512 MiB WASM heap, with additional memory for scores, audio and fonts.

## Embed scores

The default view starts on the first page and lets you scroll through the score inside the embed:

````markdown
```musescore
path: "Scores/Chopin/Nocturne.mscz"
```
````

The short form also works:

````markdown
```musescore
Scores/Nocturne.mscx
```
````

To show every page vertically, with a **12 px gap** between pages and no inner vertical scroll window:

````markdown
```musescore
path: "Scores/Chopin/Nocturne.mscz"
view: full
```
````

`view: page` explicitly selects the default. Its height is limited to one page or 85% of the window height, whichever is smaller. The toolbar view switch temporarily changes the current embed; change `view` in the code block to keep that choice.

At rest, the embed shows only the white score paper, without an outer border, persistent toolbar, filename or visible scrollbar. Hover or keyboard focus reveals floating controls for page navigation, playback, zoom, fit to width, view mode, editing, opening in MuseScore and reloading. The hover controls stay within reach while scrolling through a full score. The paper stays white in dark themes. In full view, the gap uses a subtly tinted theme background so that page boundaries are visible in light themes too.

Paths are relative to the vault root and use `/`. Spaces and Unicode are supported. Double quotes use JSON escaping; single quotes support `''`. The long form accepts only `path` and `view`; duplicate or unknown options show an error. Embeds work in Reading view and in Live Preview outside the active code block. Source file changes refresh the embed automatically.

## Playback and note highlighting

Play uses native MuseScore/FluidSynth synthesis and the bundled **FluidR3Mono GM** soundfont. Web Audio schedules stereo PCM at 44.1 kHz. While playing, the Play button becomes **Pause playback**. Pause freezes audio and note highlighting; **Resume playback** continues the same stream at the same position. Stop clears queued audio and native synthesis; the next Play starts from the beginning. Only one score plays at a time, across embeds and editors.

The first playback loads the approximately 24 MB local soundfont and may take a moment. Sounds come from this free soundfont. Muse Sounds and MuseSampler are not included. Colored noteheads follow the audible notes using the engine's repeat- and tempo-aware segment positions and the audio output clock. Stop clears the highlights. In `view: page`, the embed scrolls to the audible notes and turns to the next page automatically. In `view: full`, the surrounding Obsidian note scrolls as needed to keep the playing notes visible. The original editor also provides tempo, selection playback and follow controls.

## Complete OTS editor in an Obsidian tab

The pencil opens the score in its own Obsidian tab with the **original OTS_WebEditor interface**, bundled locally. An existing editor for the same file is reused. You can also use **Open score editor** in the command palette or **Open in score editor** in a file's context menu.

The original interface includes File/Edit/View/Add/Format/Tools/Help, note input, palettes, voices, articulations, dynamics, formatting, parts/instruments, inspectors, native undo/redo, playback with note highlighting and the available local export tools. The native MuseScore session runs in the shared worker. The original editor and engine supply notation commands, musical semantics and SVG interaction.

The Obsidian toolbar adds **Save a new score copy to the vault**, **Open in MuseScore** and **Reload original**. Ctrl/⌘ S opens the dialog to save a native `.mscz` copy. Existing files are not overwritten. The original embed continues to reference its source file. External open hands that original file to the associated desktop application; associate `.mscz`/`.mscx` with MuseScore in your operating system.

Changes are stored as native recovery snapshots in the plugin's `drafts/` folder. Reopening the editor restores its draft with a fresh undo history. **Reload original** asks before discarding the draft. Source files are preserved.

The website's server-dependent AI, cloud/catalog and specialized server conversion features need OTS infrastructure and are unavailable locally. Their API calls receive a local explanatory response. Scores and telemetry are not sent to a server.

**Performance mode is disabled in the Obsidian editor.** The upstream command opens a separate `/perform` web application that is not bundled here. Its menu entry is marked **Performance mode (unavailable in Obsidian)** and cannot open a broken page. Normal editing, playback and following remain available.

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
```

`npm run dev` watches plugin source changes. The build checks both plugin and original editor with strict TypeScript and verifies SHA-256 checksums for the editor and engine inputs, including the soundfont. Original UI sources live in `vendor/ots-editor`; Obsidian adapters live in `editor-app` and `src/full-editor`. On first build, `setup:editor` installs the original editor's dependencies from its separate lockfile. WASM, data, music fonts and soundfont are included in the source tree; no C++ build is needed to start.

`npm run test:engine` uses the installed Chrome app on macOS. Set `CHROME_PATH=/path/to/chromium` elsewhere. It checks actual SVG output, native edits and saving, undo/redo and nonzero synthesized PCM without HTTP requests from the engine.

`npm run test:obsidian` requires a running Obsidian instance with its CLI enabled. It creates its own temporary fixture notes and scores in the development vault, leaving user examples unchanged. It checks hover controls, both modes, page gaps, real audio buffers, pause/resume with a frozen audio clock and retained highlighting, native page following in both modes, the disabled Performance command, the complete editor in a leaf, edits, native copy saving and draft recovery. Temporary test files are removed and focus emulation is restored. Reports and screenshots are written to `test-results/`.

This working folder is already installed under `.obsidian/plugins/MuseScorer` in the development vault. For another vault, copy **all** of `dist/MuseScorer/` into `<Vault>/.obsidian/plugins/MuseScorer/`, or extract `dist/MuseScorer.zip` there. **Include `renderer-worker.js`, `engine.js`, and the complete `engine/` and `full-editor/` folders.** The usual three plugin files alone are insufficient.

The local ID matches the existing `MuseScorer` folder. Choose a permanent lowercase ID and rename the folder before a first community release.

## Upstream updates

The OTS editor and engine are pinned to reviewed commits in `editor-lock.json` and `engine-lock.json`. Two small frontend adaptations are recorded in `patches/ots-editor-obsidian.patch`; Obsidian integration stays outside the vendored source.

```sh
npm run check:upstream
```

This developer command checks GitHub for changes to OTS, the Obsidian sample template and the latest MuseScore release. It reports review links without changing any dependency. The [plugin repository](https://github.com/kpaede/Musescorer) includes a weekly/manual GitHub Actions check. A separate [OTS fork](https://github.com/kpaede/OTS_WebEditor) preserves the connection to the original [OurTextScores/OTS_WebEditor](https://github.com/OurTextScores/OTS_WebEditor) repository for source review and contributions. See [the upstream maintenance guide](docs/upstream.md) for the Git remotes and update procedure.

Available upstream changes appear as warning annotations and a comparison summary. A new release is not a workflow failure; network/API errors or inconsistent pins still fail the check. No dependency is upgraded automatically.

## Development vault

The plugin is enabled in `KP_entwicklungskopie`. The existing comparison note is `_MuseScorer-Test/MuseScorer-Ansichten.md`, with default/full embeds and a short score for playback and editing. `_MuseScorer-Test/MuseScorer-Test.md` also covers missing and damaged files. These existing user paths are preserved.

## Architecture and limits

One lazily started WASM engine processes previews, editor sessions and synthesis sequentially in a shared worker. Preview scores are destroyed after SVG export. Editor sessions persist until closed; an editor or active playback prevents idle worker termination. The SVG cache is limited to 32 MiB. Without persistent sessions, the worker is recycled after 60 seconds idle or 16 preview jobs. Each request has a two-minute timeout.

The OTS wrapper starts with a 512 MiB WASM heap, plus scores and soundfont memory. Large scores or many editor tabs may use substantially more. The plugin has no telemetry, running web service or online synchronization.

Native page breaks, empty pages and text-frame pages are preserved. MuseScore recalculates layout when opening a file. Other desktop versions, custom system fonts and missing CJK fallback fonts can produce rendering differences. Unicode filenames are supported independently. A legacy fixture does not establish compatibility with every old format. Mobile is not supported.

Engine API/build details: [docs/engine.md](docs/engine.md). Validation: [docs/validation.md](docs/validation.md). Third-party licenses: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
