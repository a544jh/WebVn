import { AssetResolver } from "../assetLoaders/AssetResolver"
import { confirmDialog, identifier, noticeDialog } from "../chrome/dialog"
import { icon, IconName } from "../chrome/icons"
import { referenceCount } from "../core/commands/references"
import { DeclaredAsset, Reference } from "../core/manifest"
import { VnPlayer } from "../core/player"
import { AssetLocation, declaredFilePath } from "../domRenderer/assetPaths"
import { askForAsset, askToDeclare } from "./addAssetDialog"
import {
  actorBranches,
  branchCount,
  DeclaredBranch,
  DeclaredLeaf,
  declaredGroups,
  declaredLeaf,
  declaresActor,
  leafKey,
  nothingDeclared,
} from "./declarations"
import { VnEditor } from "./editor"
import {
  nothingUndeclared,
  UndeclaredFile,
  undeclaredFiles,
  UndeclaredFiles,
  UndeclaredSprites,
} from "./undeclaredFiles"
import "../chrome/chrome.css"
import "./assetPanel.css"

// The column to the right of the stage: everything `manifest.yaml` declares, and a button that adds
// to it.
//
// **A view of the manifest first** - see `declarations.ts`, which is the walk this draws. Three
// fixed groups, one level of nesting under an actor, ids as leaves. **And then the files nothing
// declares**, out of `undeclaredFiles.ts`, each in the group its folder names, after the declared
// rows. That reverses what the panel's spec first decided; `.scratch/asset-panel/issues/06` says why -
// an undeclared file used to be invisible, permanent, in every export, and blocking its own name in
// Add asset. The two walks stay separate modules and this is the only place they are merged, because
// the completions `design-docs/EDITOR.md` plans are meant to read the first and must never offer the
// second.
//
// In `src/editor/` rather than a directory of its own, and that is a judgment call worth recording:
// everything the panel touches is the editor's. It reads the manifest `VnEditor` adopted, it
// subscribes to that editor, and it writes into that editor's manifest buffer. `src/picker/` is the
// other view and this is not that; `src/chrome/` is what the editor and the picker *share* and this
// is not shared. The cost is that `src/editor/` stops meaning strictly "the CodeMirror editor" -
// `design-docs/EDITOR.md` is about that component and this is not part of it - and the alternative
// was a directory holding one file whose every dependency is next door.
//
// **Mounted by `src/editorBoot.ts`**, which is the session's composition root and already holds the
// player, the renderer, the editor and the storer. Not by `src/index.ts`: the entry point self-boots
// on import and looks its elements up by id, so nothing put there can be reached by a test.

// The project's own files, as the operations this panel needs on them.
//
// **Functions handed in rather than `src/storage/` imported**, which is what keeps the store out of
// `src/editor/` - the same division that has `VnEditor` *report* a rename and `AppShell` act on it.
// `editorBoot` is the composition root and is where the two meet, so it is also the one place that
// knows which directory these land in.
export interface AssetFiles {
  // Every file inside the project, by its path within it - `assets/backgrounds/a.png`. What the Add
  // asset dialog refuses a filename collision against, and what the undeclared rows are worked out
  // from.
  list(): Promise<Set<string>>
  write(path: string, data: Blob): Promise<void>
  remove(path: string): Promise<void>
}

export interface AssetPanelDeps {
  // Where the declarations come from: `seedState` copied them onto the state and `advance` never
  // writes them, so this is as authoritative as the manifest and is the thing already threaded
  // everywhere.
  readonly player: VnPlayer
  // What adopted that manifest, what knows whether the buffer parses, and - for the panel's three
  // writes - whose buffer the declaration is spliced into.
  readonly editor: VnEditor
  readonly files: AssetFiles
  // Where an asset's bytes come from, for preview - which opens a file in a browser tab and is this
  // interface's second consumer. Going through the loader instead does not work: `getAsset` hands
  // back a cloned element rather than a URL.
  readonly resolver: AssetResolver
}

// **Every write this panel does is gated on the manifest parsing.** While it does not parse the panel
// is showing the last manifest that *was* adopted, so a row may name a declaration the buffer no
// longer has: Add has nowhere safe to insert a line, remove would destroy the wrong file, and
// replace would overwrite a file the current manifest does not point at. One sentence a reader can
// hold, rather than two rules and an exception - and ADR 0002 says a manifest that does not validate
// has no identity at all. Preview writes nothing and is not gated.
const GATED = "manifest.yaml does not parse - there is nowhere safe to insert a declaration until it does"

