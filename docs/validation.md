# Validation on 2026-11-12

Validated in the user's requested development vault **KP_entwicklungskopie**, with the plugin installed at `.obsidian/plugins/MuseScorer` and enabled in Obsidian **1.15.1** (installer 1.14.5). The dedicated test note remains at `_MuseScorer-Test/MuseScorer-Test.md`.

Passed:

- Strict TypeScript production build, ESLint without warnings, parser tests, engine SHA-256 verification and archive integrity.
- Real browser worker with the shipped WASM/glue/data: MSCZ, standalone MSCX, matching standalone XML repacked as MSCZ, MuseScore 4.20/4.70 fixtures, legacy format 1.14, corrupt-input errors and subsequent successful loading. Zero HTTP requests during engine testing.
- Bach fixture: three SVG pages, including its separate copyright-frame page; every page exported. SVG music/text glyphs are outlined paths. A screenshot of all pages was inspected.
- Actual Obsidian code blocks in the requested vault: compressed and uncompressed scores, Unicode and spaces in paths, repeated references, loaded SVG images, missing file and corrupt file.
- Actual visible zoom from 660.625 px at fit width to 792.75 px at 120%; reset returns to 100%. Both theme classes checked with white score pages; original theme restored.
- Plugin reload in the running test vault and repeated integration test after the improved corrupt-file message. Obsidian developer error capture reported no errors at the final check.

Local evidence: `test-results/engine-report.json`, `test-results/obsidian-report.json`, `test-results/bach-pages.png`, theme and error screenshots. These are development artifacts, excluded from the installation archive.

This validation does not establish pixel identity with every MuseScore desktop version, universal legacy compatibility, arbitrary custom font availability, or long-running memory bounds for all possible score contents.


## Final 0.2.0: full original editor and playback highlighting

The final implementation replaces the initial basic editor with the actual OTS React notation editor. Both the plugin host and the complete imported editor source graph pass strict TypeScript; ESLint and parser tests pass. `editor-lock.json` pins 685 vendored frontend inputs, and the original editor dependency lock is installed independently for a reproducible build.

Final real Obsidian integration report: `test-results/features-report.json`.

- Standard embed: 0 px outer border, toolbar opacity 0 at rest, 918 px scroll window with 2,925 px of actual score content. Hover reveals the controls. Page navigation and zoom/reset were checked.
- Full embed: 2,996 px of pages including two 12 px gaps, equal viewport/content height, with no inner vertical scrolling.
- Embed playback: actual AudioBuffer sources, 65,536 scheduled frames, nonzero PCM peak 0.0784; a colored notehead was visible during playback and cleared on Stop.
- Original editor: all seven original menus (File/Edit/View/Add/Format/Tools/Help), note input, palettes and nine fixture note glyphs loaded. Real CDP mouse selection and ArrowUp changed the native score. Original Undo and Redo removed/recreated the native recovery draft as expected.
- Original editor playback: actual scheduled Web-Audio sources, nonzero peak 0.0808 and an original `ots-playback-notehead` highlight. Stop cleared the highlight.
- A native MSCZ copy was created through the Obsidian save dialog. Closing and reopening restored the draft. Source bytes retained their original SHA-256.
- The external-open button was verified to call Electron with the correct local native score path. The automated test intercepted that call to avoid launching an unrelated application; the actual MuseScore installation/file association is a user-system prerequisite.
- Temporary test scores, their notes and recovery files were removed. Test monkeypatches and temporary focus emulation were restored.

Screenshots: `test-results/embed-quiet.png`, `embed-hover.png`, `embed-note-highlighting.png`, `full-ots-editor.png`, `full-editor-selection.png`, `full-editor-playback.png`. The embed highlighting screenshot was visually inspected: the correct engraved notehead is red, with the original white paper and floating hover toolbar.

The complete local notation UI is present. Website AI/cloud/API features remain unavailable offline, and no backend service is started. Native formats render directly; the original optional MusicXML tools are not used as an intermediate for loading vault MuseScore files.

## English interface, page separation and upstream tracking

- All first-party interface strings, notices, validation errors and README content are in English. English sentence-case linting is enabled. User paths and Unicode fixtures are preserved.
- The final real-vault integration run passed English controls, both embed modes, native file handoff, audible PCM and note highlighting in both views, original-editor selection/undo/redo, native copy saving and draft recovery. The source score retained its SHA-256. The test waits for automatic editor fitting before clicking a note and verifies the recovered native snapshot independently of transient status copy.
- Full view has an actual measured 12 px page gap and 0 px outer border. Light and dark appearances were inspected with the original theme restored afterward. The separator mixes theme background and text colors, remaining visible even when the theme's primary and secondary backgrounds are both white. Paper stays white. Screenshots: `test-results/full-page-gap-light.png` and `full-page-gap-dark.png`.
- Strict production build, ESLint without warnings and all seven parser/upstream tests passed. The OTS adaptation patch passed forward applicability against the pristine pinned checkout and reverse applicability against the installed vendor tree.
- The read-only upstream check was exercised against GitHub: OTS and sample-template heads matched their pins; MuseScore's latest stable tag was `v4.7.7`, while the reviewed OTS engine remains 4.7.4. No dependency was changed.

## GitHub repository and fork setup on 2026-11-13

The plugin uses the existing public [kpaede/Musescorer](https://github.com/kpaede/Musescorer) repository. The separate [kpaede/OTS_WebEditor](https://github.com/kpaede/OTS_WebEditor) fork was created through GitHub and its `parent` and `source` were verified as `OurTextScores/OTS_WebEditor`. Local remotes identify the plugin, fork and original explicitly. GitHub Actions is enabled for the plugin repository. The weekly/manual workflow checks the original upstream rather than relying on the fork being synchronized.

The initial source inventory contains all inputs required by both checksum locks. Generated runtime bundles, installed dependencies, test output, native recovery drafts and local credentials are excluded. Git attributes preserve vendored asset and license bytes across platforms. Local strict build, lint and all seven tests passed before the initial push.
