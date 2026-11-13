# Community release readiness

Updated: 2026-11-13. The distribution now uses exactly **main.js, manifest.json and styles.css**. It is a fully local, self-contained build; Community listing/review has not been submitted.

## Implemented distribution

The main bundle embeds the native WASM, native data, optional fonts, complete original OTS editor, worker/glue code, soundfont and legal notices. Assets are compressed with Brotli at build time, encoded into the bundle and decoded in memory only on demand. Their decoded size and SHA-256 are verified. No executable dependency installer, CDN loader or cache of extracted program files is used.

`engine/`, `engine.js`, `renderer-worker.js` and `full-editor/` in the source checkout are build/test intermediates. The package script never copies them to the installation. `dist/MuseScorer/` and its ZIP contain only the three standard files. The original soundfont and font coverage are preserved.

Use `npm run package` to build the candidate and `npm run test:install` to exercise an isolated three-file installation in the designated development vault. The test checks that main.js/styles.css match the package hashes, reads bundled legal notices offline, and runs the real rendering, editor, native copy/recovery, audio, pause/highlighting and page-following tests. It restores the original plugin and removes the temporary installation. Only the test manifest ID is changed to prevent conflicting registrations.

The first complete candidate passed this test: main.js 39,914,349 bytes, styles.css 6,811 bytes, manifest.json 259 bytes; ZIP 30,109,743 bytes. Twenty legal documents were accessible offline. The temporary plugin loaded in 543 ms in one warm application run; large-bundle startup cost remains relevant. See `docs/validation.md` for the evidence and limits.

## Installer and update rules

The official [submission instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin) specify the three standard release assets and a tag matching the manifest's x.y.z version. A GitHub ZIP or additional WASM attachment is not automatically installed. The previous split build failed in a fresh three-file directory; the embedded asset reader replaces that dependency on loose files.

GitHub itself permits [additional binary release attachments](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases), but installation correctness must be proven using only the standard assets. The release workflow attaches those assets and a ZIP of the same three files. The bundled Show credits and licenses command makes the legal notices available offline.

## Size and startup tradeoffs

The main bundle is approximately **40 MB**, larger than the previous 37-KB integration-only entry file. Loading/parsing that file still costs time and memory even though engine/editor decompression is deferred. The native wrapper requests a 512 MiB initial WASM heap, plus score/audio/font memory. No sub-5-MB or minimal-memory claim is made.

The official [Sync plans documentation](https://help.obsidian.md/sync/plans) sets a 5 MB per-file limit for Standard and 200 MB for Plus. This bundle therefore cannot be synchronized by Standard. Users need to install it separately on each desktop device. The [review FAQ](https://docs.obsidian.md/community-directory/faq) distinguishes errors, warnings and recommendations; this project does not claim automatic approval of a large bundle.

Exploratory Brotli quality 9 measurements explain the size: the native WASM alone becomes 4,273,424 Base64 bytes, the native data 4,319,476, and the current soundfont 25,350,844. The original editor, optional fonts and notices add further data. Compression is useful but cannot bring the entire current payload below 5 MB by itself. Smaller soundfonts or a reduced native/font resource set would be a separate optimization with quality/compatibility validation.

## No runtime dependency downloads

The current [Developer policies](https://docs.obsidian.md/community-directory/developer-policies) prohibit plugins from installing or updating themselves or dependencies and require disclosure of network use. The new design keeps executable code and resources in the normal release rather than assuming a downloader exception. Decompressing bundled bytes in memory does not obtain a separate dependency or update code from a server.

Only the explicitly invoked developer/upstream checker contacts GitHub; build-time npm setup is separate from plugin runtime. The iframe content policy continues to block remote resource access.

## Remaining publication work

Choose the permanent lowercase plugin ID before the first public Community release, review real startup/size measurements, provide corresponding source and attribution, and use the directory's [Review branch](https://docs.obsidian.md/community-directory/faq) feature on the actual candidate. A working three-file installation is not a claim of Community approval or of compatibility with every historical desktop version.
