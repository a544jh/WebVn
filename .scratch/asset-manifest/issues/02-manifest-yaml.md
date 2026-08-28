# manifest.yaml as a real document

Status: needs-triage

Step 2 of `../spec.md`. Blocked on `01-manifest-type-and-seed.md`, which gives this a type to parse
into. Not yet refined - the open questions below are why.

## What it is

`manifest.yaml`, separate from `script.yaml`, YAML rather than JSON so it uses the parser and
dependency already in the tree and stays readable in an export. Per `design-docs/PROJECT_STORAGE.md`:

```yaml
id: my-story        # author-chosen, restricted charset, names the directory
title: My Story
formatVersion: 1
actors:
  A1:
    name: Actor
    nameTagColor: purple
    sprites: [idle.png, "2.png"]
backgrounds: [a.png, b.png]
audioAssets: [bgm/map01.ogg, sfx/bigthump.ogg]
```

Validated with Zod, matching how commands are already parsed via `makeZodCmdHandler`. The `id` schema
carries the charset rule, since this is the only place it can be enforced: `^[a-z0-9][a-z0-9_-]{0,63}$`,
rejecting the Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, `LPT1`-`LPT9`, `.`, `..`,
and leading or trailing dots and spaces). Lowercase-only is what stops two ids colliding when an export is
extracted on a case-insensitive filesystem. `id` is required, not optional - it names the project's
directory, so there is no unnamed-project state.

## The manifest is a file index, not just an asset list

URL import - importing a VN from a hosted static folder - has no directory listing to work from, so the
manifest is the only thing that can say what a project contains. `actors[].sprites`, `backgrounds` and
`audioAssets` already enumerate every asset, so the importer fetches `<base>/manifest.yaml`, parses it, and
then fetches `script.yaml` plus exactly what it declares.

That constrains this ticket: **a file the manifest does not declare cannot be imported**, so the schema is
the definition of a project's contents and not merely a convenience for the asset loaders. It already
matches the engine, which will not load an undeclared asset either.

## The URL payload consequence

`?vn=<gzipped script>` stops describing a complete story once the asset and actor declarations live
in the manifest. The design doc's intended fix is a two-document YAML stream - manifest, `---`,
script - which the `yaml` dependency already parses. A shared link with custom assets also needs a
base URL for them (`&assets=<url>`), which is worth having anyway since it makes reusable asset packs
possible.

A payload whose manifest document carries no `id` is invalid and the player bails, rather than falling back
to a default key. There is no shared key to fall back *to*: the id is what a player's saves are filed under,
so inventing one would silently mix unrelated stories' progress together.

## Open questions

- Does `formatVersion` do anything yet, or is it written and ignored until there is a v2?
- Where does `id` come from before a project store exists (TODO: OPFS store)? There is no creation UI to
  author one yet, so in practice it is a literal in whatever manifest is being loaded. It unblocks player
  save keying, which currently hardcodes `"test"` and becomes `vn-save-<id>` - but that is its own line in
  `TODO`.
- Does the editor gain a way to edit the manifest, or is it hand-edited YAML for now?
- ~~Does the demo ship a real `manifest.yaml`?~~ Yes - settled by making "load the demo" a URL import
  rather than a special case. See "The demo ships the first real manifest" below.

## The demo ships the first real manifest

`design-docs/PROJECT_STORAGE.md` ("The demo is the first published VN") builds the library's "load the demo"
button as a URL import of a demo laid out in `dist/` as a published project. That makes the demo's
`manifest.yaml` the first real instance of this file format rather than an example in a document, and it is
what this ticket should be validated against.

Most of it already exists: `CopyPlugin` copies `test-assets/` into `dist/` verbatim, so the assets are
already served at the paths `DomRenderer` builds. What is missing is `manifest.yaml` and `script.yaml` as
real files instead of the constants in `src/demoStory.ts`.

Mechanism: author the YAML files, then import them back into `demoStory.ts` as strings with `?raw`. Vite
supports that suffix natively and webpack 5 matches it with a `resourceQuery: /raw/` rule of
`type: "asset/source"`, so one spelling works in both the build and the vitest projects. The YAML files
become the single source, `demoStory.ts` re-exports them, and `test/demo/DemoStory.test.ts` does not change.

The demo's id is `webvn-demo`.

## See also

- `design-docs/PROJECT_STORAGE.md` - the manifest section, "Renaming", and "Leaving the browser"
- `TODO` - "D -> URL payload becomes a two-document YAML stream", "project id embedded in the
  exported story"

## Comments

### 2026-08-28 - synced with the project-id design change

`design-docs/PROJECT_STORAGE.md` dropped UUIDs for an author-chosen id that names the project's OPFS
directory, and the manifest `id` is now the source of truth for identity everywhere - not the archive
filename, not the directory name, both of which are derived labels allowed to go stale.

Changed here: the example no longer shows a UUID; the Zod schema gains the charset rule and `id` becomes
required; the URL payload section states that a missing `id` is invalid rather than defaulting; the save-key
question notes the `vn-save-<id>` shape.

Unchanged: `VnManifest` in step 1 stays assets-only, so `01-manifest-type-and-seed.md` and
`docs/adr/0001-manifest-seeds-the-initial-state.md` are unaffected. Identity fields (`id`, `title`,
`formatVersion`) arrive with the file format, which is this ticket.

Still open, and now narrower: whether the demo ships a real `manifest.yaml` or keeps `demoManifest` as a
TypeScript constant. The design says an id is mandatory, so either way the demo needs one - `demo` is the
obvious literal, and it also retires the hardcoded `"test"` save key.

### 2026-08-28 - the demo settles the file format

Brainstormed the library's first-run story and it lands back on this ticket. "Load the demo" becomes a URL
import of a demo published into `dist/` in the OPFS layout, so the demo needs a real `manifest.yaml` - which
answers this ticket's last open question and gives the schema a first real instance to be validated against.

Two constraints arrived with it. The manifest is now a *file index*: URL import has no directory listing, so
anything the manifest does not declare cannot be imported. And the demo's id is `webvn-demo`, which also
retires the hardcoded `"test"` save key.

Still open: `formatVersion`, and whether the editor gains manifest editing.
