# 02: Exporting a project

Status: ready-for-agent

Blocked by: 01 (importing an archive).

**This ticket does not merge on its own.** The design doc's one hard constraint here: *"An export
that nothing can read back is not a safety net, it is a file that looks like one. Defer zip import
freely; do not ship the export button ahead of it."* 01 and 02 land on the same branch.

## What to build

A project in the library becomes a `<project-id>.webvn.zip` on the author's disk, from the picker or
from inside the editor.

## The two gates

Export refuses a project whose **manifest does not parse** and one with **no `script.yaml`**.
Together with 01's refusals that is the format's invariant: an archive always holds a project that
parses and has a script. `docs/adr/0005-an-archive-holds-a-project-that-parses.md`.

On the picker, a project whose manifest does not parse shows its export control **disabled with the
reason** - it is already listed with a null id and a null title, deliberately, because it is an
author's project with a typo in it and the library is where they would go to fix it. In the editor,
the gate already exists: `editor.ts:107` tracks whether the manifest buffer last parsed and uses it
to grey out Export URL. Reuse that flag rather than adding a second one.

Those two gates cannot disagree, because export flushes the storer first (below), so the stored
manifest and the buffer are the same text by the time either is consulted.

The script-missing gate is unreachable from anything the app can currently produce. Keep it anyway:
it costs one `exists()`, and it is the half that stops a bad archive existing rather than the half
that catches one afterwards.

## What goes in

**A tree copy.** Everything under `projects/<directory>/`, unwrapped at the archive root, including
files the manifest does not declare - which is also what keeps export correct when
`design-docs/SCRIPT_INCLUDES.md` puts N script files into a project that no manifest mentions.
Export reads the manifest for the **filename only**.

`editor.yaml` is not in it: it sits beside `projects/`, not inside a project, and is the editor's
bookkeeping rather than project data.

**No wrapping `<project-id>/` directory.** The doc's reasoning: wrapping would put the id in three
places at once - the filename, the root directory name and the manifest - with no guarantee they
agree, and would demand a precedence rule for when they do not. The accepted costs are that `unzip`
at a terminal scatters, and that a GUI extraction yields a folder inheriting the double extension.

**Store mode for already-compressed media** - `.png .jpg .jpeg .webp .gif .mp3 .ogg .m4a .aac` at
`{ level: 0 }` - and deflate for everything else. Media is already compressed, so deflating it buys
close to nothing while making import slower than a straight copy; the two YAML files do compress.

**An archive carries no saves.** They live in localStorage under `vn-save-<id>`, not under
`projects/`. A round trip restores the project and not the playthrough. Stated here because the next
reader will otherwise wonder whether it was an oversight.

## `README.txt`

Generated at the archive root, and skipped on import by exact path - so a `README.txt` an author put
inside their own project still round-trips. This is the one place the archive is not exactly the
project tree.

**Its wording ships inside every archive already exported, so unlike a design doc it cannot be
corrected later.** That rules out describing architecture in it, and it is why it is written as an
instruction rather than a prohibition: "to work on this, open X and import this file" stays true if
the linked-folder layer ever lands, where "editing these files does nothing" would not.

```
This is a WebVn project: "Cat Adventure" (cat-adventure).

To work on it, open https://a544jh.github.io/webvn-demo/ and import
this zip file.

WebVn is free and open source: https://github.com/a544jh/WebVn

Exported 2026-09-06 by WebVn.
```

Title, id and date filled in per export. The URL is **hardcoded, not taken from `location`**: an
archive travels - it gets emailed, backed up, found in Downloads two years later - and the one thing
it must be able to tell a stranger is where the app lives, which `localhost:8080` cannot. The repo
link is there because the project is free software and an archive is the most likely thing to
outlive any given deployment of it.

## The filename

`<project-id>.webvn.zip`, from the manifest's id - which always exists, because the gate above
guarantees the manifest parsed.