export class AssetPanel {
  // Everything this view listens to, so `stop()` takes it all off at once. The callbacks it puts on
  // the editor die with the editor - both are rebuilt per session - but a listener on an element it
  // did not itself create would outlive the session, which is precisely the data-loss shape
  // `ProjectStoring`'s constructor comment documents. The panel owns its root and
  // `replaceChildren`es it on every draw, so everything else goes through here.
  private listeners = new AbortController()

  // One-way, like every other teardown here: a stopped panel draws nothing, whether the draw was
  // already queued or is asked for afterwards.
  private stopped = false

  // Which headers are folded away. Held here rather than read off the DOM because the draw replaces
  // the DOM: a collapse that lived in the markup would spring open on the next adoption.
  private collapsed = new Set<string>()

  // What the panel is doing that has to finish before anything else on it moves, or null when it is
  // idle. **A field the draw reads, not a poke at a live control** - the same shape `ProjectPicker`
  // arrived at, and for the same reason: a state written onto a button is a casualty of the next
  // draw.
  private working: string | null = null

  // Every file in the project as the last listing found it. The undeclared rows are worked out from
  // this on every draw, against whatever the state declares by then - so an adoption, which changes
  // the declarations and never the files, needs no listing of its own. Empty until the first one
  // lands, a moment after mount.
  private files: ReadonlySet<string> = new Set()

  // How many listings have been asked for, and which of them `files` came from. **A listing lands
  // only if it was asked for after the one on screen**: a read started at mount that resolves after
  // one a job started would otherwise put the older answer back - the race `renderGeneration` and
  // `ProjectPicker` guard the same way - while a newer read that failed must not stop an older one
  // that is still newer than what is shown.
  private asked = 0
  private shown = 0

  constructor(private root: HTMLElement, private deps: AssetPanelDeps) {
    // The one redraw signal: the editor has finished deciding what the project is described by.
    // Declarations do not change per frame, so this is deliberately not `renderer.onRenderCallbacks`
    // - the label list in `.scratch/label-list/` is the one that wants a per-render read.
    deps.editor.onManifestSettledCallbacks.push(() => this.draw())
    // The initial mount, from the state `editorBoot` loaded. The boot fills the buffers afterwards,
    // which fires the callback above with whatever the asset load reported.
    this.draw()
    // And again once the project's files are listed, which is when the undeclared rows can be drawn.
    void this.relist().then(() => this.draw())
  }

  public stop(): void {
    this.stopped = true
    this.listeners.abort()
    this.root.replaceChildren()
  }

  private draw(): void {
    if (this.stopped) return
    this.root.replaceChildren(this.panel())
  }

  // Read the project's files again. **At mount and after every one of the panel's own jobs, succeeded
  // or failed - and that is enough to never be stale**, because nothing else writes under `assets/`
  // while a project is open: the storer writes only the two buffers at the root, import, delete and
  // the crash sweep all need the project lock this session holds, and a rename closes the session
  // before it moves anything, so the panel it reopens lists afresh. `.scratch/asset-panel/issues/06`
  // has the argument. The linked folder of design-docs/PROJECT_STORAGE.md's tranche 5 is what would
  // break it - a file the author puts there from outside the browser is one no job of this panel's
  // wrote - and when that lands, this needs a trigger for it.
  private async relist(): Promise<void> {
    const asked = ++this.asked
    let files: Set<string>
    try {
      files = await this.deps.files.list()
    } catch (e) {
      // **Kept rather than cleared.** An empty listing would draw a project with no undeclared files,
      // which is a claim; the last listing is at worst out of date by one job, and says so here.
      console.error("The project's files could not be listed, so the panel shows the last listing", e)
      return
    }
    if (asked <= this.shown) return
    this.files = files
    this.shown = asked
  }

  private panel(): HTMLElement {
    const panel = element("div", "vn-asset-panel")
    const state = this.deps.player.state
    const missing = missingKeys(this.deps.editor.getMissingAssets())
    const groups = declaredGroups(state)
    const undeclared = undeclaredFiles(this.files, state)

    panel.appendChild(this.bar())
    panel.appendChild(this.list(groups, undeclared, missing))
    panel.appendChild(this.footer())
    return panel
  }

  // What this is, and - while the manifest buffer does not parse - which manifest it is describing.
  private bar(): HTMLElement {
    const bar = element("div", "vn-asset-panel-bar")
    bar.appendChild(text("span", "vn-asset-panel-caption", "Assets"))
    if (!this.deps.editor.isManifestValid()) {
      bar.appendChild(text("span", "vn-asset-panel-stale", "the last manifest that parsed"))
    }
    return bar
  }

