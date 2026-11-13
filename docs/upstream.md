# Upstream maintenance

## Repository strategy

Maintain MuseScorer as its own Obsidian plugin repository with a pinned, vendored OTS dependency. The notation UI remains close to OTS: 685 recorded frontend inputs, with Obsidian hooks in only two upstream files at the current pin. Most integration code lives separately in `editor-app/` and `src/`. We can continue taking upstream changes; every update still needs review and native integration tests.

The plugin repository is [kpaede/Musescorer](https://github.com/kpaede/Musescorer). The separate [kpaede/OTS_WebEditor](https://github.com/kpaede/OTS_WebEditor) repository is a real GitHub fork of [OurTextScores/OTS_WebEditor](https://github.com/OurTextScores/OTS_WebEditor). It preserves the GitHub upstream relationship and provides a place to review source updates and contribute shared hooks or fixes. The plugin remains its own repository; it is not itself a fork of the entire OTS website. Forking the entire MuseScore desktop project would add a large maintenance burden: OTS already maintains its native bridge and engine patch set.

The Obsidian sample plugin is the development starting point, not a runtime dependency. Review changes to build tooling, API conventions and release configuration selectively. Do not merge a fresh template over the plugin source.

The local Git checkout uses three remotes:

| Remote | Repository | Purpose |
| --- | --- | --- |
| `origin` | `https://github.com/kpaede/Musescorer.git` | Plugin source and CI. |
| `ots-fork` | `https://github.com/kpaede/OTS_WebEditor.git` | OTS fork for upstream contributions. |
| `ots-upstream` | `https://github.com/OurTextScores/OTS_WebEditor.git` | Original OTS source and reviewed commit pins. |

Remote configuration is local Git state. To restore it after cloning the plugin, run:

```sh
git remote add ots-fork https://github.com/kpaede/OTS_WebEditor.git
git remote add ots-upstream https://github.com/OurTextScores/OTS_WebEditor.git
```

Only push plugin branches to `origin`. Review OTS history in a separate clone of `ots-fork`, with the original repository as its `upstream` remote; do not merge the website's root tree into the plugin. Keep the OTS fork's default branch aligned with the original and use separate branches for contributions.

The monitoring workflow in the plugin repository runs weekly on Monday at 08:23 UTC and can also be started manually. It writes a summary and fails when an upstream differs, making changes visible in Actions. Notification delivery depends on your GitHub settings. The check does not create issues, pull requests or messages, and no notification subscription is changed. Fork workflows do not need to be enabled for this plugin check.

## Recorded sources and patches

| Source | Recorded version | Update policy |
| --- | --- | --- |
| OTS editor and engine | `editor-lock.json` and `engine-lock.json`: `3ec0452e12952d59308feb3c1da0553ee17fbcbe` | Review editor, bridge and engine assets together. |
| MuseScore native engine | 4.7.4, `7688c005ad963ba09ee715aae53dbc7e8c9d5ef8` | Follow the version supported by OTS's Qt-free bridge. |
| Obsidian sample plugin | `07ceb81d1fb3384af611ebf665a1ec42a7e5926d` | Selectively take tooling/API changes. |
| FluidR3Mono GM soundfont | SHA-256 in `engine-lock.json` | Independently versioned; retain its license. |

`patches/ots-editor-obsidian.patch` captures the two frontend modifications against the exact OTS commit:

- `components/ScoreEditor.tsx`: report the active native session and imported filename to the Obsidian host; stop original-editor audio when another leaf takes over.
- `components/score-editor/score-url.ts`: avoid replacing the browser URL inside the local iframe.

The engine wrapper sources remain unmodified. The local asset injection is an esbuild hook in `esbuild.config.mjs`. Module aliases, the local fetch bridge, disabling editor analytics and gating the unavailable Performance command are in our build/adapters, outside the original frontend. The Performance gate checks its expected original command definition and fails the build if upstream changes require review; it does not modify the vendored source or its lock.

Checksums detect local input changes, not new upstream releases. The update check performs the separate remote comparison:

```sh
npm run check:upstream
node scripts/check-upstream.mjs --json
node scripts/check-upstream.mjs --fail-on-update
```

The command reads the pins and GitHub's public API, optionally using `GH_TOKEN` or `GITHUB_TOKEN` for API limits. It sends repository identifiers and commit requests, never vault data. Network failures and inconsistent editor/engine pins are errors. Different default-branch heads are flagged for review without assuming commit ancestry. The MuseScore stable release is informational: a newer desktop release is not necessarily supported by OTS yet. Nothing is downloaded into the plugin or applied automatically, and the runtime plugin never runs this check.

## Taking an update

1. Use the comparison links to review OTS changes, including its engine manifest, bridge, API schemas, resources, dependencies and licenses. Choose a specific commit rather than a moving branch.
2. In a separate OTS checkout, fetch that commit and its Git LFS assets. Preserve our current vendored source until the replacement is ready.
3. Copy the original frontend inputs to a staging directory. Apply `patches/ots-editor-obsidian.patch` from the frontend root with `git apply /path/to/MuseScorer/patches/ots-editor-obsidian.patch`. Resolve hook conflicts against the new upstream behavior and regenerate the patch against the new pristine source. Never apply this patch twice to the already adapted vendor tree.
4. Review adapter compatibility with the real engine API. Obtain a matching engine bundle from the same OTS revision, or rebuild it using [engine.md](engine.md). Update JS glue, WASM, data, schemas, wrappers and required fonts together. Preserve the independently pinned soundfont unless intentionally updating it.
5. Replace the reviewed vendor files. Update both OTS commit fields and recalculate the explicit file inventories in `editor-lock.json` and `engine-lock.json`, including added/removed inputs. Keep original licenses and attribution. Do not merely accept changed hashes without examining their sources.
6. Run `npm ci`, `npm run verify:editor`, `npm run verify:engine`, `npm run build`, `npm test`, `npm run lint`, `npm run test:engine` and `npm run test:obsidian`. Check native rendering, editing, undo/redo, recovery, saving, audio and highlighting in the development vault. Review SVG changes and the offline boundary.
7. Record the chosen revision, patch changes and validation results. Package a reviewed plugin release with `npm run package`. Keep the previous release available for rollback.

The OTS fork can host these hooks as upstream pull requests, reducing the local patch further. The existing separated adapters let us pursue that without reorganizing the plugin. Synchronizing the fork does not update the vendored plugin inputs; follow the reviewed update procedure above.
