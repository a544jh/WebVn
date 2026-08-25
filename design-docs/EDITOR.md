# Editor

Authoring affordances the script editor is missing - autocompletion, command documentation, list
continuation on Enter, find-in-file - and the CodeMirror migration underneath them.

Status: design, nothing here is implemented yet. Written up so the reasoning survives; expect the details to
move as it gets built.

## CodeMirror 5 is archived

`package.json` pins `codemirror: ^5.61.0` with `@types/codemirror: ^0.0.109`. The CodeMirror 5 repository was
archived in April 2026 and is read-only: no further releases, security fixes included, and the types are
frozen at a version that predates most of the 5.x surface we use.

So the migration to CodeMirror 6 is a question of when, not whether. It does not have to be today - the
editor works, and one of the four features below is worth doing on 5.x this afternoon - but nothing new
should be built on 5.x that would have to be built again.

## The four features, and which of them care

**Find in file.** CodeMirror 5 needs `addon/search/search.js`, `addon/search/searchcursor.js`,
`addon/dialog/dialog.js` and one stylesheet import; CodeMirror 6 needs `search()` and `searchKeymap`. Fifteen
minutes on either, no design decisions, and the 5.x version is throwaway work that costs nothing when it is
deleted. **Do this one now, on 5.x.** It should not wait behind a migration.

**List continuation on Enter.** A custom Enter binding next to the existing `betterTab` at `editor.ts:16`, via
`extraKeys` on 5.x or `keymap.of()` on 6. An hour on either. The one part that is not free is deciding *what*
to insert: a new item under `story:` wants `- `, a line inside a `bg:` mapping wants indentation and no dash,
and telling those apart is the same problem autocompletion has.

**Autocompletion.** Roughly equal effort on either library for a flat list of the thirteen registered command
keys - and a flat list is close to useless. What earns its place is context-sensitive:

| Cursor position | Should offer |
| --- | --- |
| item in `story:` | command keys, plus actor names for the `Name: "text"` Say shorthand |
| inside a `bg:` mapping | `image`, `transition`, `duration`, `pan` |
| a `transition:` value | registered transition names |
| a `jump:` value | label names from `state.labels` |
| an `image:` / `sprite:` / `audio:` value | asset names from the manifest |

CodeMirror 5 exposes a stream tokenizer and nothing else, so "which YAML context is the cursor in" becomes
indentation-and-regex heuristics. YAML is indentation-sensitive and has both block and flow forms, so those
heuristics are at their most fragile in exactly the nested positions the table above cares about.
`@codemirror/lang-yaml` is Lezer-based, so `syntaxTree(state).resolveInner(pos)` answers the question
directly.

**This is the only one of the four where the library choice changes the ceiling rather than the effort**, and
it is therefore the argument for migrating.

**Documentation popup.** `@codemirror/autocomplete` renders `Completion.info` beside the selected item, so on
6 this is a field on the completion object. On 5.x it is hand-rolled off `show-hint`'s select event. A real
difference, a modest one next to the syntax tree.

## The language already describes itself

Independent of which editor renders the menu, the completions should be *derived* rather than listed.

`registeredCommands` (`Parser.ts:37`) maps a command key to its handler, and `makeZodCmdHandler`
(`Parser.ts:70`) closes over a Zod schema that already knows the shape of every command's arguments. The
registry keeps the handler and discards the schema. Keep both, and one registration feeds three consumers:
parsing, the completion list, and the documentation popup - with `.describe()` carrying the doc text next to
the field it documents.

`Background.ts:30` already does this shape: `registeredSchemas` maps a transition name to its options schema,
and the `bg` command extends its own schema from the registry.

The payoff is that autocompletion cannot go stale. Adding a command already means writing a schema and adding
a side-effect import to `player.ts`; with the schema retained, the command appears in the menu with its
options and their descriptions and no second place to update. A hardcoded table of thirteen strings is wrong
the first time someone forgets it, and nothing will catch that.

**Do this regardless of the migration.** It is the difference between an autocompletion feature and
autocompletion infrastructure, and it is not coupled to the editor library at all.

The completion sources that are not schema-derived come from state the editor already holds or will hold:
actor names and asset lists from the manifest (see [PROJECT_STORAGE.md](./PROJECT_STORAGE.md)), label names
from `state.labels`.

## What the migration costs

Small in blast radius, larger in rewrite.