  private list(groups: DeclaredBranch[], undeclared: UndeclaredFiles, missing: Set<string>): HTMLElement {
    const list = element("div", "vn-asset-list")
    // **Only when there is nothing at all.** A fresh import of an archive with a bare manifest still
    // has files to show, and saying "Nothing declared yet." over them would hide exactly those - which
    // is also why it waits for the first listing: before that, "nothing" is only what is not known
    // yet, and the message would flash over the files on every mount.
    if (nothingDeclared(groups) && nothingUndeclared(undeclared)) {
      if (this.shown > 0) list.appendChild(emptyState())
      return list
    }
    for (const branch of merged(groups, undeclared, missing)) this.drawBranch(list, branch, missing, 0)
    return list
  }

  // A group and everything under it, appended flat into the list: nesting is carried by the rows'
  // own indentation rather than by nested containers, which is what keeps a row a row. The declared
  // rows first, in the manifest's order, and then the undeclared ones, sorted by path.
  private drawBranch(list: HTMLElement, branch: DrawnBranch, missing: Set<string>, depth: number): void {
    list.appendChild(this.header(branch, depth))
    if (this.collapsed.has(branch.key)) return
    for (const leaf of branch.leaves) list.appendChild(this.row(leaf, missing))
    for (const file of branch.files) list.appendChild(this.undeclaredRow(file, depth > 0))
    for (const child of branch.branches) this.drawBranch(list, child, missing, depth + 1)
  }

  private header(branch: DrawnBranch, depth: number): HTMLElement {
    const folded = this.collapsed.has(branch.key)
    const header = element("button", "vn-asset-group")
    header.type = "button"
    if (depth > 0) header.classList.add("vn-asset-actor")
    // Orange when anything under it is, so folding a group away does not fold away the news.
    header.classList.toggle("vn-asset-missing", branch.missing)
    header.classList.toggle("vn-asset-undeclared", branch.tally.kind === "not declared")
    header.setAttribute("aria-expanded", String(!folded))
    header.dataset.vnAssetGroup = branch.key

    header.appendChild(icon(folded ? "chevron-right" : "chevron-down", 13))
    header.appendChild(text("span", "vn-asset-group-name", branch.name))
    if (branch.tally.kind === "count") {
      header.appendChild(text("span", "vn-asset-group-count", String(branch.tally.declarations)))
    } else if (branch.tally.kind === "not declared") {
      header.appendChild(text("span", "vn-asset-group-note", NOT_DECLARED))
    }
    header.addEventListener(
      "click",
      () => {
        if (folded) this.collapsed.delete(branch.key)
        else this.collapsed.add(branch.key)
        this.draw()
      },
      { signal: this.listeners.signal }
    )
    return header
  }

  // A file nothing declares. It has no id, so it leads with its name below its group's folder, in a
  // quieter grey, and **says** it is not declared: among declared rows a shade alone gets misread.
  // No orange - nothing about what plays has changed - and never mistakable for a missing asset,
  // which is its opposite.
  private undeclaredRow(file: UndeclaredFile, sprite: boolean): HTMLElement {
    const row = element("div", "vn-asset-row")
    row.classList.add("vn-asset-undeclared")
    if (sprite) row.classList.add("vn-asset-row-sprite")
    row.dataset.vnUndeclared = file.path

    row.appendChild(text("span", "vn-asset-name", file.name))
    row.appendChild(text("span", "vn-asset-undeclared-note", NOT_DECLARED))
    row.appendChild(this.undeclaredControls(file))
    return row
  }

  // Preview, Declare and Remove. **Never Replace**: new bytes under a path nothing reads change
  // nothing. **Declare is absent, not disabled, where it could never work** - in `Other files`, and
  // under a folder no actor could be called - for the reason a missing row has no preview.
  private undeclaredControls(file: UndeclaredFile): HTMLElement {
    const controls = element("div", "vn-asset-controls")
    controls.appendChild(
      this.control("vn-asset-preview", "eye", `Preview ${file.name}`, "Open this file in a new tab", () =>
        this.preview(file.path)
      )
    )
    const declares = file.declares
    if (declares !== null) {
      controls.appendChild(
        this.control("vn-asset-declare", "list-plus", `Declare ${file.name}`, "Declare this file", () =>
          this.declare(declares)
        )
      )
    }
    controls.appendChild(
      this.control("vn-asset-remove", "trash-2", `Remove ${file.name}`, "Remove this file", () => this.removeFile(file))
    )
    return controls
  }

