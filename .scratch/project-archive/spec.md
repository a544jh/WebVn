# The project archive

Tranche 3 of `design-docs/PROJECT_STORAGE.md`. Settled by grilling on 2026-09-06, over five rounds,
after tranche 2 (`.scratch/project-library/`) landed the library on 2026-09-05.

Tranche 1 built the store, tranche 2 made it visible as a library. Neither gave the author's work a
way out of the browser: today the only copy of a project is in OPFS, and every destructive dialog in
the codebase says so in as many words - *"There is no export yet, so nothing outside this browser
has a copy"*, in `ProjectPicker.remove` and again in `AppShell.confirmOverwrite`. This tranche is
that sentence stopping being true.

**Scope: zip export and zip import, and nothing else.** `<project-id>.webvn.zip` on the author's
disk, written from a project in the library and read back into it.

## The invariant, which is the whole format

**An archive always holds a project that parses and has a script.** Both directions enforce it:
export refuses to build an archive from a project whose manifest does not parse or whose
`script.yaml` is missing, and import refuses an archive that fails the same test. `docs/adr/0005-an-archive-holds-a-project-that-parses.md`
records it, and records why it is not in tension with the store keeping an unparseable project
listed, openable and renameable.

The line is `docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md`'s, at the format
boundary rather than at the parser: **the manifest gates the archive, the script never does.** A
manifest that declares files nobody has drawn yet, a script with parse errors, and a script naming
ids the manifest does not answer all travel freely, because each of those is an ordinary state of a
project being written and the editor already reports every one of them on the line that caused it.

## Three decisions taken against the design doc

The doc is binding, so where this tranche departs from it the departure is written down here and the
doc is amended to point at this file.

**1. Zip lands before URL import.** `PROJECT_STORAGE.md`'s sequencing section says the reverse:
*"URL import lands before zip import. It needs no build machinery, the demo is already hosted, and
same-origin keeps CORS out of the first attempt."* That was written when `seedDemoProject` ran
behind the author's back and URL import was what would retire it. Tranche 2 already retired the half
that mattered - the picker's **Add demo project** button is an action that can take a lock, and the
library is no longer empty-or-broken - so what URL import buys now is *deleting scaffolding that
works*. Zip buys the durability claim, which is false today. The doc's other sequencing rule is
untouched and still binds: zip export and import both land before the linked-folder layer, because
the archive works in every browser and `showDirectoryPicker()` does not.

**2. An id collision offers overwrite or cancel, not rename-on-import.** The doc argues the other
way - *"'I tinkered with the demo and want a clean one too' is the natural case, and
overwrite-or-cancel forces losing one of them. It is the strongest argument for offering
rename-on-import."* Refused here because of what a copy under a different name would actually
produce. Writing the archive into directory `demo-2` while its manifest still says `id: demo` mints
exactly the id/directory disagreement the rename exists to repair, and `AppShell.rename` fires on
**manifest adoption** - so the first time the author clicks out of the manifest buffer they are
offered a rename of `demo-2` onto `demo`, and then an overwrite confirmation for the project they
imported a copy specifically to protect. The version that avoids that has to rewrite the manifest's
id on the way in, which is a bigger idea than it looks and wants its own ticket. The workflow in the
meantime is the honest one: rename the copy you already have, then import. Adding rename-on-import
later stays cheap, which is why this is recorded here rather than in an ADR.

**3. Export is gated on a manifest that parses.** The doc does not discuss it. See ADR 0005: it
costs the escape hatch for a project too broken to open - except that such a project is not too
broken to open, since the whole store is built to keep it listable and editable, so the hatch is
"fix the typo, then export".

## The tickets, in dependency order

1. **`01-import.md`** - the reader, the entry-stream seam, every refusal, the caps, the collision
   dialog, the picker's Import button and drop target, and the write ordering that makes a crashed
   import sweepable.
2. **`02-export.md`** - the writer, the two gates, the README, the flush-and-lock, the download, the
   buttons on the picker row and in the editor, and the renaming of the existing Export URL button.
