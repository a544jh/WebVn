# 02: Adding an asset

Status: done

Blocked by: 01 (the asset panel). The button is drawn in the panel's footer and there is nowhere to
put it until that exists.

## What to build

`Add asset` picks a file, asks what it is, copies it into `assets/`, writes the declaration into the
manifest buffer, and adopts it.

**Drawn on the canvas**, bottom row of the *Asset panel* page: `AddAsset` (a background - the common
path), `AddAssetSprite` (a sprite for an actor that does not exist yet, which is the dialog at its
tallest), and `AddAssetRefused` (an id already declared, marked on the field). The button itself is
on `AssetPanel`, and greyed on `AssetGated`. **Read the drawings before building** - the prose below
is the reasoning and the wiring, and it is not the layout.

## Why it is two writes and not one

**An undeclared file is invisible to the engine.** The manifest is a symbol table: the script names
an id, the manifest says which file it is, and `assetPaths.ts` turns the pair into a path. Copying
bytes into `assets/backgrounds/` and stopping would leave the author with a file no script can
reach and nothing on screen saying why.

So the button is: a file on disk, **and** a line in `manifest.yaml`. The second half is the one with
all the difficulty in it.

## The flow

1. **`<input type="file">`**, not `showOpenFilePicker()`. Same reasoning as the archive's
   `<a download>`: being the mechanism the platform offers everywhere is the whole justification.
   `showOpenFilePicker` is Chromium-only and this must work wherever the editor does.
2. **A dialog** (`src/chrome/dialog.ts`, `<dialog>` + `showModal()`) asking three things:
   - **what kind** - background, audio, or a sprite for an actor. Prefilled from the file's type:
     `audio/*` selects audio, `image/*` selects background. A guess, and the author can change it.
   - **which actor**, when the kind is sprite. The declared actors, plus a field for a new one.
   - **the id**, prefilled from the file's basename, and **the filename to store it under**,
     prefilled from the file's own name.
3. **Copy the file**, then **insert the declaration**, then **adopt**. In that order - see below.

## Why the file is written first

Adoption reparses the manifest and calls `loadAssets`. A declaration whose file is not on disk yet
is exactly the missing-file state ticket 01 paints orange - so declaring first would flash a warning
that corrects itself a moment later, training the author to ignore the one colour that means
something.

Writing the file first also fails cleanly: nothing is declared, the panel is unchanged, and the
author is told the copy failed.

## Two things it needs from `src/chrome/dialog.ts`

Drawing it is what made these visible, and both are changes to a file the picker also uses - so this
is shared machinery with two consumers rather than a local addition.

**`dialogField` only makes text inputs.** Kind and Actor are `<select>`s. The cheapest honest
version is a field variant that swaps the control and keeps everything else - the 12px muted label
above, the hint below, the problem treatment - because the whole point of that surface is that a
rule appears beside the field it is about, and a select field that lost the hint would lose it.

**The dialog grows.** Three fields for a background, five for a sprite whose actor is new. That is
already supported and the reason is already written down: `dialog.css` sets `margin: 140px auto
auto` and says why - *"Near the top rather than centred, which is where the drawings put it: a
dialog that grows a field does not then walk up the page."* Do not centre it.

## The id, and where its rules live

`parseManifest.ts` already holds every rule:

- an asset id is any non-empty string
- an audio id may not be `stop` (`STOP_AUDIO_ID` - it is how a script stops the music)
- a background id may not start with `#` (`isBackgroundColor` - that is a colour, not an asset)
- an **actor** id must be capitalized, except the engine's own `default` and `narrator` -
  `YamlParser` decides a `Name: "text"` line is a Say by testing the key's casing, so a lowercase
  actor is one no script can ever speak as

**Export a validator from `parseManifest.ts` rather than restating any of this**, the way
`validateProjectId` already does for the project id, and for the reason its comment gives: a second
copy of a rule is a rule that drifts. The dialog's `validate` shows the schema's own message beside
the field it belongs to, which is what that surface was built for.

Refuse a duplicate id within its group, with the same mechanism - `validate` keeps the dialog up
with what was typed still in it.

## The filename is the author's, not derived from the id

Tempting to store the file as `<id>.<ext>` and make collisions impossible. **Do not.**
`assetIdSchema`'s comment is explicit that *"nothing derives a filename or a directory name from
it, so the project id's filesystem charset does not transfer"* - an asset id is any non-empty
string, so deriving a filename from one would silently impose a charset the schema does not enforce,
and the first id with a `/` in it would write somewhere nobody asked for.

So the filename is a second field, prefilled from the picked file. If the target path already exists
the dialog refuses and says which file is in the way. That is `validate`'s job and it keeps the
whole decision in one surface.

Paths come from `src/domRenderer/assetPaths.ts` - `assets/backgrounds/`, `assets/audio/`,
`assets/sprites/<actor>/`. Do not re-spell any of them here.

## Inserting the line

**Textual insertion into the buffer. Never parse, mutate and re-`stringify`.** Round-tripping
through the parser eats comments - which is why the `?vn=` payload carries the raw manifest buffer
rather than a re-serialisation, and `test-assets/manifest.yaml` is itself a manifest with comments
in it that an author would lose.