  // One declared asset. **Not a button**: the row's actions are its controls, and inserting the id
  // at the cursor from here was considered and belongs with `design-docs/EDITOR.md`'s completions -
  // it is a *script* edit driven from a *manifest* view, and it has to decide what happens when the
  // cursor is somewhere the id is not legal.
  private row(leaf: DeclaredLeaf, missing: Set<string>): HTMLElement {
    const key = leafKey(leaf.manifestKey)
    const failed = missing.has(key)
    // **A load that failed is not a file that is missing**, and only the listing can tell them apart:
    // the loaders report a path that did not load, which is also an image declared as audio, a format
    // this browser cannot play, or a file that is corrupt. Saying "file missing" over a file that is
    // right there - and taking its Preview away, and offering to add it - lost the very file the
    // author had just added (reported 2026-10-12).
    const gone = failed && !this.files.has(leaf.path)

    const row = element("div", "vn-asset-row")
    if (leaf.kind === "sprite") row.classList.add("vn-asset-row-sprite")
    row.classList.toggle("vn-asset-missing", failed)
    row.dataset.vnAsset = key

    row.appendChild(text("span", "vn-asset-id", leaf.id))
    row.appendChild(text("span", "vn-asset-file", leaf.file))
    // Said as well as coloured: a filename is the one thing an author cannot check by reading the
    // two documents, so the row says what is wrong rather than only that something is.
    if (failed) row.appendChild(text("span", "vn-asset-note", gone ? "file missing" : "won't load"))
    row.appendChild(this.controls(leaf, gone))
    return row
  }

  // **On asset rows only** - a background, a track, an individual sprite. Not on an actor's row and
  // not on a group header: an actor is cast rather than an asset, removing one would take a whole
  // sprites directory with it, and the two lowercase actors are the engine's own, where removing the
  // declaration would drop styling and leave the actor exactly where it was. That is a control that
  // means something different on two kinds of row, so there is no control. docs/adr/0006.
  private controls(leaf: DeclaredLeaf, gone: boolean): HTMLElement {
    const controls = element("div", "vn-asset-controls")
    // **Absent, not disabled, on a missing asset**: `resolve` rejects because there is no file, and a
    // control that can never work on this row should not be drawn as one that is temporarily
    // unavailable. Which also makes the orange row the one an author can fix from here - its control
    // says Add file rather than Replace, and it is how they supply the file that was declared.
    if (!gone) {
      controls.appendChild(
        this.control("vn-asset-preview", "eye", `Preview ${leaf.id}`, "Open this file in a new tab", () =>
          this.preview(leaf.path)
        )
      )
    }
    controls.append(...this.replaceControl(leaf, gone))
    controls.appendChild(
      this.control("vn-asset-remove", "trash-2", `Remove ${leaf.id}`, "Remove this asset", () => this.remove(leaf))
    )
    return controls
  }

