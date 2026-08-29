import * as CodeMirror from "codemirror"
import "codemirror/mode/yaml/yaml"
import { codeMirror } from "./codeMirror"
import { ErrorLevel, ParserError, SourceLocation, VnParser } from "../core/commands/Parser"
import { VnManifest } from "../core/manifest"
import { VnPlayer } from "../core/player"
import { VnPlayerState } from "../core/state"
import { VnPath } from "../core/vnPath"
import { Renderer } from "../Renderer"
import "./editor.css"

// How clicking a line in the editor gets the player there. "replay" plays the story from the top,
// following jumps and answering decisions from the recorded ones, so the scene is built and the
// path stays honest. "direct" teleports and applies that one command onto whatever is on screen.
export type JumpMode = "replay" | "direct"

// The two documents a project is written in. One CodeMirror instance holds a `Doc` per buffer and
// swaps between them, which is CodeMirror 5's own multi-buffer model and the 5.x spelling of the
// `EditorState`-per-file shape design-docs/EDITOR.md migrates to - so this is ported at the CM6
// migration rather than deleted. design-docs/SCRIPT_INCLUDES.md wants the same mechanism for N
// script files; two hardcoded tabs is the two-buffer subset of it, kept deliberately crude so that
// turning them into a file switcher is not a fight.
type BufferName = "script" | "manifest"

const BUFFER_LABELS: Record<BufferName, string> = {
  script: "script.yaml",
  manifest: "manifest.yaml",
}

// https://github.com/codemirror/CodeMirror/issues/988#issuecomment-14921785
function betterTab(cm: CodeMirror.Editor) {
  if (cm.somethingSelected()) {
    cm.indentSelection("add")
  } else {
    cm.replaceSelection(
      cm.getOption("indentWithTabs") ? "\t" : Array((cm.getOption("indentUnit") || 0) + 1).join(" "),
      "end"
    )
  }
}

export class VnEditor {
  private vnEditor: CodeMirror.Editor

  private player: VnPlayer
  private parser: VnParser
  private renderer: Renderer

  // The last manifest that parsed, which is what the preview is built from. Mutable, unlike before:
  // adopting is what changes it, and a manifest that fails to parse leaves it alone - see
  // docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md.
  private manifest: VnManifest
  private jumpMode: JumpMode = "replay"

  private scriptDoc: CodeMirror.Doc
  private manifestDoc: CodeMirror.Doc
  private activeBuffer: BufferName = "script"
  private tabs: Record<BufferName, HTMLButtonElement>

  // Whether the manifest buffer last parsed, and whether every file it declares loaded. The first
  // gates Export, because a payload whose manifest does not parse is one the player refuses; both
  // mark the tab, which is the only sign visible from the other buffer that what is on screen is
  // not what the preview is running.
  private manifestParsed = true
  private assetsLoaded = true

  // Adopting is asynchronous - the asset load sits between parsing and reloading - so two blurs in
  // quick succession can resolve out of order and let an older manifest win. Same hazard and same
  // answer as DomRenderer.renderGeneration.
  private adoptGeneration = 0

  // Fires after every adoption attempt, so a host page can follow `isManifestValid`.
  public onManifestStateChangeCallbacks: Array<() => void> = []

  // `manifest` is what `manifestText` parses to - the caller has already parsed it, because it
  // needed the id to seed the player and key its saves. loadProject puts the text in the buffer.
  constructor(root: HTMLDivElement, player: VnPlayer, parser: VnParser, renderer: Renderer, manifest: VnManifest) {
    this.player = player
    this.parser = parser
    this.renderer = renderer
    this.manifest = manifest

    this.renderer.onRenderCallbacks.push(() => {
      this.setPositionMarker()
      const location = getCurrentLocation(player)
      if (location === null) return
      // The script doc by name, not whatever is on screen: a render while the manifest tab is up
      // would otherwise move the manifest's cursor.
      this.scriptDoc.setCursor({ line: location.startLine - 1, ch: 0 })
    })

    const [tabBar, tabs] = makeTabBar((buffer) => this.showBuffer(buffer))
    this.tabs = tabs
    root.appendChild(tabBar)

    this.vnEditor = codeMirror(root, {
      lineNumbers: true,
      gutters: ["CodeMirror-linenumbers", "vn-position-gutter", "vn-error-gutter"],
      indentWithTabs: false,
      indentUnit: 2,
      extraKeys: { Tab: betterTab },
    })

    // Per-buffer undo history, cursor and dirty flag come with the `Doc`, which is most of why this
    // is one instance and two docs rather than two instances.
    this.scriptDoc = codeMirror.Doc("", "yaml")
    this.manifestDoc = codeMirror.Doc("", "yaml")
    this.vnEditor.swapDoc(this.scriptDoc)

    this.vnEditor.on("gutterClick", (instance, line) => {
      // The manifest's gutter holds error markers and nothing to jump to.
      if (this.activeBuffer !== "script") return
      line = line + 1 // codemirror line is zero based
      this.goToLine(line)
    })
    this.vnEditor.on("blur", () => {
      if (this.activeBuffer === "manifest") {
        void this.adoptManifest()
        return
      }
      const location = getCurrentLocation(this.player)
      if (location !== null) this.goToLine(location.startLine)
    })
    this.vnEditor.on("scrollCursorIntoView", (instance, event) => {
      // this prevents the whole window from scrolling for some reason, but the editor itself is still scrolled
      event.preventDefault()
    })
  }

