# Project storage: OPFS as the working copy

The storage chain in `TODO`, designed in `design-docs/PROJECT_STORAGE.md`. Nothing an author types
survives a reload today: `src/index.ts` boots the editor by handing it two strings compiled into the
bundle, and there is no other copy of a project anywhere. This effort is what makes the editor
durable, and it is the prerequisite that the project picker, rename, import, export and script
includes all hang off.

Extracted 2026-08-29 as **tranche 1** of that chain - the seam, the filesystem layer, the store on
top of it, and the editor booting through all three. The picker and everything past it are tranche 2
and 3, sketched at the bottom so the ordering is written down rather than rediscovered.

## What already landed, and must not be re-filed

The design doc was written before three efforts that have since shipped, and several of the things it
prescribes are now code. The doc has been amended to say so; this list is the short version, because
the cheapest way to waste a day here is to re-derive one of these:

- **A project declares its own assets**, in `manifest.yaml`, validated with Zod, as keyed maps of id
  to file. `.scratch/asset-manifest/` and `.scratch/asset-ids/`. The doc's "Prerequisite: assets
  have to become project data" is done, and its example manifest predates `formatVersion: 1`.
- **The id charset rule is enforced.** `ID_PATTERN` (`^[a-z0-9][a-z0-9_-]{0,63}$`) and
  `WINDOWS_RESERVED` in `src/yamlParser/parseManifest.ts:16-24`. The store validates ids by reusing
  that schema, never by restating the rule.
- **The player-save key is `vn-save-<id>`**, and the id rides on `VnPlayerState` via `seedState`, so
  the doc's "the project id must be embedded in the exported story" holds by construction.
- **The `?vn=` payload is a two-document stream**, manifest first - `docs/adr/0003-*`.
- **The demo is two real files.** `test-assets/manifest.yaml` and `test-assets/script.yaml`, imported
  with `?raw` and copied to `dist/` by CopyPlugin, exactly as the doc's "The demo is the first
  published VN" section prescribes. What is left of that section is the URL import that reads them
  back, which is tranche 3.
- **A declared file that is not there is reported rather than fatal.** `DomRenderer.loadAssets`
  resolves with the `DeclaredAsset[]` that failed, and the editor marks the manifest line that
  declared each one. Import's "fail the whole import and name the missing files" has a precedent to
  follow rather than a mechanism to invent.

## The five tickets

They are ordered by what each one needs from the last, not by size. Only 01 and 02 are independently
shippable; 03 through 05 are a working editor cut into reviewable pieces, and 05 is the one an author
would notice.

1. **`01-asset-resolver.md`** - TODO item E, and the gate on everything else. One interface between
   "logical path inside a project" and "URL something can fetch", consulted in exactly one place.
   Ships the interface and the relative-path implementation the player keeps forever; the OPFS
   implementation lands in 05, because it needs the store. Opens with a separate commit moving the
   asset directories under `assets/`, so the layout the store writes is settled before anything is
   written against it.
2. **`02-object-url-lifetime.md`** - the regression pin for 01's second implementation. Both loaders
   hand out `cloneNode()`, and a clone re-fetches its `src`, so an object URL revoked at the wrong
   moment yields an element that silently never loads.
3. **`03-opfs-primitives.md`** - the filesystem layer, knowing nothing about projects: atomic writes,
   a recursive walk, recursive delete, and the feature detection that decides whether this browser
   can hold a project at all.
4. **`04-project-store.md`** - project semantics over those primitives. The layout, enumeration as
   the truth about what exists, the manifest as the truth about what a project is.
5. **`05-editor-boots-from-the-store.md`** - the OPFS resolver, boot from `editor.yaml`'s last-opened
   project, and autosave. The first ticket with a user-visible effect.

## What tranche 1 deliberately does not do

- **No picker.** The doc's own sequencing rule - "build the layout for many, ship the UI for one" -
  is what makes this legitimate: 04 writes `projects/<id>/...` from the first commit, so the picker
  arrives later without a migration. 05 opens whatever `editor.yaml` names and nothing else.
- **No rename.** It needs the recursive walk from 03 and a place to show a dialog, and its four-step
  crash-safe ordering deserves its own ticket rather than a paragraph in 04.
- **No import, no export, no zip.** A separate effort with its own spec, and the doc's hard
  constraint - export must not ship ahead of zip import - belongs there where it will be read.
- **No `navigator.locks`.** Two tabs on one project race the autosave that 05 introduces. That is a
  real bug the moment 05 lands, and it is tranche 2's first ticket rather than tranche 1's last only
  because it needs the picker's teardown path to have somewhere to put the banner.

## Cross-edges worth remembering

- **The picker's first-run story is blocked on import, not on the picker.** An empty library is the
  worst introduction to an authoring tool, and the doc's answer is a "load the demo" button that is a
  URL import of the demo published in `dist/`. So either the picker ships with an empty state that
  admits it, or the demo import jumps ahead of the picker. Ticket 05 sidesteps this for tranche 1 by
  seeding the demo directly, as scaffolding with a named deletion condition.
- **`SourceLoader` is shared with `design-docs/SCRIPT_INCLUDES.md`.** Both documents specify the same
  `load(path): Promise<string>` shape, for the same reason. Nothing in tranche 1 builds it - 04's
  read functions are what it will eventually be written over - but do not invent a second file
  abstraction here, because that is the exact mistake the includes doc's sequencing section warns
  about.
- **Per-project size does not come from `navigator.storage.estimate()`.** That is origin-wide. The
  library's per-project figure comes from summing file sizes during 03's walk. Filed here because it
  is the sort of thing that gets discovered while implementing the nag, by which point the walk has
  already been written without it.
