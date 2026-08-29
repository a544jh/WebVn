import * as CodeMirror from "codemirror"
import "codemirror/mode/yaml/yaml"
import { codeMirror } from "./codeMirror"
import { ErrorLevel, ParserError, SourceLocation, VnParser } from "../core/commands/Parser"
import { declarationLocations } from "../yamlParser/parseManifest"
import { DeclaredAsset, VnManifest } from "../core/manifest"
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

// Left to right, which is also the order a project is read in: what it declares, then what it says.
const BUFFER_LABELS: Record<BufferName, string> = {
  manifest: "manifest.yaml",
  script: "script.yaml",
}

// The buffer the editor opens on. Not the leftmost tab: writing the story is the work, and the
// manifest is what you go to when the story needs something it does not have yet.
const INITIAL_BUFFER: BufferName = "script"

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
  private activeBuffer: BufferName = INITIAL_BUFFER
  private tabs: Record<BufferName, HTMLButtonElement>

  // Whether the manifest buffer last parsed. Gates Export, because a payload whose manifest does not
  // parse is one the player refuses. What a tab shows is not read from here - see refreshTab.
  private manifestParsed = true

  // The worst level marked in each buffer, which is what its tab wears. Kept beside the markers
  // because CodeMirror offers no way to ask a gutter what is in it.
  private markedLevel: Record<BufferName, ErrorLevel | null> = { script: null, manifest: null }

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
    this.vnEditor.swapDoc(this.docFor(INITIAL_BUFFER))

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
    this.clearMarkers("script")
    this.markErrors("script", errors)

    this.scriptDoc.markClean()
    return state
  }

  // Both buffers, which is what booting a project means now.
  public async loadProject(manifestText: string, script: string): Promise<void> {
    this.manifestDoc.setValue(manifestText)
    this.manifestDoc.markClean()
    this.setManifestParsed(true)
    await this.loadScript(script)
  }

  public async loadScript(script: string): Promise<void> {
    this.scriptDoc.setValue(script)
    const state = this.parseDocument()

    const failed = await this.renderer.loadAssets(state)
    this.reportMissingFiles(state, failed)

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
    this.clearMarkers("manifest")
    this.markErrors("manifest", errors)

    if (manifest === null) {
      // Left dirty on purpose: the buffer has not been adopted, so the next blur tries again.
      this.setManifestParsed(false)
      return
    }
    this.manifestDoc.markClean()
    this.manifest = manifest
    // Before the await, not after: the flag means "the buffer parsed", which is settled here. Left
    // until the end it would keep Export greyed out for the length of the asset load - and, if this
    // adoption were superseded, leave it greyed out for good over a manifest that parsed fine.
    this.setManifestParsed(true)

    // Reparsed against the new manifest: actor and asset ids resolve through it, so the same script
    // means something different now - which is the point, since fixing a typo'd id in the manifest
    // is what clears the error in the script.
    const state = this.parseDocument()
    // Reloaded before the story is: a newly declared or renamed file is not in the loader yet, and
    // the sub-renderers throw on an asset that resolves to a path nothing preloaded.
    const failed = await this.renderer.loadAssets(state)
    if (generation !== this.adoptGeneration) return

    this.reportMissingFiles(state, failed)

    // Reloading rather than loading: the path is replayed against the new starting state and cut
    // back to the part that still applies, the same answer a script edit gets. An edited `id` is
    // carried in on that state, so later saves go to the new key without a second call to make.
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

  private docFor(buffer: BufferName): CodeMirror.Doc {
    return buffer === "script" ? this.scriptDoc : this.manifestDoc
  }

  private showBuffer(buffer: BufferName): void {
    if (this.activeBuffer === buffer) return
    this.activeBuffer = buffer
    this.vnEditor.swapDoc(this.docFor(buffer))
    for (const name of Object.keys(this.tabs) as BufferName[]) {
      this.tabs[name].classList.toggle("vn-editor-tab-active", name === buffer)
    }
    this.vnEditor.focus()
  }

  // A declared file that is not there is reported rather than refused: declaring an asset before the
  // art exists is the normal authoring order. What this does not do is make the story survive one -
  // a sub-renderer still throws on the frame that paints it, which is a renderer change with its own
  // blast radius.
  //
  // Reported on the line that declared it, because that is the edit that caused it and a filename
  // is otherwise the one thing an author cannot check by reading the two documents. The tab carries
  // the same news, in the same colour, for anyone looking at the other buffer.
  //
  // A warning rather than an error, and the manifest is adopted anyway: the buffer parsed and the
  // story runs, right up until it reaches the asset. Red in this gutter is for a manifest that did
  // not parse, which is the one that is not adopted - so an undrawn declaration, which is the normal
  // authoring order, must not wear it.
  //
  // Marked without clearing the gutter first - the adoption cleared it before marking the parse
  // problems this is added to, and a boot has nothing to clear.
  private reportMissingFiles(state: VnPlayerState, failed: DeclaredAsset[]): void {
    // The buffer is the manifest this state was seeded from, so its keys are the ones to look up.
    const locations = declarationLocations(
      this.manifestDoc.getValue(),
      failed.map((asset) => asset.manifestKey)
    )
    const errors = failed.map(
      (asset, i) => new ParserError(`Could not load ${asset.path}`, locations[i], ErrorLevel.WARNING)
    )
    errors.forEach((error) => console.warn(error.message))
    this.markErrors("manifest", errors)
  }

  // A buffer's markers and its tab go together, so they are cleared together.
  private clearMarkers(buffer: BufferName): void {
    this.docFor(buffer).clearGutter("vn-error-gutter")
    this.markedLevel[buffer] = null
    this.refreshTab(buffer)
  }

  // Marks on top of what is already there rather than replacing it, because reportMissingFiles adds
  // to the parse problems the adoption just marked. The level therefore only rises between clears,
  // which is what stops a manifest that failed to parse from ending up in a missing file's orange.
  private markErrors(buffer: BufferName, errors: ParserError[]): void {
    const doc = this.docFor(buffer)
    for (const error of errors) {
      this.setErrorMarker(doc, error)
      const worst = this.markedLevel[buffer]
      if (worst === null || error.level > worst) this.markedLevel[buffer] = error.level
    }
    this.refreshTab(buffer)
  }

  // One rule for both tabs: a tab wears the worst level marked in its own gutter - red for an error,
  // orange for a warning, nothing when the buffer is clean. That is what makes a tab a summary of
  // its gutter rather than a second signal to keep in sync with it, and one rule says the right
  // thing in both buffers. On the manifest, red is a buffer that did not parse and was therefore
  // never adopted, so the preview is running a *different* manifest; orange is one adopted with a
  // file missing under it. On the script, red is a story that could not be built as written and
  // orange one built with lines that do nothing.
  //
  // A tab is the only sign visible from the other buffer, which is why the script needs one at all:
  // since docs/adr/0004-an-undeclared-reference-neutralizes-its-command.md, fixing an id the script
  // names is a *manifest* edit, and the complaint it clears is marked in the buffer nobody is
  // looking at. design-docs/SCRIPT_INCLUDES.md wants the same indicator per included script file.
  private refreshTab(buffer: BufferName): void {
    const level = this.markedLevel[buffer]
    this.tabs[buffer].classList.toggle("vn-editor-tab-error", level === ErrorLevel.ERROR)
    this.tabs[buffer].classList.toggle("vn-editor-tab-warning", level === ErrorLevel.WARNING)
  }

  // Export is gated on this and nothing else, so this is where the host page is told. A story that
  // declares a file nobody has drawn yet still plays, and still exports.
  private setManifestParsed(parsed: boolean): void {
    this.manifestParsed = parsed
    this.onManifestStateChangeCallbacks.forEach((cb) => cb())
  }

  private goToLine(line: number) {
    // Reloading rather than loading keeps the choices made so far, so the replay jump below still
    // has decisions to follow. They are truncated to what still replays, because this method does
    // not always reach the jump - clicking a line that holds no command returns before it - and a
    // path left describing the old script would be waiting to break the next undo.
    const reloaded = !this.scriptDoc.isClean()
    if (reloaded) {
      this.player.reloadStory(this.parseDocument())
    }
    const commandIndex = this.player.state.commands.findIndex((cmd) => {
      const location = cmd.getSourceLocation()
      return line >= location.startLine && line <= location.endLine
    })
    if (commandIndex === -1) {
      // Nowhere to jump to, but a reload has already moved the player: the path was cut back to
      // what still replays and `startingState` is the new story. The frame on screen belongs to the
      // story that is gone, so repaint where the reload landed rather than leaving the preview
      // quoting a line the script no longer has. Nothing to repaint when nothing was reloaded.
      if (reloaded) this.renderer.render(false)
      return
    }
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
    if (name === INITIAL_BUFFER) tab.classList.add("vn-editor-tab-active")
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
