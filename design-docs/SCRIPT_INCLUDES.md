# Script includes

Splitting a story across several YAML files with an `include` directive.

Status: design, nothing here is implemented yet. Written up so the reasoning survives; expect the details to
move as it gets built.

## `include` cannot be a command

It has to be resolved at parse time, before `Command[]` exists. Two independent constraints force this, and
both are load-bearing enough that no clever runtime variant survives them.

**`apply` is synchronous and must be pure.** `Command.apply(state)` returns a new state synchronously, and the
path-replay contract in `CLAUDE.md` requires commands to be deterministic - `VnPath` records user actions, not
snapshots, and replays them from `startingState`. Loading a file is asynchronous and, over OPFS or a network,
not guaranteed to return the same bytes twice. A command that loads something is a command that breaks replay.

**The engine indexes into a flat array.** `commandIndex` is the playhead, `labels: Record<string, number>` maps
names to positions in that array (`Label.ts`), `Jump.apply` assigns `commandIndex = state.labels[...]`,
`seenCommands` is an interval-encoded set of indices, and `VnPath` replays against all of it. Splicing commands
in mid-play invalidates five things at once.

The compensation for accepting that is large: **a flattened story is indistinguishable from a single file, so
the engine needs no changes at all.** Everything below happens in the parser, one type, and the editor.

## Syntax and scope

```yaml
story:
  - Some narration in the entry file.
  - include: chapters/ch1.yaml
  - include: chapters/ch2.yaml
```

An `include` item in a `story:` sequence is replaced by the `story:` items of the named file, in place.

It only ever splices story items. Actor definitions and asset lists live in `manifest.yaml` (see
[PROJECT_STORAGE.md](./PROJECT_STORAGE.md)), so a script include never has to merge declarations into the base
state - which is what keeps this feature small.

`include` is **not** a registered command and must not be one. `storyToCommands` tries its evaluators in order
and `registeredCommand` would report "include is not a recognized command" for an unregistered lowercase key,
so include items have to be expanded before the evaluator loop ever sees them.

## Flatten at the node level, never the text level

The obvious implementation - concatenate the included file's text into the parent's - is wrong. Line numbers
would be meaningless for the editor's gutter markers, and YAML anchors would silently start resolving across
files (see below), which is a behaviour we cannot then take back.

Instead, flatten the composed nodes. `storyToCommands(story, doc, lc)` currently takes one sequence, one
document and one line counter. It becomes a list of `{ item, doc, lineCounter, file }`, assembled by walking
includes. Both existing consumers need the per-item version:

- Alias resolution at `YamlParser.ts:80` calls `item.resolve(doc)`, which must be the document the alias was
  written in.
- `getLines` at `YamlParser.ts:158` reads positions out of a `LineCounter` that only knows one file's text.

Each file is composed exactly once, and every command carries the file it came from.

## `SourceLocation` gains a file

`Parser.ts:7` says `// TODO: handle multiple files and stuff at some point :)`. This is that.

```ts
export interface SourceLocation {
  file: string
  startLine: number
  endLine: number
}
```

The blast radius is smaller than it looks. Command handlers *receive* a location and pass it through to
`Command` and to any `ParserError` they construct, so `getLines` is the only place that builds one from
scratch. The consumers that need real work are all in the editor, listed further down.

## Resolution sits outside the parser

Loading files is asynchronous. `VnParser.updateState` is synchronous, and `core/` is deliberately free of
browser globals so it stays testable in the node vitest project. Making `updateState` async to accommodate
includes would push that async up through the editor, both entry points, and every test.

So put a resolver in front of it. A `SourceLoader` walks includes from the entry file and hands `updateState`
a bundle that is already complete:

```ts
interface SourceLoader {
  load(path: string): Promise<string>
}
```

`updateState` then takes the bundle plus an entry path and stays synchronous. Implementations: OPFS for the
editor, zip entries during a `.webvn.zip` import, and an in-memory map for tests. This is deliberately the
same shape as the `AssetResolver` in [PROJECT_STORAGE.md](./PROJECT_STORAGE.md), for the same reason - the
thing that varies is where bytes come from, and nothing else should have to know.

The resolver has to parse each file's YAML to find its includes, and `updateState` needs the same parse. Hand
the composed `Document` and `LineCounter` over with the text rather than parsing twice.

## Cycles, and why they are not the same as duplicates

A file that includes itself, directly or through a chain, must produce a `ParserError` naming the chain.
`ROUGH_EDGES.md` already documents three separate infinite-loop failure modes in this codebase, one of which
blocks the UI thread with `alert()`. Do not add a fourth.

The subtlety: **cycle detection tracks the current ancestor chain, not a global set of files already seen.**
A global seen-set would reject the legal double include described in the next section, because the second
appearance looks identical to a cycle. The distinction is that a cycle contains the file currently being
resolved; a duplicate does not.

## Labels, and what makes a double include legal

Including the same file twice is supported **as long as that file, and everything it transitively includes,
defines no labels.** A label-free file is a pure fragment, and splicing a fragment in several places is a
reasonable thing for an author to want - a recurring scene, a shared interstitial.

The pleasant part is that this rule needs no separate check. `updateLabels` already rejects duplicate labels,
and a labelled file included twice produces exactly that. The rule is what falls out of correct duplicate-label
handling, not an extra mechanism layered on top.

What does need building is the diagnosis. `updateLabels` currently throws a bare, uncaught
`Error("Label x already exists in story.")` (`Label.ts:33`). Two problems once includes exist:

