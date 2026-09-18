import { AssetResolver } from "../assetLoaders/AssetResolver"
import { confirmDialog, identifier, noticeDialog } from "../chrome/dialog"
import { icon, IconName } from "../chrome/icons"
import { referenceCount } from "../core/commands/references"
import { AssetDeclaration, DeclaredAsset, Reference } from "../core/manifest"
import { VnPlayer } from "../core/player"
import { VnPlayerState } from "../core/state"
import { declaredFilePath } from "../domRenderer/assetPaths"
import { askForAsset } from "./addAssetDialog"
import {
  actorBranches,
  branchCount,
  DeclaredBranch,
  DeclaredLeaf,
  declaredGroups,
  leafKey,
  nothingDeclared,
} from "./declarations"
import { VnEditor } from "./editor"
import "../chrome/chrome.css"
import "./assetPanel.css"

// The column to the right of the stage: everything `manifest.yaml` declares, and a button that adds
// to it.
//
// **A view of the manifest, not of OPFS** - see `declarations.ts`, which is the walk this draws.
// Three fixed groups, one level of nesting under an actor, ids as leaves.
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
  // asset dialog refuses a filename collision against.
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

  constructor(private root: HTMLElement, private deps: AssetPanelDeps) {
    // The one redraw signal: the editor has finished deciding what the project is described by.
    // Declarations do not change per frame, so this is deliberately not `renderer.onRenderCallbacks`
    // - the label list in `.scratch/label-list/` is the one that wants a per-render read.
    deps.editor.onManifestSettledCallbacks.push(() => this.draw())
    // The initial mount, from the state `editorBoot` loaded. The boot fills the buffers afterwards,
    // which fires the callback above with whatever the asset load reported.
    this.draw()
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

  private panel(): HTMLElement {
    const panel = element("div", "vn-asset-panel")
    const groups = declaredGroups(this.deps.player.state)
    const missing = missingKeys(this.deps.editor.getMissingAssets())

    panel.appendChild(this.bar())
    panel.appendChild(this.list(groups, missing))
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

  private list(groups: DeclaredBranch[], missing: Set<string>): HTMLElement {
    const list = element("div", "vn-asset-list")
    if (nothingDeclared(groups)) {
      list.appendChild(emptyState())
      return list
    }
    for (const group of groups) this.drawBranch(list, group, missing, 0)
    return list
  }

  // A group and everything under it, appended flat into the list: nesting is carried by the rows'
  // own indentation rather than by nested containers, which is what keeps a row a row.
  private drawBranch(list: HTMLElement, branch: DeclaredBranch, missing: Set<string>, depth: number): void {
    list.appendChild(this.header(branch, missing, depth))
    if (this.collapsed.has(branch.key)) return
    for (const leaf of branch.leaves) list.appendChild(this.row(leaf, missing))
    for (const child of branch.branches) this.drawBranch(list, child, missing, depth + 1)
  }

  private header(branch: DeclaredBranch, missing: Set<string>, depth: number): HTMLElement {
    const folded = this.collapsed.has(branch.key)
    const header = element("button", "vn-asset-group")
    header.type = "button"
    if (depth > 0) header.classList.add("vn-asset-actor")
    // Orange when anything under it is, so folding a group away does not fold away the news.
    header.classList.toggle("vn-asset-missing", branchMissing(branch, missing))
    header.setAttribute("aria-expanded", String(!folded))
    header.dataset.vnAssetGroup = branch.key

    header.appendChild(icon(folded ? "chevron-right" : "chevron-down", 13))
    header.appendChild(text("span", "vn-asset-group-name", branch.name))
    header.appendChild(text("span", "vn-asset-group-count", String(branchCount(branch))))
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

  // One declared asset. **Not a button**: the row's actions are its controls, and inserting the id
  // at the cursor from here was considered and belongs with `design-docs/EDITOR.md`'s completions -
  // it is a *script* edit driven from a *manifest* view, and it has to decide what happens when the
  // cursor is somewhere the id is not legal.
  private row(leaf: DeclaredLeaf, missing: Set<string>): HTMLElement {
    const key = leafKey(leaf.manifestKey)
    const gone = missing.has(key)

    const row = element("div", "vn-asset-row")
    if (leaf.kind === "sprite") row.classList.add("vn-asset-row-sprite")
    row.classList.toggle("vn-asset-missing", gone)
    row.dataset.vnAsset = key

    row.appendChild(text("span", "vn-asset-id", leaf.id))
    row.appendChild(text("span", "vn-asset-file", leaf.file))
    // Said as well as coloured: a filename is the one thing an author cannot check by reading the
    // two documents, so the row says what is wrong rather than only that something is.
    if (gone) row.appendChild(text("span", "vn-asset-note", "not drawn yet"))
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
    // unavailable. Which also makes the orange row the one an author can fix from here - its replace
    // is how they supply the file that was declared.
    if (!gone) {
      controls.appendChild(
        this.control("vn-asset-preview", "eye", `Preview ${leaf.id}`, "Open this file in a new tab", () =>
          this.preview(leaf)
        )
      )
    }
    controls.append(...this.replaceControl(leaf))
    controls.appendChild(
      this.control("vn-asset-remove", "trash-2", `Remove ${leaf.id}`, "Remove this asset", () => this.remove(leaf))
    )
    return controls
  }

  // One hidden input per row, beside its own control rather than shared: which asset a pick is for is
  // then answered by construction rather than by a field the next draw would replace. The input is
  // the control's *sibling* for the reason the footer's is - a click on a child input bubbles back to
  // the button, whose handler clicks the input, which is a loop with no bottom.
  private replaceControl(leaf: DeclaredLeaf): HTMLElement[] {
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
        if (file !== undefined) void this.replace(leaf, file)
      },
      { signal: this.listeners.signal }
    )
    const button = this.control("vn-asset-replace", "replace", `Replace ${leaf.id}`, "Give this asset new bytes", () =>
      Promise.resolve(input.click())
    )
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
  private async replace(leaf: DeclaredLeaf, file: File): Promise<void> {
    await this.work("Replacing\u2026", async () => {
      try {
        await this.deps.files.write(leaf.path, file)
      } catch (e) {
        console.error("The asset could not be written into the project", e)
        await noticeDialog("The asset was not replaced", [`${leaf.path} could not be written, so nothing changed.`])
        return
      }
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
  // Not gated: it writes nothing.
  private async preview(leaf: DeclaredLeaf): Promise<void> {
    try {
      window.open(await this.deps.resolver.resolve(leaf.path), "_blank")
    } catch (e) {
      console.error(`${leaf.path} could not be opened`, e)
      await noticeDialog("The asset could not be opened", [`${leaf.path} is not in this project.`])
    }
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
    const declaration = await askForAsset(file, {
      // The manifest's own order, and the same walk the list is drawn from - so the actors offered
      // here cannot come to disagree with the actors shown above.
      actors: actorBranches(state).map((branch) => branch.name),
      isDeclared: (asked) => declares(state, asked),
      taken: await this.deps.files.list(),
    })
    if (declaration === null) return

    // **Asked before anything is written.** The manifest buffer may be one no declaration can be
    // spliced into - flow style, or a group whose value shares its line - and a copy whose
    // declaration was never going to land is a file nothing in the project points at.
    const cannot = this.deps.editor.canDeclareAsset(declaration)
    if (cannot !== null) {
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

// Whether a state already declares what is being asked for, in its own group. The one place the
// three declarations are asked that question, so a duplicate is refused on the same terms the
// manifest would.
const declares = (state: VnPlayerState, declaration: AssetDeclaration): boolean => {
  switch (declaration.kind) {
    case "background":
      return state.backgrounds[declaration.id] !== undefined
    case "audio":
      return state.audioAssets[declaration.id] !== undefined
    case "sprite":
      return state.actors[declaration.actor]?.sprites?.[declaration.id] !== undefined
  }
}

// Which declarations the last asset load could not find, by the key the manifest declares them
// under. **The key rather than the path**, because two ids may name one file and only one of them is
// the row that has to go orange - and it is exactly why `loadAssets` reports keys at all.
const missingKeys = (failed: DeclaredAsset[]): Set<string> => new Set(failed.map((asset) => leafKey(asset.manifestKey)))

const branchMissing = (branch: DeclaredBranch, missing: Set<string>): boolean =>
  branch.leaves.some((leaf) => missing.has(leafKey(leaf.manifestKey))) ||
  branch.branches.some((child) => branchMissing(child, missing))

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
