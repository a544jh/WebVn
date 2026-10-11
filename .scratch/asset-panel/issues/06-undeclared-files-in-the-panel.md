# 06: Undeclared files in the panel

Status: done

Blocked by: nothing - 01 through 04 have landed, and the artboards are drawn. The canvas the spec links
is binding for pixels, and its **Asset panel** page now carries six boards for this ticket, below
the nine that were there: `AssetUndeclared` (the panel), `DeclareAsset` and `DeclareSprite` (the two
shapes of Declare), `DeclareMissing` (Declare's refusal naming the fix), `RemoveUndeclared` and
`AddAssetTaken`, with two notes beside them. Read them
before building; where they and this file disagree, the canvas is newer.

## What this is

Decided by the maintainer 2026-09-29, and deferred: **a file in the project that no declaration points
at shows up in the asset panel.** Today it appears nowhere.

**This reverses a spec decision.** `spec.md`'s point 1 - "It is a view of the MANIFEST, not of OPFS" -
chose the opposite on purpose, so that the only place an unanswered name is made visible is the
script (ADR 0004). This ticket keeps the manifest as the panel's spine and adds the files the manifest
does not answer beside it; it does not turn the panel into a folder browser. `CONTEXT.md` calls such a
file an **undeclared file**, which is not an _undeclared asset_ - that is a script naming an id, the
opposite direction.

## Why

An undeclared file is invisible and permanent, and it has four ways in:

- **Editing `manifest.yaml` by hand** - deleting or renaming a declaration leaves its file behind. The
  commonest by far.
- **Add asset that copies the file and then cannot write the declaration** - the "The declaration was
  not written" dialog, which says so and leaves the author to type the line.
- **Remove that takes the declaration and then cannot delete the file** - said only in the console.
- **Importing a `.webvn.zip`** that carries files its manifest does not declare. An archive may
  (ADR 0005); only a published folder may not (ADR 0007).

Once there, such a file:

- is shown nowhere, and nothing in the app can delete it;
- **blocks its own name**: the Add asset dialog refuses a filename that is already in the project -
  "assets/backgrounds/x.png is already in this project. Give this file another name." - naming a file
  the author has no way to see (`addAssetDialog.ts`, the `taken` set);
- rides into every Export ZIP, which walks the whole tree, though not into Publish, which copies
  declared files only.

The one way out today is to type a declaration for it by hand, after which its row appears.

## What is already decided

Grilled 2026-10-11, which settled every question this file used to leave open. Each one is answered
here with its reason, because the reasons are what the artboard and the code both have to follow.

### What counts

- **Everything under `assets/`, and nothing outside it.** `assetPaths.ts` builds every path the engine
  can ask for under `assets/`, so a file outside it is not an asset a declaration could ever name -
  everything above it is the project describing itself. The root is also where the storer writes,
  and Chromium's `createWritable` puts a `<name>.crswap` beside the file it is writing, enumerable
  while the write is open: a walk of the root on a blur, which is exactly when adoption fires and the
  storer flushes, could list one. CLAUDE.md rules out a `.crswap` filter, and scoping to `assets/`
  makes one unnecessary - nothing writes there but the panel, and the panel waits for its own writes.
- **The panel stays a view of the manifest first.** Declared ids keep their three groups and their
  rows exactly as they are; undeclared files are what is added.

### Where the rows go

- **In the group their folder names, wherever that is possible.** Decided by the maintainer over a
  recommendation for a group of their own: an undeclared file belongs beside the declarations it sits
  among on disk, which is also where an author renaming a `file:` by hand will see the orange missing
  row and the file it used to name next to each other.
  - `assets/backgrounds/...` goes under **Backgrounds**, `assets/audio/...` under **Audio**, and
    `assets/sprites/<actor>/...` under that actor in **Actors**. A nested path stays in its group -
    `backgrounds/old/cliffs.png` is a Backgrounds row - because a `file:` may carry a slash.
  - **A sprite folder for an actor the manifest does not declare gets a branch of its own** under
    Actors, after the declared actors, saying **not declared** - the same words as the rows, not "not
    cast". A lowercase folder (`sprites/ghost/`) gets one too; it just cannot be declared, below.
    `default` and `narrator` appear when they hold undeclared sprites, the way they appear today when
    they declare some.
  - **What has no group goes in a fifth, `Other files`**, drawn last and only when it has something
    in it: a file outside the three folders (`assets/notes.txt`, `assets/drafts/x.png`) or directly
    under `sprites/` with no actor folder. Its rows name their path relative to `assets/`.
- **Order inside a group**: the declared rows first, in the manifest's order, then the undeclared ones
  sorted by path. Interleaving by filename would cost the declared rows the order they have today.
  Not-declared actor branches likewise follow the declared actors, sorted.

### What a row is

- **Its file name relative to its group's folder, in the muted tone, with the words _not declared_.**
  It has no id to show. Said as well as styled, because a row that sits among declared rows and
  differs from them only by a shade is a row an author misreads - the precedent is the missing row's
  "file missing".
- **No status colour: not orange, no gutter marker, no tab colour.** Orange means "needs attention, the
  work still runs", and an undeclared file changes nothing about what plays. It is a list to tidy,
  not a problem - and it must never be mistaken for a missing asset, which is its opposite.
- **A group's count stays a count of declarations**, so it keeps meaning what the manifest declares,
  and a folded group says nothing about the undeclared files inside it.
- **"Nothing declared yet." shows only when nothing is declared _and_ `assets/` holds nothing.**
  Otherwise the groups are drawn, holding only undeclared rows - or a fresh import of an archive with
  a bare manifest would hide exactly what this ticket exists to show.

### What a row can do

Preview, Declare and Remove. **Never Replace**: new bytes under a path nothing reads change nothing.

- **Preview** as it is today, through the resolver, and not gated - it writes nothing.
- **Declare** is the Add asset dialog with **only the Id editable**. Kind, actor and file name are
  fixed by the path - `backgrounds/old/x.png` is a background with `file: old/x.png` - and nothing is
  copied: the declaration is spliced in through `declareAsset`, and so through `storeNow`, as Add
  asset's is. A sprite under a not-declared actor declares the actor too, as Add asset's "New
  actor..." already does. **Absent, not disabled, where it could never work** - in `Other files`, and
  under an actor folder whose name `validateActorId` refuses - the precedent being Preview, which a
  missing asset's row does not draw at all.
- **Declare's id refusal names the fix when the id belongs to a declaration whose file is missing.**
  That is the commonest way in, and the basename prefill lands on exactly that id: `file: storm.png`
  edited by hand to `storm-night.png` leaves `storm.png` undeclared, and Declare on it offers `storm`.
  A bare "A background with this id is already declared." would stop the author there, so it says
  the edit instead: "`storm` is already declared, and its file `storm-night.png` is missing. To use
  this file for it, change `storm-night.png` to `storm.png` in manifest.yaml." **Filenames rather than
  a line number**, because the filename is in the manifest whatever form the declaration takes - an
  audio entry's `file:` sits on a line of its own. An id declared with its file present keeps the
  plain refusal. Wording only: the panel already knows which declarations are missing.
- **Remove**, not "Delete": `CONTEXT.md` keeps _delete_ for a project. On an undeclared file there is
  no declaration to take out, so it is the file alone - confirmed, naming the path, irreversible. The
  glossary's _Remove_ entry widens when this lands, the way _Replace_ widened for **Add file**.
- **Both writes are gated on the manifest parsing** and run as the panel's jobs, so the busy state
  covers them like the other three.
- **Add asset's "already in this project" refusal stays a refusal** and, when the taken path is an
  undeclared file, says where it is: "`assets/backgrounds/x.png` is in this project but not declared.
  Declare it from its row under Backgrounds, or give this file another name." No new button in the
  dialog: "declare the existing one instead" would drop the bytes the author just picked without a
  word, and "overwrite and declare" is a replace smuggled into an add. The row's Declare is the way
  out.

### Where it is computed

- **`declaredGroups` does not change.** `design-docs/EDITOR.md`'s completions are meant to read it,
  and an undeclared file must never be offered as an id. A second pure function, beside
  `declarations.ts`, takes the listing and the state and returns the undeclared files already sorted
  into their groups; the panel is the only thing that merges the two. Pure, so a unit suite pins the
  grouping rules - every bullet under "Where the rows go" is a case.
- **The listing is `AssetFiles.list()`, filtered to `assets/`.** It already walks the project and Add
  asset already calls it; the subtraction is against the paths `declaredAssets(state)` yields.

### When the listing is read - and why it cannot go stale

**At mount, and after every one of the panel's jobs, whether it succeeded or failed.** Not on
adoption: an adoption changes the declarations and never the files, and the subtraction runs on every
draw against the current state, so declaring a file by hand moves its row on the next draw with no
walk at all. This narrows what this file used to propose, which was a walk per adoption.

That is enough because **nothing else can write under `assets/` while a project is open**, checked
2026-10-11: the storer writes only `manifest.yaml` and `script.yaml`; import, delete and the crash
sweep all need the project lock, which the session holds; and a rename closes the session before it
moves anything, so the panel it reopens lists afresh. The guarantee rests on the lock being the only
way in.

- **Every job lists again, success or failure**, so a write that died halfway still leaves the panel
  agreeing with the disk. The two half-done outcomes that today only a dialog or the console reports
  become rows: Add asset's "The declaration was not written", and remove's file that could not be
  deleted.
- **The newest listing wins.** A read started at mount that resolves after one a job started is
  dropped, with a generation counter of the shape `renderGeneration` and `ProjectPicker` already use.
- **During Remove, the row passes through _not declared_ for a moment, and that is accepted.** Remove
  lands the declaration first and the file second - ADR 0006's order, so the row never flashes the
  missing-file orange - and the adoption between the two redraws while the file is still on disk with
  nothing declaring it. That is the disk as it stands, not stale; the panel is saying "Removing…"
  with every control disabled; and hiding it would take a second record of what is about to be
  deleted, which could disagree with the listing.
- **The linked folder breaks the assumption.** Tranche 5 puts the project in a directory the author
  can change from outside the browser, and then a file can arrive that no job of the panel's wrote.
  When it lands, the panel needs a trigger for that, and this section is what it replaces.

### What else changes, and what does not

- **ADR 0006 is amended, not reopened.** Its first argument - an undeclared file is invisible and
  permanent - stops being true. Its decision, that removing an asset deletes the file, still rests on
  the export argument and on the `recoverProjects` precedent. A dated amendment says so. Remove's
  console-only report of a file it could not delete stays console-only, since the leftover is now a
  row.
- **Export does not change.** An export is the author's backup and carries everything, undeclared
  files included - `CONTEXT.md` already says so - while Publish already leaves them out.

### Deferred

- **Pointing a declaration at a file that is already there.** Grouping puts the commonest case side by
  side - `file: storm.png` edited by hand to `storm-night.png` leaves an orange missing row beside a
  _not declared_ one - and a control to repoint the first at the second would be a `file:` splice,
  which `manifestEdit.ts` does not have. **Nothing in the panel fixes this case**: Declare's prefill
  is the id already taken, and declaring under another id leaves the script naming the missing one.
  The fix is the hand edit, which is why Declare's refusal says exactly what it is (above). This file
  said until 2026-10-11 that Declare and Remove covered it in two steps; drawing the boards showed
  they do not.

## Acceptance criteria

- [x] The canvas gains an artboard for a project with undeclared files - a background beside the
      declared ones, a not-declared actor branch, and `Other files`.
- [x] The panel matches it.
- [x] A file under `assets/` that no declaration names appears in the group its folder names, after
      the declared rows, saying _not declared_; one that is declared appears once, as the declared row
      it is today. A file with no group appears under `Other files`. Nothing outside `assets/` appears.
- [x] Declaring one - by the row's Declare or by hand in `manifest.yaml` - turns it into the declared
      row, with nothing copied. Declare asks only for the id, and is absent where the path cannot be
      declared.
- [x] Removing one deletes the file, after a confirmation naming it, and touches nothing in the
      manifest.
- [x] The rows follow the folder: an add, a remove, a replace and a declare - succeeded or failed -
      each leave the list matching what is on disk.
- [x] Add asset's taken-name refusal names the undeclared file's row.
- [x] Declare's id refusal, for an id whose declaration is missing its file, names the edit that
      points it at this file; for an id whose file is present it is the plain refusal.
- [x] Group counts, the empty state and the collapsed headers say what they said before for a
      project with no undeclared files.
- [x] `spec.md` point 1, CLAUDE.md's asset panel section, `CONTEXT.md`'s _Remove_ and ADR 0006 say
      what the panel now shows.
- [x] A unit suite for the grouping function; a browser suite, store-backed where the files matter,
      with directory names unique to the suite.

## Comments

**Grilled 2026-10-11** on `claude/undeclared-files-in-the-panel`. The maintainer overrode two
recommendations: undeclared files go into their folder's group wherever possible rather than a group
of their own, and a not-declared actor's branch says _not declared_ rather than _not cast_. They
accepted the listing being read per job rather than per adoption on the condition that the panel can
never go stale, which is what the section on when the listing is read now argues. `CONTEXT.md` gained
_Undeclared file_ in the same commit, since the term was settled and the state already exists.

**Drawn 2026-10-11**, as version 35 of the canvas, on the same branch. Five artboards on the Asset
panel page, at y=5580 and y=6980, generated from the existing boards' own markup so every style is the
one already drawn:

- `AssetUndeclared` - the populated panel with `file: storm.png` edited to `storm-night.png`, so the
  orange missing row sits directly above the `storm.png` it used to name, hovered to show Preview,
  Declare and Remove. Also `old/cliffs-sketch.png` (a nested path stays in Backgrounds), a `Ghost`
  branch saying _not declared_ where a count goes, and `Other files` holding `notes.txt`.
- `DeclareAsset` and `DeclareSprite` - Add asset reduced to the Id field, with what the path fixes
  said in a sentence rather than offered as controls that could only be wrong; the sprite one adds a
  sentence saying it declares `Ghost` too.
- `RemoveUndeclared` - titled **Remove file**, naming the full project path, since the dialog has lost
  the group that made the row's short path unambiguous.
- `AddAssetTaken` - the taken-name refusal on the File name field, pointing at the row.

Two choices the drawing made that this file did not: an undeclared row's file name is `#666`, which is
5.7:1 on white and plainly a grey rather than a muted orange; and **Declare is Lucide `list-plus`** -
a line added to a list, which is what it does to the manifest - which `src/chrome/icons.ts` will need
to import. `Other files` carries no count, having no declarations to count. The board fits 17 rows
before the list scrolls, as its siblings do, so a sprite dropped straight into `sprites/` is described
in the note rather than drawn.

**Revised 2026-10-11**, canvas version 36. Drawing `AssetUndeclared` showed that Declare does not fix
the case it sits beside: on `storm.png` it prefills `storm`, which is declared. Put to the maintainer
as three options - leave it deferred, have the refusal name the fix, or build the repoint here - and
they chose the second. `DeclareMissing` draws it, beside `DeclareAsset` in the top row, whose note
moved out to the fourth column to make room.

**Built 2026-10-11** on `claude/undeclared-files-in-the-panel`, in 82a156b. `src/editor/undeclaredFiles.ts` is the
second walk and `test/unit/undeclaredFiles.test.ts` pins where each file goes; the panel merges it in
`assetPanel.ts`, and `test/browser/UndeclaredFiles.test.ts` covers the rows, Declare, Remove and the
listing, store-backed for the last three cases. Four things implementation settled that this file did
not:

- **`default` and `narrator` holding only undeclared sprites are drawn as the actors they are**, with a
  count of 0, not as _not declared_ - the engine declares them, and "the way they appear today when
  they declare some" is a declared branch.
- **Removing an undeclared file says so when the delete fails**, in a dialog, where a declared asset's
  remove only logs it. There the declaration is already out and the file is residue; here the delete
  is the whole operation.
- **A listing that fails keeps the last one** and logs, rather than drawing a project with no
  undeclared files, which would be a claim.
- **The store-less harness's listing now follows its writes** (`test/helpers/vnHarness.ts`), and
  `DialogRow.setProblem` takes identifiers like a hint does, so both refusals name their files in the
  chrome's monospace as the boards draw them.

Checked by mutation: without the re-list after each job, the two remove tests fail. The test of a
declared remove whose delete fails passes either way - the file was already in the listing - so it
covers the merge, not the re-list. The re-list sits in `work`'s `finally`, so every job gets it by
construction; the suite exercises it through remove, succeeded and failed, rather than once per job -
a failed add or declare is not reached by any test.
