# An undeclared asset is a parse error

Status: needs-triage

Split out of `02-manifest-yaml.md` during its 2026-08-28 refinement. The rule is agreed; the severity and
the author experience are not, which is why this is its own ticket rather than a rider on the file format.

Unblocked. `02-manifest-yaml.md`, which is what makes the manifest a file index in the first place,
landed in [#35](https://github.com/a544jh/WebVn/pull/35); this file said it was still blocking until
2026-08-29, which hid a ready ticket from anyone scanning for one.

## The rule

A script that references an asset the manifest does not declare should produce a `ParserError`.

`design-docs/PROJECT_STORAGE.md` makes the manifest the index of what a project contains: URL import has no
directory listing, so **a file the manifest does not declare cannot be imported**. A script referencing an
undeclared background is therefore broken-on-arrival for every imported copy of that project, however well it
worked in the editor that wrote it.

## What the code actually does today

The design doc says this "already matches the engine, which will not load an undeclared asset either". That
is not quite true, and the gap is the reason this ticket exists.

`backgrounds` and `audioAssets` are read in exactly one place: `DomRenderer.loadAssets`, which preloads them.
Nothing validates a `bg: c.png` against the list. An undeclared background is a *cache miss at render time*,
not a refusal - the story parses clean, plays, and then does the wrong thing on the frame that needs the
image. `Actor.sprites` is the same: `DomRenderer.ts:396` preloads from it and nothing checks `show` against
it.

So the check does not exist anywhere yet. The parser is the natural home for it: `parseStory` already
receives the manifest.

## Open questions

- **Severity.** `ParserError` carries an `ErrorLevel`. `ERROR` is right for an imported project, but it makes
  writing a script before the art exists a red-gutter experience - and that is the normal authoring order.
  `WARNING` matches how unrecognized commands are already treated. Is the answer a `WARNING` that the
  import/export path promotes to an `ERROR`?
- **Which commands.** `bg` images, `bgm`/`sfx` audio, and `show` poses are the three. `show` is the awkward
  one: it is keyed per actor, so the check is "is this pose in *this actor's* list", and that list is
  `Actor.sprites`, which `.scratch/sprites/` reshapes into a map of declared names.
- **What the player does with it.** `playerIndex.ts` ignores `parseStory`'s error list entirely, so a
  `ParserError` here is invisible to a player either way. Does that stay true, or does an undeclared asset
  become one of the things that stops a story loading?

  **This premise expires.** `.scratch/manifest-editor/issues/01-manifest-in-the-editor.md` gives the
  player its first error surface - a payload it cannot load says so in the vn div - so "invisible
  either way" stops being the answer as soon as that lands. The question becomes a real choice rather
  than a moot one.

## Why it is worth doing

It turns a silent wrong-frame into a message that names the file and the line, at the moment the author can
still fix it - and it is the only enforcement the "manifest is the index" decision currently has. Without it
the invariant is documented but not defended, and the first time it bites will be on someone else's machine
after an import.

## See also

- `.scratch/asset-manifest/issues/02-manifest-yaml.md` - where this was split from
- `.scratch/manifest-editor/issues/01-manifest-in-the-editor.md` - the other half of the same problem,
  and the boundary between them: this ticket catches a script naming an asset the manifest never
  declared, which a parser can see by reading both documents; that one catches a manifest naming a
  file that is not there, which only a failed load can reveal
- `design-docs/PROJECT_STORAGE.md` - "The manifest is the index"