  // Parses the script and marks up any errors. Getting the result into the player is the caller's
  // to decide: goToLine reloads, keeping the path, while loadScript hands the state to loadStory,
  // which loads it as a fresh story.
  private parseDocument(): VnPlayerState {
    const [state, errors] = this.parser.parseStory(this.scriptDoc.getValue(), this.manifest)
    this.scriptDoc.clearGutter("vn-error-gutter")
    for (const error of errors) {
      this.setErrorMarker(this.scriptDoc, error)
    }

    this.scriptDoc.markClean()
    return state
  }

  // Both buffers, which is what booting a project means now.
  public async loadProject(manifestText: string, script: string): Promise<void> {
    this.manifestDoc.setValue(manifestText)
    this.manifestDoc.markClean()
    this.manifestParsed = true
    this.refreshManifestTab()
    await this.loadScript(script)
  }

  public async loadScript(script: string): Promise<void> {
    this.scriptDoc.setValue(script)
    const state = this.parseDocument()

    const failed = await this.renderer.loadAssets(state)
    this.setAssetsLoaded(failed)

    // Unanimated: an author reloading a script wants to be back at the first stop, not to sit
    // through the intro again. The standalone player boots the same story with animations.
    this.renderer.loadStory(state, false)
  }

  // Parse the manifest buffer and, if it is a manifest, make it the one the project runs under.
  //
  // Gated on the manifest doc's own dirtiness, because blur is a much broader event than "I finished
  // editing the manifest": clicking the preview, the Fullscreen button or another browser tab all
  // fire it, and each one would otherwise reload the story out from under the author. Note this is
  // the opposite gate from goToLine's - the script's *cleanliness* must never stop the reparse
  // below, because the script is untouched and its meaning changed anyway.
  private async adoptManifest(): Promise<void> {
    if (this.manifestDoc.isClean()) return
    const generation = ++this.adoptGeneration

    const [manifest, errors] = this.parser.parseManifest(this.manifestDoc.getValue())
    this.manifestDoc.clearGutter("vn-error-gutter")
    for (const error of errors) {
      this.setErrorMarker(this.manifestDoc, error)
    }

    if (manifest === null) {
      // Left dirty on purpose: the buffer has not been adopted, so the next blur tries again.
      this.manifestParsed = false
      this.refreshManifestTab()
      return
    }
    this.manifestDoc.markClean()
    this.manifest = manifest

    // Reparsed against the new manifest: actor and asset ids resolve through it, so the same script
    // means something different now - which is the point, since fixing a typo'd id in the manifest
    // is what clears the error in the script.
    const state = this.parseDocument()
    // Reloaded before the story is: a newly declared or renamed file is not in the loader yet, and
    // the sub-renderers throw on an asset that resolves to a path nothing preloaded.
    const failed = await this.renderer.loadAssets(state)
    if (generation !== this.adoptGeneration) return

    this.manifestParsed = true
    this.setAssetsLoaded(failed)

    // Later saves go to the new key. Nothing migrates - see DomRenderer.setSaveId.
    this.renderer.setSaveId(manifest.id)
    // Reloading rather than loading: the path is replayed against the new starting state and cut
    // back to the part that still applies, the same answer a script edit gets.
    this.player.reloadStory(state)
    this.renderer.render(false)
  }

  public getScript(): string {
    return this.scriptDoc.getValue()
  }

  // The raw buffer, not a re-serialisation of the parsed manifest: the payload carries comments.
  public getManifestText(): string {
    return this.manifestDoc.getValue()
  }

  // Whether the manifest buffer last parsed. False means the preview is running an older manifest
  // than the one on screen, and that a link exported now would be one the player refuses.
  public isManifestValid(): boolean {
    return this.manifestParsed
  }

  public setJumpMode(mode: JumpMode): void {
    this.jumpMode = mode
  }

  private showBuffer(buffer: BufferName): void {
    if (this.activeBuffer === buffer) return
    this.activeBuffer = buffer
    this.vnEditor.swapDoc(buffer === "script" ? this.scriptDoc : this.manifestDoc)
    for (const name of Object.keys(this.tabs) as BufferName[]) {
      this.tabs[name].classList.toggle("vn-editor-tab-active", name === buffer)
    }
    this.vnEditor.focus()
  }

