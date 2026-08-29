# manifest.yaml as a real document

Status: done

Step 2 of `../spec.md`. Unblocked - `01-manifest-type-and-seed.md` is done, and gives this a type to parse
into. Refined 2026-08-28 in a grilling session; the decisions below replace the open questions this ticket
used to carry. See the comment at the bottom for what moved and why.

## What it is

`manifest.yaml`, separate from `script.yaml`, YAML rather than JSON so it uses the parser and dependency
already in the tree and stays readable in an export. Per `design-docs/PROJECT_STORAGE.md`:

```yaml
id: my-story        # author-chosen, restricted charset, names the directory
title: My Story
actors:
  A1:
    name: Actor
    nameTagColor: purple
    sprites: [idle.png, "2.png"]
backgrounds: [a.png, b.png]
audioAssets: [bgm/map01.ogg, sfx/bigthump.ogg]
```

## Scope

**In:** the Zod schema, `parseManifest`, and the demo shipping a real `manifest.yaml` and `script.yaml`
validated against it.

**Out, each already its own line in `TODO`:** the URL payload becoming a two-document YAML stream, and
player save keying (`vn-save-<id>` replacing the hardcoded `"test"`). Splitting them leaves one hazard,
recorded under "Deferred" below.

## The type: identity goes on `VnManifest`

`VnManifest` gains `id` and `title` alongside the assets. One type, one schema, everything in one place -
rather than a `ProjectManifest` wrapping an assets-only `VnManifest`.

The cost is that `parseStory(text, manifest)` and `seedState(manifest)` now receive two fields neither will
ever read, which widens the boundary `docs/adr/0001-manifest-seeds-the-initial-state.md` drew. That ADR's
reasoning still holds - the manifest is still an input, still immutable while a story runs, still nothing
playback points into - so it gains an amendment rather than a successor.

## The schema

Validated with Zod, matching how commands are already parsed via `makeZodCmdHandler`.

