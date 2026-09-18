import { icon } from "../chrome/icons"
import { DeclaredAsset } from "../core/manifest"
import { VnPlayer } from "../core/player"
import { branchCount, DeclaredBranch, DeclaredLeaf, declaredGroups, leafKey, nothingDeclared } from "./declarations"
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

export interface AssetPanelDeps {
  // Where the declarations come from: `seedState` copied them onto the state and `advance` never
  // writes them, so this is as authoritative as the manifest and is the thing already threaded
  // everywhere.
  readonly player: VnPlayer
  // What adopted that manifest, what knows whether the buffer parses, and - for the panel's three
  // writes - whose buffer the declaration is spliced into.
  readonly editor: VnEditor
}

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
    return row
  }

  private footer(): HTMLElement {
    const footer = element("div", "vn-asset-panel-footer")
    const add = element("button", "vn-asset-add")
    add.type = "button"
    add.appendChild(icon("plus", 16))
    add.appendChild(document.createTextNode("Add asset"))
    footer.appendChild(add)
    return footer
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