  // A declared file that is not there is reported rather than refused: declaring an asset before the
  // art exists is the normal authoring order. The tab carries the same news for anyone not watching
  // the console. What this does not do is make the story survive one - a sub-renderer still throws
  // on the frame that paints it, which is a renderer change with its own blast radius.
  private setAssetsLoaded(failed: string[]): void {
    this.assetsLoaded = failed.length === 0
    if (failed.length > 0) console.warn("Declared files that could not be loaded: " + failed.join(", "))
    this.refreshManifestTab()
  }

  // One class, meaning "this buffer is not fully in effect". It covers both a parse failure (the
  // preview is running a different manifest) and a failed asset load (the preview is running this
  // manifest with a file missing under it); the gutter and the console still tell them apart. It is
  // the same indicator design-docs/SCRIPT_INCLUDES.md wants for a script buffer that is not on
  // screen - without it, a broken buffer behind another tab looks clean.
  private refreshManifestTab(): void {
    this.tabs.manifest.classList.toggle("vn-editor-tab-error", !this.manifestParsed || !this.assetsLoaded)
    this.onManifestStateChangeCallbacks.forEach((cb) => cb())
  }

  private goToLine(line: number) {
    if (!this.scriptDoc.isClean()) {
      // Reloading rather than loading keeps the choices made so far, so the replay jump below still
      // has decisions to follow. They are truncated to what still replays, because this method does
      // not always reach the jump - clicking a line that holds no command returns before it - and a
      // path left describing the old script would be waiting to break the next undo.
      this.player.reloadStory(this.parseDocument())
    }
    const commandIndex = this.player.state.commands.findIndex((cmd) => {
      const location = cmd.getSourceLocation()
      return line >= location.startLine && line <= location.endLine
    })
    if (commandIndex === -1) return // do nothing if we try to go to a non-command line
    // visually we show that we are on the line's command, but the player needs to be ready for the next one.
    if (this.jumpMode === "replay") {
      this.player.goToCommandByReplay(commandIndex + 1)
    } else {
      this.player.goToCommandDirect(commandIndex + 1)
    }
    this.renderer.render(false)
  }

  private setPositionMarker() {
    this.scriptDoc.clearGutter("vn-position-gutter")
    const location = getCurrentLocation(this.player)
    if (location === null) return
    for (let line = location.startLine; line <= location.endLine; line++) {
      this.scriptDoc.setGutterMarker(line - 1, "vn-position-gutter", this.makeMarker("vn-marker-position", "blue"))
    }
  }

  private setErrorMarker(doc: CodeMirror.Doc, error: ParserError) {
    const color = error.level === ErrorLevel.WARNING ? "orange" : "red"
    for (let line = error.location.startLine; line <= error.location.endLine; line++) {
      doc.setGutterMarker(line - 1, "vn-error-gutter", this.makeMarker("vn-marker-error", color, error.message))
    }
  }

  // Scoped to this editor's own wrapper rather than the whole document. Still the hack its original
  // comment called it - design-docs/EDITOR.md's CM6 gutter extension deletes it outright - but a
  // page-wide query would measure whichever CodeMirror it found first.
  private makeMarker(kind: string, color: string, title?: string): HTMLDivElement {
    const lineNumber = this.vnEditor.getWrapperElement().querySelector(".CodeMirror-linenumber")
    const div = document.createElement("div")
    // Named rather than only coloured: CodeMirror puts a marker in a per-line wrapper rather than
    // inside the gutter column, so the class is what a test has to find it by.
    div.classList.add(kind)
    div.style.background = color
    div.style.width = "100%"
    div.style.height = lineNumber?.clientHeight + "px" // hack to get height..
    if (title) div.title = title
    return div
  }
}

// The tab bar: a click swaps the doc and moves an active class, and that is all it does.
function makeTabBar(onSelect: (buffer: BufferName) => void): [HTMLDivElement, Record<BufferName, HTMLButtonElement>] {
  const bar = document.createElement("div")
  bar.classList.add("vn-editor-tabs")
  const tabs = {} as Record<BufferName, HTMLButtonElement>
  for (const name of Object.keys(BUFFER_LABELS) as BufferName[]) {
    const tab = document.createElement("button")
    tab.type = "button"
    tab.classList.add("vn-editor-tab")
    if (name === "script") tab.classList.add("vn-editor-tab-active")
    tab.textContent = BUFFER_LABELS[name]
    tab.dataset.vnBuffer = name
    tab.addEventListener("click", () => onSelect(name))
    bar.appendChild(tab)
    tabs[name] = tab
  }
  return [bar, tabs]
}

// The command the player last ran. Null on the first frame of a boot, where nothing has run yet.
function getCurrentLocation(player: VnPlayer): SourceLocation | null {
  if (player.state.commandIndex === 0) return null
  return player.state.commands[player.state.commandIndex - 1].getSourceLocation()
}