  // One hidden input per row, beside its own control rather than shared: which asset a pick is for is
  // then answered by construction rather than by a field the next draw would replace. The input is
  // the control's *sibling* for the reason the footer's is - a click on a child input bubbles back to
  // the button, whose handler clicks the input, which is a loop with no bottom.
  //
  // **On a missing asset it says Add file, with a plus**, because there is nothing to replace: the
  // declaration stands and its file does not. It is the same write either way - bytes to the path
  // the manifest names - so only the words and the icon change, and the class stays the one control.
  // Not "Add" alone, which the footer's Add asset has spent on declaring a new id.
  private replaceControl(leaf: DeclaredLeaf, gone: boolean): HTMLElement[] {
    const input = element("input", "vn-asset-file-input")
    // **Named apart from the footer's**, which is not tidiness: both are hidden file inputs in the
    // same root, and one class for the two made "the panel's file input" ambiguous the moment a row
    // had one - the first match in the document became a row's replace rather than Add asset.
    input.classList.add("vn-asset-replace-input")
    input.type = "file"
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0]
        input.value = ""
        if (file !== undefined) void this.replace(leaf, file, gone)
      },
      { signal: this.listeners.signal }
    )
    const click = () => Promise.resolve(input.click())
    const button = gone
      ? this.control("vn-asset-replace", "plus", `Add a file for ${leaf.id}`, "Add file", click)
      : this.control("vn-asset-replace", "replace", `Replace ${leaf.id}`, "Replace file", click)
    return [input, button]
  }

  // Giving an asset new bytes under the same id and the same filename. The declaration does not
  // change, so there is nothing to ask and the picked file's own name is ignored.
  //
  // **No confirmation, deliberately**, and it is the one write here that does not get one: replacing
  // art is the iteration loop - export, replace, look at the stage - and a dialog in the middle of it
  // is friction on the thing this panel exists to make fast. It cannot fire by accident either, since
  // it takes a row control *and* a file-picker round trip. Remove keeps its confirmation because it
  // changes what the project is; replace only changes what a thing looks like.
  private async replace(leaf: DeclaredLeaf, file: File, gone: boolean): Promise<void> {
    await this.work(gone ? "Adding\u2026" : "Replacing\u2026", async () => {
      try {
        await this.deps.files.write(leaf.path, file)
      } catch (e) {
        console.error("The asset could not be written into the project", e)
        await noticeDialog(gone ? "The file was not added" : "The asset was not replaced", [
          `${leaf.path} could not be written, so nothing changed.`,
        ])
        return
      }
      // Listed first, as Add asset's is: on a missing asset the file has just arrived, and new bytes
      // that will not load are "won't load" from the first draw rather than "file missing".
      await this.relist()
      // **And then the loaders are rebuilt**, which is the whole of this operation and is invisible
      // from the outside: `loadAsset` early-returns on a path it already holds, before it ever
      // consults the resolver, so new bytes under an unchanged path would otherwise change nothing on
      // screen.
      await this.deps.editor.reloadAssets({ rebuild: true })
    })
  }

  // The file itself, in a browser tab: a blob URL under OPFS, a relative path under the player's
  // resolver, and the browser's own image or audio viewer does the rest - no preview UI to build, and
  // it works for both kinds of asset. The URL stays valid indefinitely because `OpfsAssetResolver`
  // never revokes, which is an existing decision paying off sideways.
  //
  // Not gated: it writes nothing. A path rather than a row, because an undeclared file previews the
  // same way and has no declaration to be a row of.
  private async preview(path: string): Promise<void> {
    try {
      window.open(await this.deps.resolver.resolve(path), "_blank")
    } catch (e) {
      console.error(`${path} could not be opened`, e)
      await noticeDialog("The asset could not be opened", [`${path} is not in this project.`])
    }
  }

  // Declaring a file that is already in the project: Add asset with only the id left to ask, and
  // nothing to copy. The declaration is spliced in exactly as Add asset's is, through `storeNow`, so
  // it is on disk at once rather than after the debounce.
  private async declare(declares: AssetLocation): Promise<void> {
    const state = this.deps.player.state
    const missing = missingKeys(this.deps.editor.getMissingAssets())
    const declaration = await askToDeclare(declares, {
      actorDeclared: declares.kind !== "sprite" || declaresActor(state, declares.actor),
      held: (asked) => {
        const leaf = declaredLeaf(state, asked)
        // Missing as the row says it, since the refusal tells the author so: a file that is there and
        // will not load is not missing, and the row's Replace is the way to give it new bytes.
        return leaf === undefined
          ? null
          : { file: leaf.file, missing: missing.has(leafKey(leaf.manifestKey)) && !this.files.has(leaf.path) }
      },
    })
    if (declaration === null) return

    await this.work("Declaring\u2026", async () => {
      const refused = await this.deps.editor.declareAsset(declaration)
      if (refused !== null) await noticeDialog("The asset was not declared", [refused])
    })
  }

  // Removing a file nothing declares: the file alone, since there is no declaration to take out.
  // Confirmed and irreversible, as remove always is - and still **remove**, because CONTEXT.md keeps
  // _delete_ for a project.
  private async removeFile(file: UndeclaredFile): Promise<void> {
    if (!(await confirmFileRemoval(file))) return

    await this.work("Removing\u2026", async () => {
      try {
        await this.deps.files.remove(file.path)
      } catch (e) {
        // Unlike a declared asset's remove, where the declaration is already out and the file is
        // residue, this is the whole of the operation failing - so it is said, not only logged.
        console.error(`${file.path} could not be deleted`, e)
        await noticeDialog("The file was not removed", [`${file.path} could not be deleted, so it is still here.`])
      }
    })
  }

  // An icon with no text, so the label a screen reader looks for goes on the control - the same
  // shape `ProjectPicker.control` already has, at the same 15px.
  //
  // Disabled while the manifest does not parse, and while one of the panel's own jobs is in flight.
  private control(
    className: string,
    name: IconName,
    label: string,
    saying: string,
    onClick: () => Promise<void>
  ): HTMLButtonElement {
    const button = element("button", "vn-asset-control")
    button.classList.add(className)
    button.type = "button"
    button.setAttribute("aria-label", label)
    button.appendChild(icon(name, 15))
    // **Preview is the exception, and it is not one to the gate**: it writes nothing, so the gate has
    // nothing to say about it. The busy state still does - a job in flight disables every control on
    // the panel, the way `ProjectPicker` does.
    const gated = name !== "eye" && !this.deps.editor.isManifestValid()
    button.disabled = gated || this.working !== null
    button.title = gated ? GATED : saying
    button.addEventListener("click", () => void onClick(), { signal: this.listeners.signal })
    return button
  }

  // Taking an asset out of the project: its declaration out of manifest.yaml and its file off disk,
  // both. Confirmed and irreversible - docs/adr/0006 is the decision and says why the file goes too.
  //
  // **It warns and proceeds; it never refuses.** A script still naming the id is neutralized at its
  // index rather than broken, so removal destroys bytes and not story - which is what makes one
  // confirmation enough.
  private async remove(leaf: DeclaredLeaf): Promise<void> {
    const named = referenceCount(this.deps.player.state.commands, referenceTo(leaf))
    if (!(await confirmRemoval(leaf, named))) return

    await this.work("Removing\u2026", async () => {
      // **The declaration first**, which is the reverse of adding. Adding writes the file first so
      // the adopt does not flash a missing-file warning; removing has the opposite hazard - a file
      // deleted while its declaration still stands *is* that warning - so this lands first and the
      // adopt afterwards never sees the gap.
      const refused = await this.deps.editor.undeclareAsset(leaf.manifestKey)
      if (refused !== null) {
        // **"Nothing was deleted." is kept on purpose** (2026-09-29), unlike the archive's "Nothing was
        // written.": the author has just confirmed an irreversible delete, and a remove has two halves,
        // so the title alone does not say whether the file survived.
        await noticeDialog("The asset was not removed", [refused, "Nothing was deleted."])
        return
      }
      try {
        await this.deps.files.remove(leaf.path)
      } catch (e) {
        // The asset is out of the project and a stray file is left. Said in the console and left
        // there: the author's project is in the state they asked for, and sweeping the residue is
        // somebody else's ticket.
        console.error(`${leaf.path} could not be deleted, so a file the project no longer declares is left behind`, e)
      }
    })
  }

  // The panel's one action, and the platform's own file control behind it. The input is the button's
  // *sibling* rather than its child, which is not a layout preference: a click on a child input
  // bubbles back to the button, whose handler clicks the input, which is a loop with no bottom.
  //
  // `<input type="file">` and not `showOpenFilePicker()`, for the reason the archive's `<a download>`
  // gives: being the mechanism the platform offers everywhere is the whole justification, and
  // `showOpenFilePicker` is Chromium-only while the editor is not.
  private footer(): HTMLElement {
    const footer = element("div", "vn-asset-panel-footer")

    const input = element("input", "vn-asset-file-input")
    input.classList.add("vn-asset-add-input")
    input.type = "file"
    input.addEventListener(
      "change",
      () => {
        const file = input.files?.[0]
        // Cleared so picking the same file twice in a row still fires a change.
        input.value = ""
        if (file !== undefined) void this.add(file)
      },
      { signal: this.listeners.signal }
    )

    const add = element("button", "vn-asset-add")
    add.type = "button"
    add.appendChild(icon("plus", 16))
    add.appendChild(document.createTextNode(this.working ?? "Add asset"))
    // Greyed rather than hidden, so the gate says what it is gating.
    add.disabled = this.working !== null || !this.deps.editor.isManifestValid()
    if (!this.deps.editor.isManifestValid()) add.title = GATED
    add.addEventListener("click", () => input.click(), { signal: this.listeners.signal })

    footer.append(input, add)
    return footer
  }

  // `Add asset`: a file on disk, **and** a line in manifest.yaml. The second half is the one with all
  // the difficulty in it - an undeclared file is invisible to the engine, so copying bytes in and
  // stopping would leave the author with a file no script can reach and nothing on screen saying why.
  private async add(file: File): Promise<void> {
    const state = this.deps.player.state
    // Asked afresh rather than read off the last listing, which is the one thing this dialog must not
    // be wrong about: a name it lets through is a file it overwrites.
    const taken = await this.deps.files.list()
    const declaration = await askForAsset(file, {
      // The manifest's own order, and the same walk the list is drawn from - so the actors offered
      // here cannot come to disagree with the actors shown above.
      actors: actorBranches(state).map((branch) => branch.name),
      isDeclared: (asked) => declaredLeaf(state, asked) !== undefined,
      taken,
      // Named off the tree the panel draws, so the refusal names the group the author can see.
      undeclared: rowGroups(merged(declaredGroups(state), undeclaredFiles(taken, state), new Set())),
    })
    if (declaration === null) return

    // **Asked before anything is written.** The manifest buffer may be one no declaration can be
    // spliced into - flow style, or a group whose value shares its line - and a copy whose
    // declaration was never going to land is a file nothing in the project points at.
    const cannot = this.deps.editor.canDeclareAsset(declaration)
    if (cannot !== null) {
      // "Nothing was copied" is kept on purpose, as remove's is: an add has a half-done outcome with a
      // dialog of its own below, and this line is what tells the two apart.
      await noticeDialog("The asset was not added", [cannot, "Nothing was copied into the project."])
      return
    }

    await this.work("Adding\u2026", async () => {
      // **The file first.** Adoption reparses the manifest and reloads the assets, so a declaration
      // whose file is not on disk yet is exactly the missing-file state this panel paints orange -
      // and declaring first would flash a warning that corrects itself a moment later, training the
      // author to ignore the one colour that means something. It also fails cleanly this way round:
      // nothing is declared, the panel is unchanged, and the author is told the copy failed.
      try {
        await this.deps.files.write(declaredFilePath(declaration), file)
      } catch (e) {
        console.error("The asset could not be written into the project", e)
        await noticeDialog("The asset was not added", [
          `${file.name} could not be written into this project, so nothing was declared.`,
        ])
        return
      }
      // **Listed before it is declared**, so the draw the adoption causes knows the file is there: a
      // file that will not load would otherwise read "file missing" until the job's own listing.
      await this.relist()
      const refused = await this.deps.editor.declareAsset(declaration)
      if (refused === null) return
      // Reachable only when the buffer changed while the file was being written, since the same
      // question was asked before the copy. The bytes are in and the declaration is not, which is
      // the one outcome that needs saying: the author has a file the engine cannot see, and the way
      // out is to type the line themselves.
      await noticeDialog("The declaration was not written", [
        refused,
        `${file.name} was copied into this project, so declaring it by hand in manifest.yaml is all that is left.`,
      ])
    })
  }

  // Everything the panel does that writes. It shows what is happening, runs the job, and draws
  // whatever it left behind. A second gesture while one is in flight is ignored rather than queued -
  // every control on the panel is already disabled, so the only way to arrive here twice is a race.
  private async work(saying: string, job: () => Promise<void>): Promise<void> {
    // **A stopped panel starts nothing.** A dialog is modal but a `popstate` is not, so the author
    // can navigate away while a confirmation is up - and a write begun after `close()` has released
    // the project lock and torn the renderer down is a write into a session that is gone. Running
    // these in `AppShell.queue` the way the picker's jobs do is the complete answer and is a bigger
    // change than this panel: the queue would have to reach a session's panel, and a job must never
    // queue from inside a turn.
    if (this.stopped || this.working !== null) return
    this.working = saying
    this.draw()
    try {
      await job()
    } finally {
      // **Whatever the job did or failed to do on disk, the rows follow it**, so a write that died
      // halfway still leaves the panel agreeing with the folder - a file copied in whose declaration
      // was refused, or one that could not be deleted, is a row from here on.
      await this.relist()
      this.working = null
      this.draw()
    }
  }
}