`declarationLocations(text, keyPaths)` takes **key paths**, so it already locates
`["backgrounds"]`, `["actors", "Keeper", "sprites"]`, or an existing leaf. Use it to find the group,
then insert after its last child at the child's own indent. `indentUnit` is 2 and `mintedFiles`
writes 2, so 2 is the fallback when the group is empty.

When the group key does not exist at all - a project straight out of `mintProject` declares nothing
- append it at the end of the document at zero indent. An actor that does not exist yet needs its
entry and a `sprites:` map under it.

**Carry `editor.ts:320`'s guard across.** The rename revert already splices a line into this buffer
and already refuses to when the line holds more than the declaration: *"A flow-style manifest - the
whole document as `{formatVersion: 1, id: a, title: b}` on one line - locates its `id` to line 1,
and splicing line 1 away would take formatVersion and title with it. The locator answers 'which line
is this key on', which is not the same question as 'may I replace that line'."* The same is true
here, and the same answer applies: **refuse and say so, rather than mangle the document.** The
author is told the file was copied and the declaration has to be written by hand.

## Adopting, and the gate

After the insertion, drive the adoption directly. **Do not wait for blur** - the author did not type
this, so no blur is coming, and the panel would sit stale under a manifest that has changed.

The button is **disabled while the manifest does not parse**, through the existing
`gateOnManifest(session.editor, button, reason)` helper that Copy player link and Export ZIP already
use, with its own reason string. There is nowhere safe to insert a line into a document that does
not parse, and ADR 0002 says a manifest that does not validate has no identity at all. Greyed rather
than hidden, so the gate says what it is gating.

Nothing extra is needed for storing: the buffer change fires `onBufferChangeCallbacks` like a
keystroke, and `ProjectStoring`'s debounce picks it up.

## Tests

`test/browser/`, through `startEditor`:

- adding a background writes the file, adds the line under `backgrounds:`, and the panel draws it
- adding one to a manifest with no `backgrounds:` key appends the group
- adding a sprite to a new actor writes the actor entry and its `sprites:` map
- an id that duplicates one in its group is refused and the dialog stays up
- a lowercase actor id is refused, with the schema's own message
- a flow-style manifest is refused rather than spliced, and the document is byte-identical after
- the button is disabled while the manifest does not parse
- picking Sprite reveals the Actor field, and picking `New actor...` reveals Actor name

The file write itself wants a scratch OPFS directory named after the suite - `navigator.locks` is
origin-wide.

## Comments

**Landed 2026-09-18** (`2661289`). `src/yamlParser/manifestEdit.ts` is the splice,
`src/editor/addAssetDialog.ts` is the dialog, and `AssetPanel.add` is the wiring;
`test/unit/manifestEdit.test.ts` covers every case and refusal of the text edit and
`test/browser/AddAsset.test.ts` drives the dialog, including one test through the store-backed boot
that ships.

**The splice is its own pure module rather than a method on `VnEditor`.** The ticket describes the
mechanism without saying where it lives; putting it beside `declarationLocations` means the whole of
it is unit-testable in node, with no DOM, no CodeMirror and no store in the way.
`declarationLocations` gained a singular `declarationLocation` that answers null for a key the
manifest does not declare - the plural keeps its first-line fallback, because a gutter marker has to
land somewhere and a write has to know.

**`gateOnManifest` is not what gates the button, and that is a departure.** That helper pushes a
callback per button, which suits `src/index.ts`'s two page-chrome buttons and not a panel that
`replaceChildren`es its own root: the callback would point at a replaced element, accumulate one per
draw, and fight the busy state - an adoption *during* an Add would re-enable the button mid-job. The
panel implements the same rule as a field the draw reads, which is what the ticket asks for two
paragraphs earlier for the busy state, with the same reason string in the same `title`.

**`chrome/dialog.ts` grew a third thing beyond the two the ticket names.** `dialogSelect` and the
growing dialog were both expected; `DialogText` was not. The newer artboards write identifiers into
sentences and hints - `Stored as assets/backgrounds/keepers-grave.png`, `bg: keepers-grave` - and
`textContent` cannot carry a face change. The older dialogs still pass plain strings.

**A measured bug this ticket is what found**: a programmatic write to the buffer that is not on
screen reached the storer not at all. `Editor.on("change")` fires only for the attached doc, and a
manifest splice happens while the author is on the script tab - so the file was written, the line was
spliced, and neither was stored. `VnEditor.changeBuffer` now tells the callbacks directly; a
`Doc`-level listener does not close it, because CM5 signals a detached doc through `signalLater`,
which defers past the `loadingBuffer` guard and makes every boot's own read look like typing. The
rename revert goes through the same method, where it had been working by luck of which tab was up.

**The file-size line says KB rather than MB.** `megabytes()` would render the canvas's "412 KB" as
"0.4 MB"; the formatter is local to the dialog because it has one caller, unlike `megabytes`, whose
comment says every caller of it is a caller of `availableBytes`.