**The extension really is `.zip`.** Every precedent (`.sb3`, `.love`, `.epub`, `.docx`, `.kra`)
belongs to an application that installs and registers a file-type handler, which this project has
ruled out - so nothing on the author's machine would ever claim `.webvnproj`, and its only
achievement would be a double-click that says "no app associated with this file". Ending in `.zip`
means any OS opens it with the built-in archive tool. A pleasant accident: Windows hides known
extensions by default, so the file *displays* as `my-story.webvn`.

The decision is reversible in any case, because 01 sniffs the magic bytes: this only picks the
default filename export suggests.

## Flush, then lock, then walk

**For the open project**: flush the storer and wait for it, then export. Two independent reasons.
The debounce is 2000ms, so an export taken straight after typing would otherwise ship an archive
missing the author's last sentence - the worst possible bug in a backup feature. And a walk has to
run over a tree nothing is writing into: Chromium's `createWritable` leaves an enumerable
`<name>.crswap` beside its target, which a concurrent walk either loses to `NotFoundError` or
**yields as if it were the author's file**. `opfs.ts`'s `walk` comment has the measurement; that was
the rename suite's one-in-eleven flake, and the rename already waits for its storer before sizing
for exactly this reason.

The call already exists and the rename already makes it: `session.storing.flush()`, which *"resolves
once every write the storer has queued has landed, pending or not"*. Do not reach for
`AppShell.settled()` by mistake - that is the view-swap queue and says nothing about the store.

**For another project, from the picker**: take its project lock for the duration, so a second tab
cannot be writing into it mid-walk. Refuse with the usual message if it is held.

Note the asymmetry: this session already holds `vn-project-<directory>` for the open project, and
`takeProjectLock` uses `ifAvailable`, so trying to take it again would refuse us against ourselves.
The open project is covered by the flush; another project is covered by the lock.

**Do not add a `.crswap` filter.** It would be a second rule for a hazard the flush and the lock
already close, and the only place in the codebase naming a Chromium implementation detail.

## Delivery

`<a download>` over an object URL, in every browser. The archive's entire justification in the doc
is that it is the mechanism the platform offers *everywhere* - *"not a preference for a single file,
but the only mechanism the platform offers in every browser"* - so making its happy path
Chromium-only would undercut what it exists for, and two delivery paths means the non-Chromium one
is the untested one.

`showSaveFilePicker()` is deliberately not used here. It would let zip.js stream entries straight
into the chosen file and let the author pick a location, but it is Chromium-only; it is the natural
growth when the linked-folder layer ships, being the same permission surface. Memory in the meantime
is bounded well enough in practice: Chromium spills large Blobs to disk, and a project that does not
fit in a Blob does not fit in OPFS either.

## The buttons, and one rename

**The icon is the arrow leaving the tray** - Lucide's `upload` glyph, the exact mirror of the one
ticket 01 puts on Import, which is what makes the pair read as a pair. It is not the browser
download the button performs: the arrow follows the project leaving the library. `src/chrome/icons.ts`
holds three icons today and both of these are added by these two tickets; if the vendoring pass
would rather take Lucide's own named `import`/`export` glyphs, take them **as a pair** - a box from
one set beside a tray from the other is the thing to avoid.

**On each picker row**, next to delete: an icon control, so any project can be exported without
being opened, and a project too broken to work in can still be got out.

**In the editor**, labelled **Export ZIP**, `#vn-btn-export-zip`, immediately to the right of the
player-link button in `src/index.html`'s row - the author spends their time there, and sending them
back to the front door for a backup is friction in the one gesture we most want them to make.
`AppShell` owns the session, so it is a line of wiring.

**One button style for the whole editor chrome, and this ticket is what establishes it.** Today
`#vn-btn-back` is the only one of these with any CSS at all: `#vn-btn-fullscreen` and
`#vn-btn-export-url` are styled by nothing and render as browser-default buttons - checked
2026-09-06, and the design canvas has been drawing them as chrome they never were. Lift
`#vn-btn-back`'s rule into a class in `chrome.css` and give it to all four: `inline-flex`, a 14px
icon, `gap: 7px`, `padding: 7px 11px`, `line-height: 1`, `#eee` on a `#ccc` hairline, `#fff` on
hover.

