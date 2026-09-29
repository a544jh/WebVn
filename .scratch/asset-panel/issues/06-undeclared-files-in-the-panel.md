# 06: Undeclared files in the panel

Status: needs-triage

Blocked by: nothing in code - 01 through 04 have landed. Blocked in practice by an artboard: the
canvas the spec links is binding for pixels, and none of its seven artboards draws a file the
manifest does not declare.

## What this is

Decided by the maintainer 2026-09-29, and deferred: **a file in the project that no declaration points
at shows up in the asset panel.** Today it appears nowhere.

**This reverses a spec decision.** `spec.md`'s point 1 - "It is a view of the MANIFEST, not of OPFS" -
chose the opposite on purpose, so that the only place an unanswered name is made visible is the
script (ADR 0004). This ticket keeps the manifest as the panel's spine and adds the files the manifest
does not answer beside it; it does not turn the panel into a folder browser.

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

- **The panel stays a view of the manifest first.** Declared ids keep their three groups and their
  rows exactly as they are; undeclared files are what is added.
- **The listing is already there.** `AssetFiles.list()` returns every file in the project by path, and
  the Add asset dialog already calls it. The undeclared set is that listing minus the paths
  `declaredAssets(state)` yields - one subtraction, beside `declarations.ts` rather than in
  `src/storage/`, which the panel reaches only through `AssetFiles`.
- **`assets/` is the layout, and it gives most files a home.** `assetPaths.ts` builds
  `assets/backgrounds/`, `assets/audio/` and `assets/sprites/<actor>/`, so a file under one of those
  has an obvious group - and a sprite under an actor the manifest does not cast has an obvious name.
- **Every write stays gated on the manifest parsing**, as the panel's other three are, for the reason
  the panel section of CLAUDE.md gives.

## Open questions

1. **Where the rows go.** In the group their folder names, beside the declared ids, or in a group of
   their own ("Not declared")? A file outside the three folders - `assets/notes.txt`, or anything at
   the project root besides the manifest and the script - needs an answer either way.
2. **What an undeclared row can do.** Preview works as it does now, through the resolver. The two that
   matter are **Declare** - the Add asset dialog, prefilled from the path and copying nothing - and
   **Delete**, the file alone, confirmed and irreversible as remove is. Declare would also answer the
   "already in this project" refusal: that dialog could offer to declare the existing file instead.
3. **How it looks**, which is the canvas's to decide. Orange already means a declared file that is
   missing; an undeclared file is the opposite state and must not be mistaken for it.
4. **When the listing is read.** `files.list()` is async and the panel's draw is not, so it is read
   before a draw: on every adoption, and after the panel's own add, remove and replace. Nothing else
   writes into an open project's folder - the project lock sees to that.
5. **What happens to ADR 0006.** Its decision - remove deletes the file too - still stands, but its
   first argument, "an undeclared file is invisible and permanent", stops being true. It wants an
   amendment when this lands, saying the decision now rests on the export argument alone.

## Acceptance criteria

- [ ] The canvas gains an artboard for a project with undeclared files, and the panel matches it.
- [ ] A file in the project that no declaration names appears in the panel, and one that is declared
      appears once, as the declared row it is today.
- [ ] Declaring one - by the panel's own control or by hand in `manifest.yaml` - turns it into the
      declared row, with nothing copied.
- [ ] Deleting one removes the file, after a confirmation, and nothing in the manifest.
- [ ] The rows follow the folder: an add, a remove, a replace and an adoption each leave the list
      matching what is on disk.
- [ ] `spec.md` point 1, CLAUDE.md's asset panel section and ADR 0006 say what the panel now shows.
- [ ] Browser suite, store-backed where the files matter, with directory names unique to the suite.