// What a row's asset is, as the thing a script would name. The one place a leaf becomes a reference,
// so what the confirmation counts is what `checkReferences` would look for.
const referenceTo = (leaf: DeclaredLeaf): Reference =>
  leaf.kind === "sprite" ? { kind: "sprite", actor: leaf.actor, id: leaf.id } : { kind: leaf.kind, id: leaf.id }

// **Names three things: the id, the file it is about to delete, and how much of the script names the
// id.** The file is named because the id and the filename are different things and the author picked
// the row by id - `cliffs` and `cliffs-final-v3.png` are the same row, and only one of them is about
// to be destroyed.
//
// `confirmDestroyingProject`'s shape but not its wording: a project's dialog says the work cannot be
// recovered, and an asset's should not borrow that weight when re-declaring the id brings back
// everything the script had. The bytes are gone either way; the story is not.
const confirmRemoval = (leaf: DeclaredLeaf, named: number): Promise<boolean> =>
  confirmDialog(
    "Remove asset",
    [
      ["Remove ", identifier(leaf.id), " from this project? Its file ", identifier(leaf.file), " is deleted."],
      named === 0
        ? [identifier(leaf.id), " is not named anywhere in ", identifier("script.yaml"), "."]
        : [
            identifier(leaf.id),
            ` is named on ${named} ${named === 1 ? "line" : "lines"} in `,
            identifier("script.yaml"),
            ". They will stop drawing anything until you declare it again.",
          ],
    ],
    "Remove"
  )