`src/editor/editor.ts` is 160 lines and the only consumer of the library. `src/editor/editor.css` is six
lines of gutter widths. `src/index.ts` imports `codemirror/lib/codemirror.css`. Three files.

But it is a rewrite rather than a port, because CodeMirror 6 has no editor object with methods on it - state
is immutable, changes are dispatched as transactions, and features are extensions:

| 5.x | 6 |
| --- | --- |
| `cm.getDoc().getValue()` | `view.state.doc.toString()` |
| `cm.getDoc().setValue(s)` | dispatch a change spanning the whole document |
| `cm.getDoc().setCursor(...)` | dispatch a `selection` |
| `cm.on("blur", ...)` | `EditorView.domEventHandlers` or an update listener |
| `isClean()` / `markClean()` | no equivalent; track it yourself |
| `setGutterMarker(line, ...)` | a `gutter()` extension, `GutterMarker` classes, and a `StateField` holding a `RangeSet` |
| `swapDoc` | hold an `EditorState` per file, `view.setState()` |

The gutter is the conceptual jump: the position and error markers currently write DOM into a named gutter by
absolute line number, and on 6 they become state that the gutter extension renders. On the upside,
`makeMarker`'s `document.querySelector(".CodeMirror-linenumber")?.clientHeight` hack (`editor.ts:147`, and
labelled a hack in the source) dies with it.

Estimate: a day or two for someone meeting CodeMirror 6's extension and `StateField` model for the first
time, landing somewhere around 250-300 lines.

**One cost worth naming up front:** the bundle would carry two YAML parsers - Lezer's grammar for
highlighting and completion, and the `yaml` library for the parse that actually produces commands. They serve
different purposes and can disagree at the edges about what is valid. Acceptable, but it should be a
deliberate choice rather than a surprise found later.

## It also pays into script includes

[SCRIPT_INCLUDES.md](./SCRIPT_INCLUDES.md) needs the editor to hold several files at once, and lists the
single-buffer assumptions that stand in the way. CodeMirror 6's model - one `EditorState` per file, swapped
with `view.setState()` - is a better fit for that than 5.x's `swapDoc`, and it brings per-file undo history
and cursor position along without extra work.

So: migrating before includes means building multi-buffer once. Migrating after means building it twice.

## Alternatives considered

- **Monaco.** Around 2MB, worker-based, and awkward to wire through the webpack config that `CLAUDE.md`
  already describes as fragile. Enormously more editor than YAML authoring needs.
- **Ace.** Same vintage as CodeMirror 5, with no advantage over it and the same eventual migration waiting.
- **Staying on 5.x.** Viable for the two cheap features, and the reason find-in-file should just be done
  there. Not viable for autocompletion, per the syntax tree argument above.

## Nothing tests the editor

The browser vitest project covers `DomRenderer` and the demo project covers whole-story playthroughs. No test
mounts `VnEditor`. Every change described here is verified by hand, which is the real reason the migration is
days rather than hours.

If a safety net is wanted before the rewrite, write it at the level of behaviour - editing this script
produces these parse errors and leaves the player in this state - rather than asserting on DOM structure.
Behavioural tests survive the migration; tests that assert on `.CodeMirror-*` classes are thrown away with
the library that produced them.

## Suggested order

1. **Find-in-file on 5.x.** Immediate, disposable, unblocked.
2. **Retain schemas in the command registry.** Independent of the editor, and the prerequisite for anything
   derived.
3. **Migrate to CodeMirror 6.** Before autocompletion, so it is written once.
4. **Autocompletion and the documentation popup**, generated from the registry.
5. **Enter handling**, which is easy once the syntax tree can say where the cursor is.
6. **Includes**, reusing the per-file `EditorState` model.

## Open questions

- **How much of the completion context needs the syntax tree at all.** Story-item position may be cheap enough
  to detect from indentation; the nested-mapping cases are the ones that are not. Worth prototyping before
  assuming the tree is required for everything.
- **Whether `.describe()` text is enough documentation**, or whether the popup wants prose and an example per
  command held somewhere separate from the schema.
- **Whether the demo script doubles as the completion fixture** - it exercises most commands, so it is a
  natural corpus to test completions against.
- **Whether error reporting moves inline** once CodeMirror 6 is in place. Diagnostics from `@codemirror/lint`
  would replace the gutter markers with squiggles and hover text, which is a better fit for `ParserError`
  than a coloured block in a gutter - but it is a separate change and should not ride along with the
  migration.
