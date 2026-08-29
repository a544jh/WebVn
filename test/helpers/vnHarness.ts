import * as CodeMirror from "codemirror"
import { expect } from "vitest"
import { VnPlayer } from "../../src/core/player"
import { VnPlayerState } from "../../src/core/state"
import { YamlParser } from "../../src/yamlParser/YamlParser"
import { DomRenderer } from "../../src/domRenderer/DomRenderer"
import { TEST_MANIFEST } from "./testManifest"
import { seedState, VnManifest } from "../../src/core/manifest"
import { VnEditor } from "../../src/editor/editor"

// Shared setup for the browser-backed suites: mounting a VN into a fresh DOM root, waiting for
// the render loop to come to rest, and reading what ended up on screen.

export const SCENE_WIDTH = 1280
export const SCENE_HEIGHT = 720

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// Long enough for a render that should not happen to have happened.
export const settle = (): Promise<void> => sleep(50)

export const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))

// The #vn-div markup the standalone player ships (src/player.html). DomRenderer wires the action
// buttons up in its constructor, so they have to be in the root before it is built.
const VN_ACTIONS_HTML = `
<div id="vn-actions">
  <div role="button" class="vn-action vn-action-back"><i class="gg-back-button"></i>Back</div>
  <div role="button" class="vn-action vn-action-menu"><i class="gg-menu"></i>Menu</div>
  <div role="button" class="vn-action vn-action-auto">Auto<i class="gg-play-button"></i></div>
  <div role="button" class="vn-action vn-action-skip">
    Skip<span style="width: 20px; transform: translateX(14px)"><i class="gg-play-forwards"></i></span>
  </div>
</div>`

// A clean slate for one test: an empty document, an empty localStorage (DomRenderer saves into it)
// and a scene-sized root to mount into. Pass `actions` for the player's action bar, which only the
// tests that click Back/Menu/Auto/Skip need.
export const createVnRoot = (options: { actions?: boolean } = {}): HTMLDivElement => {
  localStorage.clear()
  document.body.innerHTML = ""
  const root = document.createElement("div")
  root.id = "vn-div"
  root.style.width = `${SCENE_WIDTH}px`
  root.style.height = `${SCENE_HEIGHT}px`
  if (options.actions) root.innerHTML = VN_ACTIONS_HTML
  document.body.appendChild(root)
  return root
}

// Resolves the next time a render pass finishes with the player stopped (i.e. waiting for input).
export const nextStop = (renderer: DomRenderer, player: VnPlayer): Promise<void> =>
  new Promise((resolve) => {
    const callback = () => {
      if (!player.state.stopAfterRender) return
      renderer.onFinishedCallbacks.splice(renderer.onFinishedCallbacks.indexOf(callback), 1)
      resolve()
    }
    renderer.onFinishedCallbacks.push(callback)
  })

export interface MountedVn {
  player: VnPlayer
  renderer: DomRenderer
  firstStop: Promise<void>
}

// Boots a story the way the standalone player does: build the renderer, then hand it the story with
// loadStory, which plays it to its first stop. The stop is hooked up before that call rather than
// after, so nothing can be missed by a boot that finishes early.
export const mountVn = (root: HTMLDivElement, state: VnPlayerState): MountedVn => {
  const player = new VnPlayer(state)
  const renderer = new DomRenderer(root, player)
  const firstStop = nextStop(renderer, player)
  renderer.loadStory(state, true)
  return { player, renderer, firstStop }
}

export interface StartedVn extends MountedVn {
  root: HTMLDivElement
}

// Parses a script and plays it up to its first stop - the whole boot the browser suites do. Pass a
// `manifest` when the script names assets or actors; TEST_MANIFEST declares none.
export const startVn = async (
  script: string,
  options: { actions?: boolean; manifest?: VnManifest } = {}
): Promise<StartedVn> => {
  const root = createVnRoot(options)
  const [state, errors] = YamlParser.parseStory(script, options.manifest ?? TEST_MANIFEST)
  expect(errors).toEqual([])
  const mounted = mountVn(root, state)
  await mounted.firstStop
  return { root, ...mounted }
}

