# 04: Publishing a project

**Status:** done

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

- [x] Browser suite, shaped like the export suite - build the zip and read it back with zip.js: the
      exact path set, player stand-ins included, with an undeclared project file absent.
- [x] A missing declared file is refused in a dialog listing every missing file, and nothing is
      downloaded.
- [x] A successful publish opens the hosting dialog, and closing it leaves the editor as it was.
- [x] A manifest that does not parse greys the control, and is refused if reached.
- [x] A sentence typed just before pressing Publish is in the zip - the flush.
- [x] The round trip: the published zip through Import ZIP yields a project holding exactly
      the published files and no player files.
- [x] Unit: `planImport` skips both player files at the root, and keeps an `index.html` below it.
- [x] `editor.yaml`'s `exported` is unchanged by a publish.
- [x] Unit: the published README is the text above, with the title, id and date filled in.
- [x] By hand: a real build's Publish fetches the player; the zip, extracted onto a static server,
      plays.
- [x] `CLAUDE.md`'s hand checks gain the player-file list: if the build ever splits the player into
      more chunks, the list must follow, and nothing automated would notice.

## Comments

**Landed 2026-09-28** on `claude/laughing-bell-erlp50`.

- `publishProject(directory, playerFolder)`, `publishedFilename` and `publishedReadmeText` are in
  `src/storage/archive.ts`, which is still the only module importing zip.js. Export's manifest gate
  became `gatedManifest`, shared by both. A missing declared file is a result of its own kind,
  `missing`, carrying every path in the manifest's order, because the editor shows it as a list.
- **The player's files are `PLAYER_FILES` in `src/publishedFolder.ts`** (`index.html` published from
  `player.html` served, and `playerIndex.js`), and zip import skips the same names at the archive root
  through `NOT_THE_PROJECT`, beside `README.txt`.
- **The button's logic is in a new `src/sessionTools.ts`**, because `src/index.ts` cannot be reached by
  a suite and the acceptance criteria are about the control. `gateOnManifest` and `face` moved there
  from the entry point, which imports them for its other three tools. `gateOnManifest` now also
  applies the current state at once, so a tool wired after the project opened starts right.
- **One refusal the ticket implies but does not word**: the player's own files not arriving. It is
  refused, after the store has been checked, as "the player's own files could not be fetched", so no
  zip that cannot play is ever written. `publishSession` also catches an unexpected throw into a
  "Not published ... see the console" dialog, as Export ZIP catches one into its message line.
- Suites fetch small stand-ins from `test/fixtures/player/`. Since vitest may transform what it
  serves, "byte for byte" is asserted against a fetch of the same address rather than the file on disk.
- Mutation-checked: publishing without the flush turns "carries the sentence typed a moment before" red.
- **Checked by hand 2026-09-28** against `npm run build`, with `dist/` served locally: the tool row
  reads Fullscreen, Copy player link, Export ZIP, Publish, with the globe drawn; Publish on the demo
  downloaded `webvn-demo-published.zip` holding `README.txt`, `index.html`, `playerIndex.js`, the two
  YAML files and the nine declared assets, and opened the "Published" dialog, after which the button
  was back to Publish and enabled. That zip, extracted and served by `python3 -m http.server`, played
  from the folder's own address: the tab read "WebVn Demo", every declared file was requested with a
  200, and a click reached the demo's first line.

**Also checked by hand by the maintainer, 2026-09-28**: Publish under `npm run dev`, and a published VN
served locally by `python -m http.server`.