3. **`03-the-exported-date.md`** - `exported` in `editor.yaml`, carried by a rename, dropped by a
   delete and by an overwriting import, and shown on the picker row. No nag.

Linear. **01 and 02 land on the same branch and 02 does not merge alone**, which is the doc's one
hard constraint here: *"An export that nothing can read back is not a safety net, it is a file that
looks like one. Defer zip import freely; do not ship the export button ahead of it."*

Import is first within that pair for a practical reason as well as the doc's: it is testable the
moment it exists, against archives produced by `zip` at a terminal - which is the interop case that
matters and the one a self-round-trip can never exercise.

## The library, measured

Spike **H** in `TODO` is settled. Measured 2026-09-06 with webpack 5.109.2 in production mode, gzip
deltas over an empty entry:

| candidate | gzip Δ |
| --- | ---: |
| `@zip.js/zip.js` package root, reader + writer | 65.0 KB |
| **`@zip.js/zip.js/lib/zip-core-custom.js`, reader + writer** | **30.6 KB** |
| `@zip.js/zip.js/lib/zip-core-native.js`, reader + writer | 44.4 KB |
| `unzipit` + `client-zip` | 6.7 KB |

**Use `@zip.js/zip.js` pinned to `lib/zip-core-custom.js`.** It constructs no workers at all
(`workerURI: null`, so the webpack worker fragility `CLAUDE.md` warns about does not have to be
managed - it does not arise), it delegates deflate to the platform's `CompressionStream` /
`DecompressionStream`, and it is the only candidate that pipes an archive entry directly into a
`FileSystemWritableFileStream` - `entry.getData(await handle.createWritable())`, which is the loop
`PROJECT_STORAGE.md` already wrote out. `unzipit`'s `ZipEntry` exposes only `blob()` /
`arrayBuffer()` / `text()`, so it must materialize each decoded entry whole.

The 24 KB over the `unzipit` + `client-zip` pairing buys that streaming import, deflate on write,
one dependency instead of two, and no permanent `Critical dependency: the request of a dependency is
an expression` warning in `npm run build` (unzipit's node-only `await import('node:worker_threads')`
emits one). All of it lands in `app.js`, which already carries CodeMirror, and none in
`playerIndex.js`.

**Two findings worth more than the numbers:**

- **The package's default entry bakes the build machine's path into the bundle.**
  `lib/zip-core-base.js` calls `setDefaultConfiguration({ baseURI: import.meta.url })`, and webpack
  resolves `import.meta.url` to an absolute `file://` path on the machine that built it, emitted as
  a string literal. At runtime `new Worker("file:///…")` throws `SecurityError`, zip.js swallows it
  and falls back to the main thread - so the archive still comes out correct and this would ship
  unnoticed, with the CI runner's checkout path published to the demo repo. Verified in the
  `zip-core-native` and `zip-core-external` builds. Pinning to `zip-core-custom.js` avoids it
  entirely.
- **The no-fallback floor is narrower than it sounds.** `zip-core-custom.js` has no bundled
  inflate/deflate, so it needs Compression Streams `deflate-raw` - but this code only ever runs in
  the editor bundle, and `opfs.ts`'s `isSupported()` already refuses an editor to any browser
  without OPFS `createWritable`. The floor bites only where a browser has one and not the other. If
  it ever does, `lib/zip-core-native.js` is a one-word change to the specifier for +13.8 KB gzipped,
  with no call site touched.

Only Chromium was exercised (the Playwright build the browser suites already use). Firefox and
Safari are unverified, which is the same coverage the rest of the storage work has.

## Cross-edges worth remembering

- **Import writes the manifest LAST, which contradicts `createProject`.** `createProject` writes it
  first, deliberately, *"so a project being made never presents as the residue a crashed rename
  leaves"*. Import is a copy rather than a mint, and the mirror-image reasoning applies: a manifest
  written first means a crash mid-import leaves a directory that *looks* like a valid project and is
  silently missing files - the "project with silent holes in it" the rename recovery exists to
  prevent. `renameProject` already writes its manifest last as the commit point; import follows the
  rename, not the mint.