**`id`** is required and carries the charset rule, since this is the only place it can be enforced:
`^[a-z0-9][a-z0-9_-]{0,63}$`, rejecting the Windows reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`,
`LPT1`-`LPT9`, `.`, `..`, and leading or trailing dots and spaces). Lowercase-only is what stops two ids
colliding when an export is extracted on a case-insensitive filesystem. It names the project's directory, so
there is no unnamed-project state.

**`title`** is required. It is display-only and has no consumer until the library UI exists, so optional is
defensible - but with no `formatVersion` (below) there is no way to announce a field becoming required later,
and requiring it now costs an author one line.

**No `formatVersion`.** Every manifest that will ever exist at the time this ships is one we generate: nothing
has written one, and the demo is regenerated from source on every master push. There is no v1 file in the
wild for a future v2 to break, and the format is not stable enough to be worth declaring stable. Zod strips
unknown keys by default, so a file carrying `formatVersion: 1` still parses clean. The trigger to add it back
is the first compatibility break - see "Deferred".

**Actor keys must be capitalized**, with `default` and `narrator` as the only permitted lowercase keys.
This is not a new rule; it is an existing one that is currently enforced by accident. `YamlParser.ts:143`
decides a `Name: "text"` line is a Say by testing `key[0] !== key[0].toLowerCase()`, so an actor declared as
`a1` is one no script can ever speak as - and `a1: "hello"` falls through to line 130 and becomes
`"a1 is not a recognized command"`, blaming the script for the manifest's mistake. The schema is the first
place in the codebase where the rule can be stated as data rather than inferred from a casing test.
`default` and `narrator` are both legitimate and both lowercase: `seedActors` merges `default` field by
field and replaces `narrator` wholesale, and the demo already declares the latter.

**`sprites` keeps its name** in the file format, matching today's `Actor.sprites`. `CONTEXT.md` says a pose
is the image and a sprite is the thing on screen, so this key is misnamed on arrival - but renaming it is
`.scratch/sprite-pose-split/`'s job, not a rider on the file format ticket.

## `parseManifest`

Lives in `src/yamlParser/` next to `parseStory`, and joins the `VnParser` interface. `src/core/` imports
`zod` but not `yaml`, and keeping it free of both yaml and the DOM is worth more than the cohesion of putting
the parse next to the type. `VnEditor` already holds a `VnParser`, so manifest editing - when it arrives -
needs no new constructor argument.

**Signature: `[VnManifest | null, ParserError[]]`. A bad manifest is fatal.** This is deliberately unlike
`parseStory`, which returns a playable state even when a command fails to parse. A script with one broken
command still has content worth showing; a manifest that fails validation has no *identity*, and identity is
what saves are keyed on and what `PROJECT_STORAGE.md` means by "no manifest means garbage". Falling back
would load a project under another project's save key, which is the silent mixing the design already rules
out. Recorded as its own ADR, since a reader will otherwise ask why the two parsers disagree.

Errors are `ParserError` with `SourceLocation` from `LineCounter`, exactly as `parseStory` produces, so the
editor's existing gutter markers work on them unchanged.

## `EMPTY_MANIFEST` becomes `TEST_MANIFEST`

With `id` and `title` required, the name states something false. It is used in exactly three test files
(`test/helpers/vnHarness.ts`, `test/browser/DomRendererLoadStory.test.ts`, `test/unit/YamlParser.test.ts`)
and nowhere in `src/`, so it moves to `test/helpers/` under a name that says so, with a real-looking id
rather than a placeholder.

`core/` cannot import from `test/`, so `seedState`'s `= EMPTY_MANIFEST` default parameter goes with it and
the six no-arg `seedState()` call sites become explicit. That is the point as much as a consequence: a
no-argument `seedState()` in production would mint exactly the identity-less state the required `id` exists
to prevent, and afterwards it will not compile.

## The demo ships the first real manifest

`design-docs/PROJECT_STORAGE.md` ("The demo is the first published VN") builds the library's "load the demo"
button as a URL import of a demo laid out in `dist/` as a published project. That makes the demo's
`manifest.yaml` the first real instance of this file format rather than an example in a document, and it is
what this ticket should be validated against. The demo's id is `webvn-demo`.

**The files live at `test-assets/manifest.yaml` and `test-assets/script.yaml`.** `CopyPlugin` copies
`test-assets/` to the dist root, where `backgrounds/`, `sprites/` and `audio/` already sit at the paths
`DomRenderer` builds - so putting them there makes the demo a published folder for free, which is what URL
import will later read back. It is not yet the design doc's `assets/...` layout; that regrouping belongs to
the OPFS-layout ticket.

**Mechanism:** import the YAML back as strings with `?raw`. Vite supports the suffix natively and webpack 5
matches it with a `resourceQuery: /raw/` rule of `type: "asset/source"`, so one spelling works in the build
and in all three vitest projects. A `*.yaml?raw` module declaration goes in `src/types/`.

**`demoStory.ts` parses at module load and exports `demoManifest`**, so `index.ts` and `playerIndex.ts` keep
`seedState(demoManifest)` and never see YAML text or an error list. This is scaffolding, not architecture:
once the player parses `manifest.yaml` at boot - URL import, then OPFS - the demo becomes an ordinary
project loaded through the normal path and this export has no reason to exist. The URL-import ticket deletes
it.

Because `parseManifest` can return `null`, the module needs a branch, and it throws. That throw is
type narrowing, **not** the validation mechanism: the guarantee comes from a unit test in `test/unit/`
asserting the demo's manifest parses with zero errors, which runs in the fast gate. `demoYaml` continues to
be re-exported as a string, so `test/demo/DemoStory.test.ts` does not change.

## Deferred, with the edges that matter

**The URL payload must land before or with save keying.** `?vn=` stays script-only after this ticket, so
`playerIndex.ts` keeps parsing a foreign script against `demoManifest`. That is harmless while the save key
is the hardcoded `"test"` everyone shares. The moment the key becomes `vn-save-<id>`, every shared story
writes its saves under `webvn-demo`, because that is the only id in scope - the exact "silently mix unrelated
stories' progress together" outcome the design rules out. The ordering edge is recorded in `TODO`.

**`formatVersion` comes back on the first compatibility break.** The likeliest first one is the `sprites` to
`poses` rename in `.scratch/sprite-pose-split/`, which is a breaking format change with nothing able to
detect it. Whichever ticket makes that break adds the field and the version gate in the same change.

**An undeclared asset should be a `ParserError`.** Once the manifest is the file index, a script referencing
an asset the manifest does not declare is broken-on-arrival for every imported project, and the parser
already holds the manifest. The design doc's claim that "the engine will not load an undeclared asset
either" is not quite what the code does - `backgrounds`/`audioAssets` only drive `DomRenderer.loadAssets`
preloading, so today it is a render-time miss, not a refusal. The rule is agreed; it changes author-visible
behaviour, so it is filed as `03-undeclared-references.md` rather than riding along here.

**How a player should handle unknown commands** - the script-side equivalent of a format version - is a
separate refinement, not blocked on anything here.

## See also

- `design-docs/PROJECT_STORAGE.md` - the manifest section, "Renaming", and "Leaving the browser"
- `docs/adr/0001-manifest-seeds-the-initial-state.md` - and its 2026-08-28 amendment
- `docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md`
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

### 2026-08-28 - refined; all open questions closed

A grilling session worked the ticket to an empty frontier. The three open questions are answered and the body
above is rewritten around the answers; `needs-triage` becomes `ready-for-agent`.

The three that were open:

- **`formatVersion`** - dropped entirely, not written-and-ignored. The reasoning inverted along the way:
  "the format is unstable" argues *for* a version field, but what actually makes dropping it safe is that no
  manifest exists outside our control yet. Recorded with an explicit re-add trigger so "when it stabilises"
  does not become a date nobody notices passing.
- **Where `id` comes from before a project store exists** - a literal in the demo's `manifest.yaml`, which
  is now a real file. Verified that nothing in `src/` constructs a manifest without an id; the only
  id-less manifest is the test one, which leaves `src/` in this ticket.
- **Manifest editing in the editor** - still out. Hand-edited YAML until the project store lands.

Decided beyond those: identity goes on `VnManifest` rather than a wrapping type; `title` is required;
`parseManifest` lives in `yamlParser/` and returns `null` on failure, unlike `parseStory`; actor key casing
becomes a schema rule; `sprites` keeps its name; the demo's YAML lives in `test-assets/` and `demoStory.ts`
parses it at module load as explicitly transitional scaffolding.

Two hazards surfaced that were not visible before and are now written down rather than discovered later: the
`?vn=` path borrowing the demo's identity once saves are keyed by id, and the `sprites` to `poses` rename
being an undetectable format break in a format with no version field.

### 2026-08-28 - implemented

Landed as specified. `VnManifest` carries `id` and `title`; `parseManifest` lives in
`src/yamlParser/parseManifest.ts` and joins `VnParser`; `EMPTY_MANIFEST` is gone and
`TEST_MANIFEST` lives in `test/helpers/testManifest.ts`; the demo ships
`test-assets/manifest.yaml` and `test-assets/script.yaml`, imported with `?raw`.

Three things worth recording that the refinement did not anticipate:

- **`getLines` was extracted** to `src/yamlParser/sourceLocation.ts`. Both parsers need it and
  duplicating it would let the two drift, which is exactly what would break the shared gutter
  markers the ticket relies on.
- **The three declaration lists default to empty** rather than being required. Identity does not
  default, which is the rule the ticket states; making a project with no audio write
  `audioAssets: []` buys nothing. `title` is rejected when empty, since an empty title says the
  same thing as an absent one.
- **YAML resolves an unquoted all-digit id to a number** before the schema sees it, so `id: 2024`
  fails with "expected string" and has to be quoted. The charset permits an all-digit id, so this
  is a real authoring edge; it is covered by a test that names it rather than smoothed over, since
  coercing would also have to accept `true` and `[]`.

`test/demo/DemoStory.test.ts` did not change, as the ticket said it should not - but only just.
The old `demoYaml` template literal opened with a newline, so lifting it into a file verbatim
shifted every line number up by one and broke the three the demo test asserts. `script.yaml` opens
with a one-line comment, which restores the numbering and gives the file a header.

### 2026-08-28 - review fixes

A two-axis review found six things worth acting on. Four were in code the ticket did not describe,
which is where the mistakes were:

- **An empty actor id crashed the parser.** `key[0] !== key[0].toLowerCase()` is partial, and zod
  runs a refinement even when the checks before it failed, so `actors: { "": {} }` threw a
  `TypeError` out of a function whose whole contract is returning errors instead. The predicate is
  total now, and a test holds it there.
- **A declaration key with nothing after it was fatal.** `.default([])` fires on an absent key, but
  an author who writes `audioAssets:` and stops hands YAML a null, which failed as "expected array".
  Declaring nothing and declaring emptiness are the same statement, so both take the default now.
- **Actor-id errors pointed one line too low.** The location came from the value node, and the
  actor-id rule is the one rule here about a *key* - which sits on the line above its mapping. An
  issue now spans the whole `key: value` pair.
- **A second YAML document was silently dropped.** `---` in a manifest took the first document and
  ignored the rest. That is exactly the shape the deferred URL payload will take, so it is an error
  rather than a trap left for that ticket to fall into.

Two more were duplication rather than defects: the compose boilerplate and the YAML-problem
conversion were copied from `parseStory`, so `sourceLocation.ts` became `yamlDocument.ts` and both
parsers share `composeDocuments`, `yamlProblems` and `getLines`. `parseStory`'s behaviour is
unchanged, which the demo suite's exact error assertions verify.

The review also flagged `title: ""` being rejected and this file's own bookkeeping edits to `TODO`
as beyond what the ticket asked for. Both stand: an empty title says the same thing as an absent
one, and D is genuinely landed.

### 2026-08-28 - the formatVersion trigger changed shape, and moved

`.scratch/sprite-pose-split/` is now `.scratch/sprites/`, and the `sprites`-to-`poses` rename this
ticket named as the likeliest first compatibility break is rejected - "sprite" keeps its name in the
file format and the on-screen type becomes `SpriteInstance` instead.

The trigger itself still holds, in a different shape: `Actor.sprites` goes from a list of filenames to
a map of declared names, which is a breaking format change with nothing able to detect it. That ticket
adds `formatVersion` and the version gate, exactly as this one specified.