// What a header or an undeclared row says in the place a count or a filename goes.
const NOT_DECLARED = "not declared"

// What a header says at its right, and why. **A count of declarations only**, so it keeps meaning what
// the manifest declares and a folded group says nothing about the undeclared files inside it; an actor
// nobody declared has no declarations to count and says so instead; `Other files` holds no
// declarations at all and says nothing.
type Tally = { readonly kind: "count"; readonly declarations: number } | { readonly kind: "not declared" | "none" }

// A group, an actor or `Other files`, as the panel draws it: the declared rows and then the files no
// declaration points at. Built fresh per draw by `merged`.
interface DrawnBranch {
  readonly name: string
  // The collapse state and a test's handle: the manifest key path, joined, as `declarations.ts` builds
  // it - so an actor's branch keeps its key, and its fold, when it goes from not declared to declared.
  readonly key: string
  readonly tally: Tally
  readonly missing: boolean
  readonly leaves: DeclaredLeaf[]
  readonly files: UndeclaredFile[]
  readonly branches: DrawnBranch[]
}

// The two walks put side by side - the only place they are. Each undeclared file goes in the group its
// folder names; what no group answers goes in `Other files`, drawn last and only when it has
// something in it.
const merged = (groups: DeclaredBranch[], undeclared: UndeclaredFiles, missing: Set<string>): DrawnBranch[] => {
  const drawn = groups.map((group) =>
    group.key === "backgrounds"
      ? declaredBranch(group, missing, undeclared.backgrounds, [])
      : group.key === "audioAssets"
      ? declaredBranch(group, missing, undeclared.audio, [])
      : declaredBranch(group, missing, [], actorsWith(group.branches, undeclared.sprites, missing))
  )
  if (undeclared.other.length > 0) {
    drawn.push({
      name: "Other files",
      key: "other",
      tally: { kind: "none" },
      missing: false,
      leaves: [],
      files: undeclared.other,
      branches: [],
    })
  }
  return drawn
}

