# An undeclared reference warns and neutralizes its command

Status: done

Split out of `02-manifest-yaml.md` during its 2026-08-28 refinement, when the rule was agreed but the
severity and the author experience were not. Both are settled now - see `## Comments` for the session
that settled them, and `docs/adr/0004-an-undeclared-reference-neutralizes-its-command.md` for the
decision and the two alternatives it beat.

Unblocked. `02-manifest-yaml.md`, which is what makes the manifest a file index in the first place,
landed in [#35](https://github.com/a544jh/WebVn/pull/35).

## The rule

A **reference** is an id a script names expecting the manifest to declare it. A reference the
manifest does not answer - an **undeclared asset**, or an **undeclared actor** - produces a
`ParserError` at `WARNING` level against the script line that named it, and the command that made the
reference is replaced by an index-stable no-op. The story still loads and still plays.

`design-docs/PROJECT_STORAGE.md` makes the manifest the index of what a project contains: URL import
has no directory listing, so a file the manifest does not declare cannot be imported. A script
referencing an undeclared background is therefore broken-on-arrival for every imported copy of that
project, however well it worked in the editor that wrote it - and today it is broken *loudly and
late*, which is the part this ticket fixes.

## What the code actually does today

**The renderers throw.** `BackgroundRenderer.ts:129`, `SpriteRenderer.ts:160` and
`AudioRenderer.ts:105` each throw on an id they cannot resolve, and `BackgroundRenderer.render` is
called synchronously inside `DomRenderer.render`, so the throw takes out the render pass and the
story stops dead. (An earlier draft of this ticket described a silent cache miss; that was true
before asset ids landed and is not true now.)

**Except for actors, which fail silently.** `Say.ts:26` is
`state.actors[this.actorName] || state.actors.default`, so a line spoken by an undeclared actor is
shown in default styling with no complaint. That is the wrong-behaviour-not-crash case, and it is
not in the asset lookups where this ticket was originally looking.

**Nothing validates anything.** No parse-time check exists for any of the six reference kinds.
`parseStory` already receives the manifest, so the information is there and unused.

**The player discards the errors.** `playerIndex.ts:54` destructures `const [state] =` and drops the
`ParserError[]` entirely, two lines above a `console.warn` for missing files. The error surface added
by `.scratch/manifest-editor/issues/01-manifest-in-the-editor.md` is reached only by a refused
payload and a bad manifest, so an earlier draft's expectation that manifest editing would change this
did not come true on its own.

## The work

### 1. `Reference` and `undeclaredMessage`, in `src/core/manifest.ts`

A tagged union naming which declaration the id was expected in - `background`, `audio`, `actor`, or
`sprite` (which carries the actor as well as the sprite id) - and one function turning a `Reference`
into the message for it.

The four wordings are the three the renderers already throw, verbatim, plus one for actors in the
same voice:

- `No background is declared as ${id}`
- `No audio asset is declared as ${id}`
- `Actor ${actor} declares no sprite named ${id}`
- `No actor is declared as ${id}`

The three renderers import `undeclaredMessage` and stop building their strings, so the guard and the
warning cannot describe the same failure two ways. `src/domRenderer/` already imports
`core/manifest`, which is why the type lives there rather than beside the pass - a renderer importing
from `core/commands/` would be a dependency direction this codebase does not currently have.

### 2. `Command.references()`

`public references(): Reference[]` on the base class, returning `[]`. Four overrides:

| command | returns | exempting |
| --- | --- | --- |
| `bg` | the image, as `background` | `isBackgroundColor(image)` |
| `bgm` | the string or `.audio`, as `audio` | `STOP_AUDIO_ID` |
| `sfx` | the string, as `audio` | nothing - see below |
| `show` | the actor, as `actor`, **and** the sprite, as `sprite` | nothing |
| `Say` | the actor, as `actor` | `NARRATOR_ACTOR_ID`, `default` |

Each command exempts its own reserved values rather than the pass doing it, so the knowledge of what
`#` and `stop` mean stays with the command that gives them meaning. `Bgm.ts` already imports
`STOP_AUDIO_ID`; `Background.ts` gains an import of `isBackgroundColor` from `core/state.ts`, which
is where `CLAUDE.md` says both live precisely so command and renderer cannot drift.

`hide` takes a sprite instance id, not a declaration, and is not checked.

**`sfx: stop` warns, deliberately.** `parseManifest.ts:55` refuses `stop` as an audio id, so no
manifest can ever declare it, and `Sfx.apply` has no `stop` handling the way `Bgm.apply` does - so
`sfx: stop` is a line that provably cannot work and is silently inert today. Exempting it would make
the one spelling guaranteed to fail the one spelling that never warns. Whether `sfx` *should* learn
to stop a sound is a separate ticket that nobody has filed.

It gets the ordinary message - `No audio asset is declared as stop` - and no special case, which was
considered and declined. A bespoke wording would be the only id-specific branch in
`undeclaredMessage`, earned by one spelling; the generic message is true, and the manifest refusing
`stop` on the way to declaring it is a second signpost rather than a dead end.

### 3. The pass, in `src/core/commands/references.ts`

`(Command[], VnManifest) => [Command[], ParserError[]]`, called from `parseStory` after
`storyToCommands`. For each command, look up each of its references in the manifest; for each one
that misses, push a `ParserError` at `WARNING` carrying the command's `SourceLocation`, and replace
the command.

The sprite lookup is the awkward one - `actors[actor]?.sprites?.[id]`, a two-level optional walk that
must not be written anywhere a second time. Note that an undeclared *actor* on a `show` yields one
error, not two: there is no point reporting that an actor nobody declared declares no sprites.

Nothing in the pass is YAML, which is why it is in `core` rather than `yamlParser`.

### 4. `NoOp`

`class NoOp extends Command`, holding the command it replaced. `Command.apply` already returns the
state untouched and `State.advance` (`state.ts:181`) sets `stopAfterRender = false` before applying,
so a no-op needs no behaviour written for it - the story advances through it on its own, and
`advance`'s per-step resets of `sfx: null` and `shouldTransition: false` give the inert cases their
behaviour for free.

Carrying the replaced command costs nothing and makes a stack trace or a debugger session legible.

**`Say` is the exception**: it is not neutralized. The line is still said, in `default` styling with
the raw id as its name tag, and only the warning is added. See the ADR.

### 5. The player says something

`playerIndex.ts` stops discarding `parseStory`'s errors and `console.warn`s them, matching the
missing-file line immediately below it. Not `showLoadError` - that blanks the stage, and ADR 0002
says this story is worth showing.

### 6. Tests

- **`test/unit/`** - the pass. That the right warnings appear against the right lines, and that
  **the command list length is unchanged**. Index stability is the load-bearing property, because
  `VnPath` replay and every save are indices, and it is invisible from the DOM.
- **`test/browser/`** - the behaviour. A script with an undeclared `bg` leaves the previous
  background up, keeps playing, and does not throw. This is the regression net for the whole ticket:
  that exact script throws out of `DomRenderer.render` today.
- **Not `test/demo/`.** `CLAUDE.md` reserves it for tests needing a long stretch of story, and a
  broken reference in `test-assets/script.yaml` would ship a permanent warning in the demo.

## Not in scope

- **No export gate and no severity promotion.** Export stays gated on manifest parseability alone.
  The story behaves identically either side of a link, so there is nothing to promote against - and
  the precedent is already set: "a story that declares a file nobody has drawn yet still plays".
- **Making the renderers survive a *missing* asset.** Still open, still a separate change with its
  own blast radius. This ticket only guarantees no *undeclared* id reaches them.
- **`sfx: stop`.** Warns here; making it work is its own ticket.

## Why it is worth doing

It turns a crash several scenes from the typo into a message that names the id and the line, at the
moment the author can still fix it - and for actors, it turns a silent wrong colour into a message at
all. It is also the only enforcement the "manifest is the index" decision currently has: without it
the invariant is documented but not defended, and the first time it bites is on someone else's
machine after an import.

## See also

- `docs/adr/0004-an-undeclared-reference-neutralizes-its-command.md` - the decision, and the
  refuse-to-load and renderer-skips alternatives it beat
- `docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md` - which decides that this must not
  stop a story loading, and why
- `.scratch/asset-manifest/issues/02-manifest-yaml.md` - where this was split from
- `.scratch/manifest-editor/issues/01-manifest-in-the-editor.md` - the other half of the same
  problem, and the boundary between them: this ticket catches a script naming an id the manifest
  never declared, which a parser can see by reading both documents; that one catches a manifest
  naming a file that is not there, which only a failed load can reveal
- `design-docs/PROJECT_STORAGE.md` - "The manifest is the index"

## Comments

### 2026-08-29 - done, landed in [#38](https://github.com/a544jh/WebVn/pull/38)

Built as written; the six sections map one-to-one onto the diff. What is worth knowing beyond the
ticket:

- **The neutralization exception is a method, not an `instanceof` in the pass.**
  `Command.survivesUndeclaredReference()` returns false on the base class and true on `Say`, which
  keeps the pass free of per-command branches for the same reason the ticket keeps `#` and `stop`
  inside the commands that give them meaning. The ADR argues it as a general property - "a command
  does as much as it can without the id it could not resolve" - rather than as a special case for
  one class, so it is spelled as one.
- **`Bgm` grew a private `audioId()`.** `apply` and `references` both need the string-or-`.audio`
  unwrap, and writing it twice is how the id that plays and the id that is checked would come apart.
- **The undeclared-actor rule is in the pass, not in `show`.** A sprite reference is dropped when the
  same command's actor reference is itself undeclared, so a future command naming a sprite without
  its actor still reports.
- **Three things in the repo named ids nothing declared**, which is this invariant finding its first
  cases in our own tree. The demo itself is one: `test-assets/script.yaml:161` says a line as
  `Rando`, so the demo manifest now declares `Rando: {}` - an entry with nothing in it, which is all
  an actor with no styling needs and keeps the demo from shipping the permanent warning this ticket
  refused. `test/unit/YamlParser.test.ts` says a line as `A1` against `TEST_MANIFEST` while testing
  anchors, and now parses against a manifest declaring it. `test/browser/SpriteIds.test.ts` asserted
  the *old* behaviour outright - it waited for the renderer to throw `Actor Jenny declares no sprite
  named furious` - and is now the sprite half of the new one: reported at parse time, the showing
  sprite left alone, the story playing on.
- **`startVn` refuses a script with warnings**, so the harness gained `startVnWithErrors` for the two
  suites whose warnings are the point. The guard is worth keeping: it is what caught the two tests
  above.

Out of the review that followed: `default` became `DEFAULT_ACTOR_ID` in `core/state.ts` rather than a
third bare spelling, since it is reserved exactly the way `STOP_AUDIO_ID` is; and the `advance`
helper three browser suites each had a copy of moved into the harness as `advanceVn`. Declined:
folding `isDeclared`'s switch and `undeclaredMessage`'s into one per-kind table. They sit in two
layers on purpose - a renderer imports `core/manifest`, not `core/commands` - and a fifth kind fails
`tsc` in both (TS2366, verified), so the drift a table would prevent is already compiler-caught.

Not done, and still not in scope: the renderers surviving a *missing* asset, and `sfx: stop` learning
to stop a sound.

**2026-08-29, grilling session.** Twenty-one decisions; the ticket was rewritten around them and
renamed from `03-undeclared-assets-are-parse-errors.md`, since both halves of the old name had become
wrong. Status `needs-triage` -> `ready-for-agent`.

Two premises in the old body were stale and had been quietly steering it:

- It described an undeclared asset as "a cache miss at render time, not a refusal". The renderers
  have thrown since asset ids landed, so it was a crash, not a wrong frame. This was the argument
  that had been holding the severity question open, and it was arguing for the wrong side.
- It expected the manifest-editor work to give the player a surface that would make the third open
  question real. That surface exists, but `playerIndex.ts` still discards script errors, so nothing
  changed on its own.

The scope widened to actors. The old title said "asset", and `CONTEXT.md` defines an asset id as the
name a script calls an *asset* by - an actor is cast. Actors were brought in anyway, because the rule
is "the script names an id the manifest does not declare" and `actors` is one of the manifest's
declarations; leaving them out would have meant the one reference that still failed *silently* was
the one left failing silently.

Both terms were kept separate in `CONTEXT.md` rather than folded under an umbrella failure term, and
`Reference` was added as the neutral act - the thing a script does, of which the two are the failures.
That is what makes `Command.references()` a name the glossary backs rather than a coinage.

Three decisions changed during the session and are worth knowing were considered:

- **Severity went `ERROR` then back to `WARNING`.** The case for `ERROR` rested entirely on the
  crash; once neutralization removed the crash, so did the argument.
- **Reporting from inside a command handler was rejected on replay grounds**, not taste: a handler
  returns `Command | ParserError`, and `storyToCommands` only pushes on the `Command` branch, so
  reporting from there means dropping the command, shifting every later index, and invalidating every
  saved path.
- **Renderer-skips was rejected for putting one rule in two layers**, which is the drift `CLAUDE.md`
  warns about for `stop` and `#`.

`CONTEXT.md` gained `Reference` and `Undeclared actor`, and `Undeclared asset`'s "so a parser can
*refuse* it" became "report" - the parser no longer refuses anything.

Also struck: "pose", used twice in the old body against `CONTEXT.md:122`, which rejects the word
outright.
