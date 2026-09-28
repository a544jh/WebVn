# 04: Publishing a project

**Status:** ready-for-agent

**Blocked by:** 01 (The player plays the folder it is served from), because a published folder has
to play; and 02 (Importing from a URL), because the published-file list is 02's. Read the design
canvas's *Published folder* page before building the control.

## What to build

An author presses **Publish** in the editor and gets `<project-id>-published.zip`: a published
folder, ready to put on any static web host, where its
`index.html` plays the story. It holds the player, the manifest, the script and exactly the files
the manifest declares - nothing the author has lying around undeclared. Publish refuses while any
declared file is missing, and names every one. Importing that zip back with Import ZIP yields
exactly the project it was built from.

Spec: `.scratch/published-folder/spec.md`, "Publishing". ADR 0007 is the completeness rule.

- **In the editor's chrome, beside Export ZIP**, and not on the picker's rows: the editor already
  marks each missing file orange on the manifest line that declared it, so the refusal lands where
  the fix is. A fourth tool button, so it takes an icon - "icons on all three tools or none".
- **Gated as Export ZIP is**, through `gateOnManifest`: greyed while the manifest does not parse.
  Missing files are a refusal on click, not a greyed control.
- **The order:** flush the storer; read and parse the manifest, refusing as export does; check the
  script is present; check **every file on the published list is in the store**, refusing with all
  the missing ones named; fetch the player's files; build the zip - `README.txt`, then `index.html`
  and the player bundle, then the published files, with `storesWhole` unchanged; deliver it through
  the existing download anchor and open the hosting dialog.
- **Both outcomes are chrome dialogs**, `noticeDialog`s with one Close button, not the message line
  Export ZIP reports in:
  - **published** - the zip is on its way; put the files on any static web host, then open the
    folder's address; opening `index.html` from the disk does
    not work;
  - **refused** - every missing declared file listed by path, and the fix: add it in the asset
    panel, or remove its declaration.

  The picker's URL import keeps its orange banner; this is the editor only.
- **The host tells publish where the player's files are.** In production: `player.html`, written
  into the zip as `index.html`, and `playerIndex.js`, from the document's own directory. Suites hand
  it small stand-ins. The player's file names are written down once. **Copied byte for byte, never
  templated** - the title is the player's job (ticket 01).
- **Written by the module that already writes archives**, which stays the only one importing
  zip.js.
- **The README** follows the archive README's rules - no architecture, an instruction rather than a
  prohibition, the app URL hardcoded - and is **exactly this text**, beside `readmeText`:

  ```
  This is "<title>" (<id>),
  a visual novel made with WebVn.

  To play it, put everything in this zip on any static web host, keeping
  the folders as they are, and open the folder's address in a browser.
  It has to be served from a web host: opening index.html straight from
  your computer will not start it.

  To work on it, open <APP_URL> and import
  this zip file.

  WebVn is free and open source: <SOURCE_URL>

  Published <YYYY-MM-DD> by WebVn.
  ```

  `<title>`, `<id>` and the date come from the manifest and the day of publishing; `<APP_URL>` and
  `<SOURCE_URL>` are the archive README's constants. The spec's "Publishing" section says why each
  line is there.
- **Nothing is recorded in `editor.yaml`.** A published zip carries declared files only, so it is not
  the backup the picker's "never exported" line is about.
- **Zip import skips `index.html` and `playerIndex.js` at the archive root by exact path**, beside
  `README.txt`. The list only ever grows: a zip published by an older build still carries that
  build's player, so a name that leaves the publish side stays on the skip side.
- **Version skew is accepted.** A published zip carries the player the editor was deployed with.

## Acceptance criteria

- [ ] Browser suite, shaped like the export suite - build the zip and read it back with zip.js: the
      exact path set, player stand-ins included, with an undeclared project file absent.
- [ ] A missing declared file is refused in a dialog listing every missing file, and nothing is
      downloaded.
- [ ] A successful publish opens the hosting dialog, and closing it leaves the editor as it was.
- [ ] A manifest that does not parse greys the control, and is refused if reached.
- [ ] A sentence typed just before pressing Publish is in the zip - the flush.
- [ ] The round trip: the published zip through Import ZIP yields a project holding exactly
      the published files and no player files.
- [ ] Unit: `planImport` skips both player files at the root, and keeps an `index.html` below it.
- [ ] `editor.yaml`'s `exported` is unchanged by a publish.
- [ ] Unit: the published README is the text above, with the title, id and date filled in.
- [ ] By hand: a real build's Publish fetches the player; the zip, extracted onto a static server,
      plays.
- [ ] `CLAUDE.md`'s hand checks gain the player-file list: if the build ever splits the player into
      more chunks, the list must follow, and nothing automated would notice.
