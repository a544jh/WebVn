import { expect } from "vitest"
import { initialState, VnPlayer } from "../../src/core/player"
import { VnPlayerState } from "../../src/core/state"
import { ConsecutiveIntegerSet } from "../../src/lib/ConsecutiveIntegerSet"
import { YamlParser } from "../../src/yamlParser/YamlParser"
import { DomRenderer } from "../../src/domRenderer/DomRenderer"

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

// initialState.seenCommands is a single shared mutable instance. Every test needs its own, or
// skip-mode availability leaks from whichever test ran before it.
export const freshState = (state: VnPlayerState = initialState): VnPlayerState => ({
  ...state,
  seenCommands: new ConsecutiveIntegerSet(),
})

export interface StartedVn extends MountedVn {
  root: HTMLDivElement
}

// Parses a script and plays it up to its first stop - the whole boot the browser suites do.
export const startVn = async (script: string, options: { actions?: boolean } = {}): Promise<StartedVn> => {
  const root = createVnRoot(options)
  const [state, errors] = YamlParser.parseStory(script, freshState())
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