// appendTextNodesToDiv assigns each character to `span.innerText`, and the innerText setter
// turns a "\n" into a <br>. textContent alone would silently drop multiline text nodes and
// freeform line breaks, so put them back.
export const boxText = (box: Element): string =>
  [...box.children].map((span) => (span.querySelector("br") === null ? span.textContent : "\n")).join("")

export const textBoxText = (root: HTMLDivElement): string | null => {
  const box = root.querySelector(".vn-adv-textbox")
  return box === null ? null : boxText(box)
}

export const nameTag = (root: HTMLDivElement): HTMLDivElement | null => root.querySelector(".vn-adv-nametag")

export const spriteElems = (root: HTMLDivElement): HTMLImageElement[] =>
  [...root.querySelectorAll("#vn-sprite-renderer img")] as HTMLImageElement[]

// Only the sprites the renderer still considers live - elements mid fade-out have their id deleted.
export const liveSprites = (root: HTMLDivElement): Record<string, HTMLImageElement> => {
  const result: Record<string, HTMLImageElement> = {}
  for (const elem of spriteElems(root)) {
    if (elem.dataset.vnSpriteId !== undefined) result[elem.dataset.vnSpriteId] = elem
  }
  return result
}

export const decisionItems = (root: HTMLDivElement): HTMLDivElement[] =>
  [...root.querySelectorAll("#vn-decision-renderer .vn-decision-item")] as HTMLDivElement[]

// Mounting the editor, which nothing did before - TODO item T's "nothing mounts VnEditor; every
// editor change is verified by hand". Player, renderer and editor over one document, seeded from
// the manifest text the test supplies, so a test declares only the actors and assets it needs.
export interface StartedEditor {
  root: HTMLDivElement
  editorRoot: HTMLDivElement
  player: VnPlayer
  renderer: DomRenderer
  editor: VnEditor
}

export const startEditor = async (manifestText: string, script: string): Promise<StartedEditor> => {
  const root = createVnRoot()
  const editorRoot = document.createElement("div")
  document.body.appendChild(editorRoot)

  const [manifest, errors] = YamlParser.parseManifest(manifestText)
  expect(errors).toEqual([])
  if (manifest === null) throw new Error("the test's own manifest does not parse")

  const player = new VnPlayer(seedState(manifest))
  const renderer = new DomRenderer(root, player)
  const editor = new VnEditor(editorRoot, player, YamlParser, renderer, manifest)

  const firstStop = nextStop(renderer, player)
  await editor.loadProject(manifestText, script)
  await firstStop
  return { root, editorRoot, player, renderer, editor }
}

export const editorTab = (editorRoot: HTMLDivElement, buffer: "script" | "manifest"): HTMLButtonElement =>
  editorRoot.querySelector(`.vn-editor-tab[data-vn-buffer="${buffer}"]`) as HTMLButtonElement

// CodeMirror 5 hangs its instance off its own wrapper element, which is how a test reaches a buffer
// without VnEditor growing a hook for it. The one place these suites touch CodeMirror: everything
// they assert on is player and renderer state, so they survive the CM6 migration that deletes the
// tab bar.
const codeMirrorOf = (editorRoot: HTMLDivElement): CodeMirror.Editor =>
  (editorRoot.querySelector(".CodeMirror") as unknown as { CodeMirror: CodeMirror.Editor }).CodeMirror

// Types into the manifest buffer, the way switching tabs and editing does.
export const typeManifest = (started: StartedEditor, text: string): void => {
  editorTab(started.editorRoot, "manifest").click()
  codeMirrorOf(started.editorRoot).getDoc().setValue(text)
}

// Leaving the editor, which is what adopts a manifest.
export const blurEditor = async (started: StartedEditor): Promise<void> => {
  const cm = codeMirrorOf(started.editorRoot)
  cm.focus()
  cm.getInputField().blur()
  await settle()
}

export const errorMarkers = (editorRoot: HTMLDivElement): Element[] => [
  ...editorRoot.querySelectorAll(".vn-marker-error"),
]
