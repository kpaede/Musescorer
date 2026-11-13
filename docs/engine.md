# Engine investigation and reproducible integration

## Exact sources

The project starts with the official [obsidianmd/obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin/tree/07ceb81d1fb3384af611ebf665a1ec42a7e5926d). It retains npm, esbuild, strict TypeScript, the Obsidian API definitions, ESLint and version tooling. Sample commands, settings and timers were removed.

Engine source inspected at [OTS commit 3ec0452](https://github.com/OurTextScores/OTS_WebEditor/tree/3ec0452e12952d59308feb3c1da0553ee17fbcbe):

- `lib/webmscore-loader.ts`: real `ready`/`load` API and worker/in-process entry points, plus module export normalization.
- `webmscore-fork/web-public/src/index.js`: native API wrapper, resource loading, metadata, SVG, lifetime.
- `src/helper.js`: Emscripten options and allocator helpers.
- `src/worker.js`, `src/worker-helper.js`, `src/worker-rpc.js`: upstream worker transport. Upstream keeps one mutable `score` per worker; using its factory independently for every codeblock would duplicate WASM heaps. MuseScorer bundles `src/index.js` in one shared worker with serialized whole-score jobs instead.
- `engine/musescore/bridge/bridge.cpp`, `layouttools.h`, `scoreexports.h`, `svgfontoutlines.h`: real native loading, layout, SVG and destruction.
- `engine/musescore/upstream.json`, `resources/lazy-resources.json`, `tools/musescore/{build.sh,bundle.mjs,stage_resources.py}`, `docs/engine/README.md`: synchronized build/asset requirements.

Native engine: [MuseScore Studio 4.7.4, 7688c005](https://github.com/musescore/MuseScore/tree/7688c005ad963ba09ee715aae53dbc7e8c9d5ef8), Emscripten 4.0.7, OTS Qt-free production bridge. The old 4.00 C++ tree in `webmscore-fork/` is **not** the runtime engine. The engine's `version()` returns the score-format code `470`, not the string `4.7.4`.

## Verified calls

```ts
await WebMscore.ready;
const score = await WebMscore.load('mscz', bytes, [], true);
try {
  const { pages } = await score.metadata();
  for (let page = 0; page < pages; page++) {
    const svg = await score.saveSvg(page, true, false);
  }
} finally {
  score.destroy();
}
```

`mscx` is also explicitly accepted. Its native branch wraps the raw XML bytes in an in-memory MuseScore ZIP container and invokes the native MuseScore project reader. This is **not MusicXML conversion**. `setupMasterScore(true)` and `doLayout()` run natively. The worker preserves page layout mode and does not change score styles or break information. SVG has a white background and outlines music and text glyphs, which is necessary for isolated SVG image documents.

The original compressed C-scale fixture contains `score_style.mss` separately from `score.mscx`. Merely extracting its MSCX omits this style sidecar; those two inputs do not necessarily produce byte-identical SVGs. The smoke test compares standalone MSCX against a ZIP containing the exact same standalone XML, in addition to testing the original archive.

The Bach fixture contains a separate VBox with a page break and can produce an otherwise empty second page containing a copyright heading. The viewer preserves every engine page, including intentional frame-only pages; it does not discard pages based on note counts.

## Offline asset adaptation

Vendored sources are unmodified. The esbuild `local-emscripten-assets` hook inserts this line immediately before `let Module = moduleOptions` in `helper.js`:

```js
Object.assign(moduleOptions, globalThis.MUSESCORER_MODULE_OPTIONS || {});
```

The worker sets `wasmBinary` and `getPreloadedPackage` from transferred local ArrayBuffers **before** importing the bundled JS from a Blob. This avoids Emscripten attempting to fetch hidden `.obsidian` files using an Obsidian resource URL. The code is always read from the installed plugin folder through the vault adapter. No remotely downloaded code is executed.

`fetchResource(path)` is an existing overridable method in OTS `index.js`. The worker replaces it with local resource RPC. The main process only reads paths present in the bundled `resources.json`. Replies bypass the render queue to prevent a font-loading deadlock. Seventeen optional music/text fonts are resolved from the pinned MuseScore QRC aliases. Default Leland, Bravura, Edwin and other core resources live in `webmscore.lib.data`. Soundfonts and the old `.mem.wasm` are unnecessary for SVG viewing. CJK fallback fonts and arbitrary user-installed system fonts are not included.

## Obsidian API

The [official API definitions](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) were checked directly, including installed `node_modules/obsidian/obsidian.d.ts`:

- `Plugin.registerMarkdownCodeBlockProcessor('musescore', ...)`
- `MarkdownPostProcessorContext.addChild()` and `MarkdownRenderChild` lifetime
- `Vault.getAbstractFileByPath()` / `TFile` / `Vault.readBinary()`
- `DataAdapter.read()` / `readBinary()` for installed hidden plugin assets
- component `register`, `registerEvent`, `registerDomEvent` for cleanup

No private Obsidian API is used by the plugin. Developer smoke scripts may use developer tooling to inspect the application under test.

## Rebuild and audit

`engine-lock.json` pins SHA-256 checksums for vendored inputs, JS glue, WASM, data, resource list and fonts. `npm run verify:engine` detects missing files, mismatched assets and Git LFS pointers; `npm run build` runs it automatically. Offline plugin builds then only require installed npm dependencies.

To rebuild the C++ engine rather than reuse the supplied binary assets:

1. Clone the exact OTS commit above, fetching Git LFS assets where required.
2. Clone MuseScore and check out `7688c005ad963ba09ee715aae53dbc7e8c9d5ef8`.
3. Install Emscripten **4.0.7**, CMake, Ninja, Python 3 and Node/npm.
4. Follow the pinned OTS `docs/engine/README.md`: `npm run build:engine`, `npm run bundle:engine -- /tmp/ots-engine-bundle`, `npm run install:engine -- /tmp/ots-engine-bundle`. Its `upstream.json` names all maintained native patches; do not use the legacy 4.00 build.
5. Copy the synchronized `webmscore.lib.js`, `.wasm`, `.data`, `schemas.ts` and `src/` into `vendor/webmscore/`. Stage the resource files named in `lazy-resources.json` using upstream `tools/musescore/stage_resources.py` and copy the matching QRC aliases under `vendor/webmscore/resources/`.
6. Review changes, record the new origin/checksums in `engine-lock.json`, run `npm run build`, `npm test`, `npm run lint`, `npm run test:engine` and a real Obsidian test.

A rebuild can change binary hashes through compiler/build-path differences; checksum updates require an explicit engine update, not silently accepting a mismatched WASM/glue pair.

## Runtime boundaries

One native score is loaded per serialized job and destroyed after SVG generation, including failed exports. Identical pending requests share a job; each view has independent cancellation/generation checks. Cache is bounded to 32 MiB of SVG UTF-16 text. Native heap capacity is reclaimed by terminating an idle worker (60 seconds) or renewing it after 16 rendered jobs. A two-minute per-request timeout terminates a stuck module. Plugin unload terminates the worker, rejects pending calls and clears cache; view unload revokes image Blob URLs.

This does not establish pixel parity with every desktop MuseScore release. Font substitutions, different engraving versions, very large scores, custom fonts and untested old formats remain practical limits. The engine owns all musical semantics; no VexFlow, OSMD or mocked renderer is present.


## 0.2.0: editor sessions and local playback

`EngineClient` is now the shared transport. Preview scores remain short-lived, while the worker holds a map of persistent editor sessions keyed by opaque IDs. An editor or active playback pins the module, preventing idle termination or preview-job rotation. Closing a session destroys its native score. Worker serialization covers both edits and preview loads; resource replies continue to bypass that queue.

Additional calls verified directly in the pinned `src/index.js`: `selectElementAtPoint`, `getSelectedElementProperties`, `getUndoInfo`, `pitchUp`, `pitchDown`, `doubleDuration`, `halfDuration`, `toggleDot`, `deleteSelection`, `undo`, `redo`, `selectNextChord`, `selectPrevChord`, `clearSelection` and `saveMsc('mscz')`. These native commands own their undo transactions and layout updates. The plugin does not wrap them in an extra invented transaction. SVG with `highlightSelection=true` supplies the actual selection colors. Editor clicks are mapped through each SVG's real `viewBox` into engine coordinates; SVGs remain isolated image documents.

The source file is read-only in this foundation. Native MSCZ snapshots are saved as local recovery records after mutations; explicit saving creates a new native file using `Vault.createBinary`. Recovery preserves the source modification time from the original load so later external changes are detectable. Recovered snapshots start a new native undo stack. Reloading the original asks to discard the draft; cancelling retains it.

Playback uses the actual `WebMscore.hasSoundfont`, `WebMscore.setSoundFont(bytes)` and `score.synthAudioBatch(0, 64)` APIs. The iterator yields 512-frame planar stereo float32 chunks with explicit 44,100-Hz metadata. The main thread joins each batch into an AudioBuffer and schedules a bounded amount ahead using AudioContext time. Empty terminal records are not scheduled. Calling the iterator with `true` cancels native synthesis. Stop immediately stops/disconnects scheduled browser sources as well.

Each audible run has a unique token separate from the editor session ID, so an old completion or stop cannot terminate replacement playback. Starting another run cancels the previous native stream. Editor mutations stop playback of that editor before changing its score. Engine state is never inferred from a guessed pointer or a fake renderer.

The independently versioned FluidR3Mono GM asset is pinned by hash in `engine-lock.json` and copied to `engine/soundfont.sf3` by the build. It is not part of the notation `.data` preload, and is only read when the user requests playback. Native engine rebuilds do not require rebuilding this soundfont.

The editor is a registered Obsidian ItemView with persisted path state in a normal leaf. The complete original notation UI is bundled locally, as described below; the Next.js server and cloud services are not required for local notation editing.


## Complete original editor (final 0.2.0 scope)

The initial basic editor was replaced with the **complete original OTS notation UI**. `vendor/ots-editor/components/ScoreEditor.tsx` and its existing shell, palettes, commands, inspectors, dialogs, notation input, playback, comparison and local export components are bundled by esbuild. Tailwind and the original CSS modules are compiled locally, including Leland/Bravura UI fonts. `editor-app/tsconfig.json` strictly checks the entry adapter and its complete imported editor dependency graph; the plugin host is separately checked by the root strict TypeScript project.

The editor is mounted in a local iframe inside the registered Obsidian ItemView. It loads compiled code from the installed plugin folder, never from the website. An iframe-source/origin/token-bound message bridge handles native RPC and a fixed whitelist of local assets. The native factory advertises methods actually present on the pinned engine instance; higher-order synthesis iterators use the exact same `_synthAudio`/`processSynthBatch` protocol as the upstream worker helper. All editor scores and previews share the existing worker and WASM module. A CSP and local fetch adapter prevent cloud/API calls; analytics is disabled. The original website's server-only AI/cloud APIs are explicitly unavailable offline.

Two small upstream hooks identify the active main score and stop audible playback when another leaf takes over. Original file-upload and new-score flows are kept separate from the vault source: imported/new documents can be saved as new vault copies and use the original checkpoint tools, but cannot silently replace the recovery draft of the initially embedded vault file. The host persists a native MSCZ recovery snapshot for the vault-linked document on history changes and before closing it.

`editor-lock.json` pins the vendored frontend inputs. `npm run setup:editor` installs its original dependency lock without workspace resolution. `npm run build` invokes this setup if needed, verifies both input locks, type-checks both projects, and builds the local full editor and plugin. `full-editor/` is a required runtime folder included in the installable archive.

The external-open action follows the actual Verovio implementation: FileSystemAdapter.getFullPath followed by Electron shell.openPath, with errors shown as notices. It hands over the original native file; the OS association for MSCZ/MSCX must point to MuseScore.

Embed note highlighting uses native `segmentPositions()` events, repeat-expanded playback time and cached SVG glyph geometry. Only safe Note/Rest path data and numeric transforms are copied into a noninteractive overlay above each isolated score image. Membership follows OTS's existing `note-box-match.ts` ledger-line tolerance. The main transport maps the audio output timestamp into the actually scheduled buffer spans, so delayed scheduling does not advance the marker through a gap. Stop clears the markers. The full editor uses its original `usePlaybackHighlights` implementation, with note highlighting enabled by default.

A single module-wide soundfont digest avoids reinstalling identical soundfont bytes for another editor/preview target, preserving the active synth and decoded font cache. Audible runs retain unique tokens, and an external editor's playback stops competing iframe/root sources before starting.
