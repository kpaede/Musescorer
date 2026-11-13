# Third-party components

MuseScorer is distributed under GPL-3.0-only. See LICENSE and licenses/.

- Project structure and initial npm/esbuild/TypeScript/ESLint configuration: [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin), commit `07ceb81d1fb3384af611ebf665a1ec42a7e5926d`, 0BSD. Original license: `licenses/obsidian-sample-plugin.txt`.
- MuseScore JavaScript API, Emscripten glue, WASM and preloaded resources: [OurTextScores/OTS_WebEditor](https://github.com/OurTextScores/OTS_WebEditor), commit `3ec0452e12952d59308feb3c1da0553ee17fbcbe`, `webmscore-fork/web-public/` and `public/webmscore.lib.{wasm,data}`. GPLv3; origins include MuseScore and LibreScore/webmscore. See `vendor/webmscore/LICENSE.GPL` in the source tree and `licenses/MuseScore.txt`.
- Native engraving engine: MuseScore Studio **4.7.4**, commit `7688c005ad963ba09ee715aae53dbc7e8c9d5ef8`, Qt-free OTS bridge, Emscripten **4.0.7**. Native source, patches and build commands are pinned and linked in `docs/engine.md`.
- On-demand font assets come from the same upstream MuseScore commit, resolved using `src/engraving/data/fonts/*.qrc`. The engine data package contains the default music/text fonts. Individual font licenses and exceptions are preserved under `licenses/fonts/`; see also the MuseScore license. The notation SVG uses glyph outlines; font software is not loaded from the network.
- Test scores `bach_orig.mscz`, `c_scale.mscz` and `format-compat/` are taken from the pinned OTS repository. The legacy 1.14 fixture is `src/engraving/tests/compat114_data/keysig.mscx` from the pinned MuseScore source (GPLv3). No test score is required at runtime.

Local adaptation: the build injects caller-supplied `wasmBinary` and `getPreloadedPackage` options into the unmodified vendored `src/helper.js`. MuseScorer supplies its own worker protocol to serialize score loading/rendering and share one module. `fetchResource` uses local vault-adapter reads. There are no native engine modifications.

A redistributed binary package must be accompanied by corresponding source, including these wrappers, patches/build instructions for the engine, and its applicable licenses. The pinned public repositories identify the source used here; when publishing a release, provide a matching source archive alongside the plugin archive rather than relying solely on upstream availability.

## Playback asset (0.2.0)

`vendor/webmscore/soundfont.sf3` (installed as `engine/soundfont.sf3`) is `webmscore-fork/share/sound/FluidR3Mono_GM.sf3` from the same pinned OTS commit. SHA-256: `2aacd036d7058d40a371846ef2f5dc5f130d648ab3837fe2626591ba49a71254`; size: 23,712,790 bytes. The MIT license and complete upstream acknowledgements are preserved in `licenses/FluidR3Mono_License.md`. It is loaded from local storage only when playback is first requested; no CDN or soundfont download occurs during plugin use.

The embed's floating icon arrangement and pencil workflow are informed by the user's locally installed Verovio Music Renderer plugin. The MuseScorer implementation is separate and uses Obsidian icons and its own native MuseScore session/worker transport.

## Complete original OTS editor UI

The complete local notation UI under `vendor/ots-editor/{components,lib,types,app}` is vendored from the same OTS commit `3ec0452e12952d59308feb3c1da0553ee17fbcbe`, GPL-3.0-only. `editor-lock.json` records the exact vendored inputs, including the small Obsidian integration hooks. The original Viritura/MIT notices are preserved in `licenses/OTS_WebEditor_THIRD_PARTY_NOTICES.md` and in the source copy. The generated browser bundle retains dependency license comments; dependencies are pinned by the editor's original package lock.

Adaptations: a local engine transport adapter; Next navigation/image integration for a standalone leaf; a main-score identity event; a host stop-playback event; omission of browser URL rewrites for srcdoc; and explicit removal of analytics calls. No engraving, note input, palette, notation command, selection, undo, inspector or playback implementation has been replaced with a simulated equivalent. The original UI is rendered from its React components and original styles.
