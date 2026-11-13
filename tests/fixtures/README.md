# Native score fixtures

The C-scale and compatibility fixtures originate from the pinned upstream sources documented in `docs/engine.md` and `THIRD_PARTY_NOTICES.md`.

`page-turns.mscx` is derived from `c_scale.mscz`'s native MSCX score. It inserts a page break after each of the first two measures on staff 1 and sets quarter note = 90. The three short pages make it practical to verify audible playback following across real page boundaries without waiting through the long Bach fixture. It is loaded directly by the native engine in the development-vault test; no renderer or segment geometry is mocked.