- **It throws.** Today a duplicate label is one author's typo inside one file. With includes, two chapters both
  defining `start` is an ordinary mistake, and an uncaught throw out of the parser would take down the editor
  the same way the replay-loop throw described in `ROUGH_EDGES.md` does. `updateLabels` must return
  `ParserError`s carrying both source locations instead. This is a **prerequisite**, and it is worth doing on
  its own merits before any of the rest of this exists.
- **The message would be wrong.** If both colliding labels come from the same file at the same line, the
  author did not define a label twice - they included a labelled file twice. Detect that case and say so:
  name the file and the include sites, not the label.

The namespace stays flat and global. Per-file label scoping was considered and rejected: cross-file jumps are
the entire point of splitting a script, and scoping would require new syntax on every `jump` target to reach
out of the current file.

## YAML anchors do not cross files

Anchors and aliases are per-document by specification, and each included file is its own document. The obvious
author move - a shared `definitions.yaml` full of anchors, aliased from every chapter - fails with
"Unknown anchor". `src/demoStory.ts` opens with exactly such an anchor, so the pattern is already visible in
the one script every author sees first.

Nothing inside YAML fixes this. Making it work would mean a macro or template system, which is a different
feature with its own design. Document the limit so it arrives as a known constraint rather than a bug report.

## The editor is the bulk of the work

**Half of what this section prescribed landed 2026-08-29**, built for a different reason: manifest editing
needed a second buffer, and `.scratch/manifest-editor/` built it as the mechanism named below rather than as
a special case. `VnEditor` is now **one CodeMirror instance holding a `Doc` per buffer, swapped with
`swapDoc`**, with per-buffer undo history, cursor and dirty flag coming along for free; a crude tab bar over
it; markers cleared and written per buffer (`clearMarkers(buffer)`, `markErrors(buffer, errors)`); and the
indicator that a *different* buffer has errors, as a tab wearing the worst level marked in its own gutter
(`refreshTab`). Everything that means "the script" now says so by name - `parseDocument`, `goToLine`, the
position marker and the render callback take `scriptDoc`, never `getValue()` - which was the single largest
piece of this list.

`test/browser/VnEditor.test.ts` and the `startEditor` harness landed with it, so "nothing tests the editor" is
no longer true either, though the jump modes, the gutter markers and `loadScript` are still uncovered (TODO
item T).

What is left, and it is the part that is about *N* files rather than about two:

- `getScript()` returns the script buffer's text. Under includes the script is a tree, and `getScript` has to
  mean the *resolved* one - see "Export stays flat" below.
- The tab bar is two hardcoded buffers (`type BufferName = "script" | "manifest"`), enumerated in a
  `Record`. A file switcher over N files makes that dynamic. It was deliberately built crude so this is not a
  fight, but it is not free.
- `goToLine`'s `findIndex` (`editor.ts:330`) matches a command purely by line range, and the position marker
  (`editor.ts:351`) writes by absolute line number within one doc. Both need `SourceLocation` to carry a file,
  and both need to do nothing when the command's file is not the open one.
- "Clean" is still per buffer, and it means two different things by design: the manifest's dirtiness *gates*
  its adoption, while the script's cleanliness must never gate a reparse. Redefining clean as "all buffers
  clean" has to keep that distinction rather than flatten it.

## Export stays flat

`getScript()` returns the *resolved* script, so `?vn=` and `src/playerIndex.ts` are untouched by this feature.
The player never needs a loader, never resolves an include, and cannot encounter a broken include path. See the
note in [PROJECT_STORAGE.md](./PROJECT_STORAGE.md) on the URL payload becoming a two-document YAML stream once
the manifest is separate; includes add nothing further to it.

## Index churn

Editing an included file shifts the indices of every command after the splice point in the flattened story.
`seenCommands` is a set of those indices and `labels` maps to them, so both go stale in ways the author cannot
see - they edited chapter three and chapter seven's skip-mode history moved.

This is not new. The save id is hardcoded to `"test"`, so saves already survive script edits (see
`ROUGH_EDGES.md`), and single-file edits already shift indices. Includes make it routine rather than
occasional. Save paths are `[...decisions, remainingAdvances]` and replay by advancing, so they degrade more
gracefully than raw indices would. A note, not a blocker.

## Sequencing

After project storage. Includes resolve paths against a namespace, and `projects/<project-id>/` is that namespace;
building includes first means inventing a file abstraction that the storage work then replaces, and writing
`SourceLoader` twice.

The exception, worth doing now regardless of whether any of this is built: make `updateLabels` return
`ParserError`s instead of throwing. It is small, it removes an uncaught-throw path that exists in the code
today, and it is on the critical path for this feature.

## Open questions

- **Relative to the including file, or to the project root?** Relative-to-includer is what most languages do
  and survives moving a subtree; project-root is easier to reason about in a flat project. Undecided.
- **A depth limit on nesting**, independent of cycle detection, as a cheap guard against pathological trees.
- **Whether `manifest.yaml` gets its own include**, for shared asset packs across projects. Separate feature,
  separate merge semantics, deliberately out of scope here.
- **An optional label prefix on `include`**, as an escape hatch that would let a labelled file be included more
  than once. Adds syntax and a second way for jump targets to be spelled; only worth it if the label-free rule
  turns out to bite in practice.
- **How the editor surfaces the file tree** - tabs, a sidebar list, or a switcher tied to the include graph.
  UI question, best answered with something on screen.
