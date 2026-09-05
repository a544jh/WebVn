# Project storage: OPFS as the working copy

**Landed 2026-08-30.** All six tickets are code; each carries `Status: done`. What shipped matches this
spec, with the deviations recorded in the tickets and the commit messages - the notable ones being that
`DomRenderer` took an options object rather than a fourth argument, the boot was lifted into
`src/editorBoot.ts` so a test exercises the one that ships, and the demo seed also fetches the demo's
media, since a demo seeded from the two YAML files alone opens with every declared file reported missing.
One finding came out of it, filed in `ROUGH_EDGES.md`, though it turned out not to belong to this effort at
all: an unanimated background render reports finished one frame before it paints, so the editor flashes white
for a frame on every script load. It was first written up here as an OPFS object-URL problem; it is not one,
and `BackgroundRenderer` is untouched by these commits.

The storage chain in `TODO`, designed in `design-docs/PROJECT_STORAGE.md`. Nothing an author types
survives a reload today: `src/index.ts` boots the editor by handing it two strings compiled into the
bundle, and there is no other copy of a project anywhere. This effort is what makes the editor
durable, and it is the prerequisite that the project picker, rename, import, export and script
includes all hang off.

Extracted 2026-08-29 as **tranche 1** of that chain - the seam, the filesystem layer, the store on
top of it, the editor booting through all three, and the lock that keeps two tabs from overwriting
each other. Grilled over five rounds on 2026-08-30, which is where most of the specifics below come
from; the picker and everything past it are tranche 2 and 3, sketched at the bottom so the ordering
is written down rather than rediscovered.

**Tranche 2 was extracted 2026-09-05 as `.scratch/project-library/`** - the picker, new and deleted
projects, rename with its crash recovery, and per-project size with `persist()`. The sketch at the
bottom of this file is what it was extracted from and is left as written; the tickets are what to
work from. The export nag that `TODO` bundles with `persist()` did not go with it: there is nothing
to export yet, so it waits for tranche 3.

## Vocabulary

The editor **stores** the author's project into OPFS; the store **writes** files; a **save** is the
player's - a save slot holding a path through a story. `CONTEXT.md` has the entry, with `save`,
`autosave` and `persist` on its _Avoid_ list. The first draft of these tickets used "autosave"
throughout, which collides with a term this codebase has meant something else by since 2021.

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

## The six tickets

They are ordered by what each one needs from the last, not by size. Only 01 and 02 are independently
shippable; 03 through 06 are a working editor cut into reviewable pieces, 05 is the one an author
would notice, and 06 is the one that keeps 05 from losing their work.

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
   project, storing, and the indicator that says whether storing has happened. The first ticket with
   a user-visible effect, and the one that makes OPFS a hard requirement: a browser without it gets
   no editor rather than a memory-only one.
6. **`06-one-tab-per-project.md`** - a `navigator.locks` lock taken at boot, so a second tab is
   refused instead of racing the first one's writes.

## What tranche 1 deliberately does not do

- **No picker.** The doc's own sequencing rule - "build the layout for many, ship the UI for one" -
  is what makes this legitimate: 04 writes `projects/<id>/...` from the first commit, so the picker
  arrives later without a migration. 05 opens whatever `editor.yaml` names and nothing else.
- **No rename.** It needs the recursive walk from 03 and a place to show a dialog, and its four-step
  crash-safe ordering deserves its own ticket rather than a paragraph in 04.
- **No import, no export, no zip.** A separate effort with its own spec, and the doc's hard
  constraint - export must not ship ahead of zip import - belongs there where it will be read.
- **No rename, picker, import or export** - see the three bullets around this one. What *was* here
  and has moved into tranche 1 is `navigator.locks`, as ticket 06. It sat in tranche 2 until it
  became clear that 05 is what creates the hazard: before storing exists a second tab costs nothing,
  and after it there is exactly one copy of the author's work and two debounced writers. Deferring it
  would have meant shipping a known way to lose an author's work out of the durability effort.

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
