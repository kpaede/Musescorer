# Community release readiness

Research date: 2026-11-13. **The current build supports development and manual ZIP installation, not normal Community installation.** Working rendering/playback in the development vault does not establish that the standard installer can install this build.

## Verified installation behavior

The official [submission instructions](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin) say that Obsidian downloads `main.js`, `manifest.json` and optional `styles.css` from the GitHub release matching the manifest version. A separate ZIP, WASM or editor directory is not installed by that mechanism. The tag must match the manifest's `x.y.z` version. Initial publication now uses the Community directory and its review process.

Additional files can exist in a plugin directory. Our files are there because the local build copies assets directly into the development vault's plugin folder. That is different from receiving those files through the normal installer. A fresh temporary installation containing only the three standard files failed when the actual `EngineClient` tried to read `renderer-worker.js`.

GitHub itself supports additional binary release attachments; its [release documentation](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) does not limit releases to the three Obsidian filenames. Attaching an engine archive therefore remains useful for manual installation, but does not make Community installation complete. The existing release workflow creates a draft with a manual ZIP and standard assets; those individual standard assets currently cannot operate by themselves.

## Size constraints

The official [Sync plans documentation](https://help.obsidian.md/sync/plans) sets a 5 MB per-file limit for Sync Standard and 200 MB for Sync Plus. This is distinct from a total GitHub release limit. A large single bundle creates a real compatibility problem for Standard synchronization even if it is technically installable separately on each device.

The public [plugin guidelines](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Releasing/Plugin%20guidelines.md), submission requirements and Community review documentation inspected here do not establish a blanket hard 5 MB cap on the sum of release attachments. The [review FAQ](https://docs.obsidian.md/community-directory/faq) distinguishes errors, warnings and recommendations but does not publish a specific bundle-size threshold. Treat a small standard bundle as a release target; do not claim a larger bundle is automatically approved.

### Measurements of the current pinned assets

Exploratory Brotli quality 9 compression, followed by Base64 for a JavaScript literal; no production loader was changed:

| Asset | Raw bytes | Brotli bytes | Base64 bytes |
| --- | ---: | ---: | ---: |
| Native WASM | 13,637,382 | 3,205,068 | 4,273,424 |
| Native data preload | 13,754,257 | 3,239,607 | 4,319,476 |
| FluidR3Mono soundfont | 23,712,790 | 19,013,131 | 25,350,844 |
| Original editor JavaScript | 2,342,225 | 628,981 | 838,644 |
| Original editor CSS | 824,709 | 295,684 | 394,248 |

WASM plus the data preload alone total 8,592,900 Base64 bytes in this experiment, before the editor, optional fonts, soundfont or loader. This does not prove an optimal compression bound, but rules out solving the current payload with a small packaging tweak. The complete current manual installation is approximately 61.7 MB and its ZIP 33.4 MB.

## Remote resources and dependency installation

The current [Developer policies](https://docs.obsidian.md/community-directory/developer-policies) prohibit plugins from installing or updating themselves or their dependencies. They also require README disclosure of network use. A downloader for executable engine/editor dependencies must not be assumed compliant simply because it uses a pinned version, hashes, user confirmation or a GitHub release.

The public policy does not give a WASM-specific exception or explicitly classify every kind of non-executable asset. Soundfonts, fonts and engine resource data need to be considered separately from executable JavaScript/WASM. A proposed asset-download design would require a concrete policy/review assessment before it is adopted. No automatic runtime downloader has been added. The current manual package remains offline after installation.

## Architectural choices

| Approach | Normal installer | Size target | Remaining work |
| --- | --- | --- | --- |
| Current ZIP with separate worker/engine/editor files | Incomplete | Small `main.js` hides the real dependency size | Manual installation only. |
| Fully self-contained three-file build with embedded local code and binary resources | Technically feasible as a build architecture; not implemented or approved yet | Current complete payload substantially exceeds 5 MB | Bundle/extract resources from standard assets, defer initialization, measure startup and validate a fresh three-file installation. |
| Small code bundle with separately supplied data/resources | Not implemented; needs a complete provisioning design | Requires measured budgeting and possibly a smaller engine/font set | Keep executable code in the standard release, distinguish manual provision from automatic installation, and resolve policy treatment before adopting downloads. |

The next engineering milestone should be a genuine three-file installation prototype, tested without the source tree or preexisting generated folders. Measure the full bundle rather than just `main.js` from the current split build. Do not promise both the entire current native engine/editor/soundfont and a sub-5-MB offline distribution without changing the payload or architecture.

Before Community submission, settle the permanent plugin ID, choose and validate a distribution architecture, record network/dependency behavior accurately, and use the directory's [Review branch](https://docs.obsidian.md/community-directory/faq) feature to assess the actual candidate. No Community entry, approval or policy clarification request has been submitted as part of this research.