const declaredBranch = (
  branch: DeclaredBranch,
  missing: Set<string>,
  files: UndeclaredFile[],
  branches: DrawnBranch[]
): DrawnBranch => ({
  name: branch.name,
  key: branch.key,
  tally: { kind: "count", declarations: branchCount(branch) },
  missing: branchMissing(branch, missing),
  leaves: branch.leaves,
  files,
  branches,
})

// The cast with their undeclared sprites under them, then a branch for every other folder that holds
// one, sorted. **A folder whose actor the manifest does not declare says so where the count goes** -
// `default` and `narrator` included, by `declaresActor`'s one rule: the engine has them either way, but
// the manifest declares them only by declaring a sprite, and Declare on such a folder adds the actor
// to the manifest just as it would `Ghost`.
const actorsWith = (declared: DeclaredBranch[], folders: UndeclaredSprites[], missing: Set<string>): DrawnBranch[] => {
  const drawn = declared.map((branch) =>
    declaredBranch(branch, missing, folders.find((folder) => folder.actor === branch.name)?.files ?? [], [])
  )
  for (const folder of folders) {
    if (declared.some((branch) => branch.name === folder.actor)) continue
    drawn.push({
      name: folder.actor,
      key: leafKey(["actors", folder.actor]),
      tally: { kind: "not declared" },
      missing: false,
      leaves: [],
      files: folder.files,
      branches: [],
    })
  }
  return drawn
}

// Where each undeclared file's row is, by the name of what it sits under - read off the tree the panel
// draws rather than named a second time, so Add asset's taken-name refusal points at a group the
// author can see.
const rowGroups = (branches: DrawnBranch[]): Map<string, string> => {
  const groups = new Map<string, string>()
  const visit = (branch: DrawnBranch): void => {
    for (const file of branch.files) groups.set(file.path, branch.name)
    branch.branches.forEach(visit)
  }
  branches.forEach(visit)
  return groups
}

// Which declarations the last asset load could not find, by the key the manifest declares them
// under. **The key rather than the path**, because two ids may name one file and only one of them is
// the row that has to go orange - and it is exactly why `loadAssets` reports keys at all.
const missingKeys = (failed: DeclaredAsset[]): Set<string> => new Set(failed.map((asset) => leafKey(asset.manifestKey)))

const branchMissing = (branch: DeclaredBranch, missing: Set<string>): boolean =>
  branch.leaves.some((leaf) => missing.has(leafKey(leaf.manifestKey))) ||
  branch.branches.some((child) => branchMissing(child, missing))

// The file alone, named by its full project path rather than the row's short one: the dialog has lost
// the group that made the short one unambiguous, and the delete cannot be undone.
const confirmFileRemoval = (file: UndeclaredFile): Promise<boolean> =>
  confirmDialog(
    "Remove file",
    [
      ["Remove ", identifier(file.path), " from this project? The file is deleted."],
      "No declaration points at it, so nothing the story draws changes.",
    ],
    "Remove"
  )

// Two lines: what there is, and the two ways out of it - the button below, or writing it into
// `manifest.yaml` by hand.
const emptyState = (): HTMLElement => {
  const empty = element("div", "vn-asset-empty")
  empty.append("Nothing declared yet.", element("br", ""), "Add a file, or write it into manifest.yaml.")
  return empty
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const elem = document.createElement(tag)
  if (className !== "") elem.classList.add(className)
  return elem
}

function text<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  content: string
): HTMLElementTagNameMap[K] {
  const elem = element(tag, className)
  elem.textContent = content
  return elem
}