`line-height: 1` is the part that is about height rather than looks. Text at its default leading is
about 16px tall and a 14px icon is not, so an iconless button and an icon one sit at different
heights however alike their borders look - which is what the row does today.

**Icons on all three or none.** One icon among three is not one style, and dropping the export
arrow would break the pair it makes with the picker's control, so Fullscreen takes Lucide `maximize`
and the link button takes `link`. With the import/export arrows that is four new entries in
`src/chrome/icons.ts`, taking it from three vendored icons to seven - which is still "add path data
per ticket" rather than vendoring a set nobody calls.

"Export ZIP" names the format because it sits beside a button that also emits something - a link -
and "Export" alone would not say which. That does not soften `CONTEXT.md`'s reservation of *export*
for the archive: this is an export, and it is a zip.

**`#vn-btn-export-url` is renamed to "Copy player link".** `CONTEXT.md`'s **Payload** entry already
reserves *export* for the archive ("an export is the archive, which carries the assets too"), so the
chrome currently spends the word on the thing the glossary says it is not - and it will be spending
it beside a button that *is* the archive, which is what makes this a rename rather than a tidy-up.
Note it is **not** called "Share link": `CONTEXT.md`'s **Project link** entry has already spent that
phrase on its _Avoid_ list. `scriptUrl.ts` calls the thing `playerUrl`, so the button now says what
the code says. Rename the ids with it - `#vn-btn-copy-player-link` and its
`#vn-btn-export-url-message` span, which becomes `#vn-btn-copy-player-link-message` - in
`src/index.html` and `src/index.ts` (`wireExportUrl`, itself worth renaming). Those two files are the
only places either id appears - checked 2026-09-06, no test queries them - so the rename is four
lines and carries no risk of a stale selector.

## Two sentences this ticket makes false

Found while redrawing the design canvas against the shipped UI, 2026-09-06. Both dialogs currently
end on the same line:

> It cannot be recovered. There is no export yet, so nothing outside this browser has a copy.

`ProjectPicker.remove` says it about deleting a project, and `AppShell.confirmOverwrite` about
renaming onto one. The clause is load-bearing - it is *why* the warning is as strong as it is - and
this ticket is what makes it untrue. Rewrite both to name the archive instead: a project that was
exported does have a copy outside the browser, and the row now says when. Leave the "cannot be
recovered" half alone; that stays true of the copy in OPFS.

## Feedback

The control disables and reads "Exporting…"; the result goes to the picker's existing status line,
or the editor's message span. No progress bar - `spec.md` has the reasoning.

## Tests

**`test/unit/`** - the README's generated text, the store-mode extension list, and the filename.

**`test/browser/`** - the round trip: export a project, import it back through 01, assert the tree
is byte-identical; export refused on an unparseable manifest and on a missing script; the
export control disabled on a broken row; and **flush-before-export**, which is the one thing only a
live storer can demonstrate - type into the buffer, export inside the debounce window, assert the
archive holds the typed text.

Directory names for this suite are its own, per 01.

**Two things no test covers, named so they are known gaps rather than oversights.** The `<a
download>` itself: the tests assert the archive's *bytes*, because a headless browser will not show
you a file arriving in Downloads - so the anchor, its `download` attribute and the filename it
suggests are verified by hand, like `enterFullscreen` and `npm run dev` already are. And the bundle
split: `spec.md` claims zip.js lands in `app.js` and never in `playerIndex.js`, which holds only as
long as nothing in the player's import graph reaches `src/storage/archive.ts`. Nothing enforces it;
`npm run build` prints both bundles' sizes, so check them once when this lands and treat a jump in
`playerIndex.js` as the symptom.