- **That buys crash recovery for free, but only under a lock.** `recoverProjects.ts` sweeps
  directories with no `manifest.yaml`, so a crashed import needs no marker and no new recovery path.
  A *live* import is in exactly that state, so it must hold the destination's project lock for the
  duration - the sweep takes the lock on what it deletes, so this already works, but it is why the
  lock is not optional.
- **An overwriting import must drop the destination's saves.** `CLAUDE.md`: *"An id is reusable, so
  anything that changes or destroys one has to move or drop its saves."* A save left under the id
  describes a story the new project does not have, replay throws, and `SaveLoadMenu` has no
  `try`/`catch`, so Load becomes a dead button. Call `deleteSaveData(id)`, matching what delete
  does. Keeping them was considered: in the "importing my own backup" case they would still be
  valid, but that case is indistinguishable at import time from "someone sent me a project that
  happens to share an id", and guessing wrong produces the dead button. The cost is accepted
  cheaply - the editor is due better skip tooling, so a lost play position is a smaller loss here
  than it would be in a player.
- **An archive never carries saves.** They live in localStorage under `vn-save-<id>`, not under
  `projects/`, and `CONTEXT.md` keeps *save* as the player's word. A round trip restores the project
  and not the playthrough. Worth stating because the next reader will wonder whether it was an
  oversight.
- **Export must flush the storer before it walks.** Two independent reasons. The debounce is 2000ms,
  so an export taken straight after typing would otherwise ship an archive missing the author's last
  sentence - the worst possible bug in a backup feature. And `opfs.ts`'s `walk` comment is explicit
  that a walk has to run over a tree nothing is writing into: Chromium's `createWritable` leaves an
  enumerable `<name>.crswap` beside its target, which a concurrent walk either loses to
  `NotFoundError` or *yields as if it were the author's file*. That was the rename suite's
  one-in-eleven flake. The rename already waits for its storer before sizing, for exactly this;
  export reuses the ordering rather than inventing a `.crswap` filter, which would be the only place
  in the codebase naming a Chromium implementation detail.
- **The picker's browser suites must name their project directories after the suite.** Import takes
  locks, and `navigator.locks` is origin-wide and knows nothing about scratch roots. `RecoverProjects`
  and `RenameProject` both used `old-name`/`new-name` and cost a week to that - see `CLAUDE.md`.
- **The design canvas is binding for pixels and is behind.** `.scratch/project-library/design.md`
  links it and says *"Read it before building anything it draws. Tickets 02 and 03 were first built
  from the prose on this page alone and had to be redone against the drawings."* This tranche puts
  an export control and a last-exported line on every row. **Three new artboards are needed before
  any code**: a row with an export date, a row that has never been exported, and a row whose export
  control is disabled because the manifest does not parse.

## What this tranche deliberately does not do

- **No URL import, and no published static folder.** Tranche 4, per decision 1 above.
  `seedDemoProject` therefore survives this tranche too. Its deletion condition is unchanged and is
  still written in its own file.
- **No linked folder, no IndexedDB handle store.** After zip, per the doc's sequencing, which this
  tranche does not touch.
- **No single-file HTML export, no re-encoding on import, no content addressing.** All three are
  named in the doc and none is load-bearing for the archive.
- **No export nag.** The date lands (ticket 03) and the row says "never exported", which is most of
  the nag's value in the place the author is already looking. A nag proper wants a threshold nobody
  has evidence for, and its strongest argument - Twine's decade of lost libraries - is already
  partly answered by the `persist()` tranche 2 landed. Tranche 4's, if ever.
- **No `showSaveFilePicker()`.** Chromium-only, and the archive's entire justification in the doc is
  that it is the mechanism that works in every browser. It is the natural growth when the
  linked-folder layer ships, being the same permission surface.
- **No progress bar.** The control disables and says "Exporting…" / "Importing…", the picker's
  existing status line reports the result. The honest unit of progress here (entries) is not the one
  the author perceives (bytes).
- **No rename-on-import.** Decision 2 above.
