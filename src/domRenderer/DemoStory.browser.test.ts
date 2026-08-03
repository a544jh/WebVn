import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { VnPlayer } from "../core/player"
import { VnPlayerState } from "../core/state"
import { ConsecutiveIntegerSet } from "../lib/ConsecutiveIntegerSet"
import { ErrorLevel } from "../core/commands/Parser"
import { loadFromLocalStorage } from "../core/save"
import { YamlParser } from "../yamlParser/YamlParser"
import { demoState, demoYaml } from "../demoStory"
import { DomRenderer } from "./DomRenderer"

// End-to-end coverage of the demo VN shipped by src/playerIndex.ts. The script is imported
// from src/demoStory.ts, so these tests exercise what the standalone player actually loads.
//
// Importing DomRenderer is what pulls in BackgroundRenderer -> BlindsTransition/FadeTransition,
// which is what makes "blinds"/"fade" valid values for the bg command's transition enum. Without
// it every bg command in the demo fails to parse.

const SCENE_WIDTH = 1280
const SCENE_HEIGHT = 720

const FIRST_LINE = "Hello, This is WebVn - A fast visual novel engine for the modern web."
const FOX_LINE = new Array(6).fill("The quick brown fox jumps over the lazy dog.").join(" ")
const MULTILINE = "This is a\nMultiline\nNode\n"
const DECISION_QUESTION = "What decision are you going to make?"
const CLOSED = "<textbox closed>"

// The two options of the demo's decision, verbatim - the first one is a quoting torture test.
const OPTION_GOOD = "asd: asd (quoted string)"
const OPTION_BAD = "A bad one."

// The stops the player comes to rest at, in order, from the first stop up to the decision.
// The demo loops through the actor scene twice: `$a` is 0 on the first pass so
// `jump: {to: loop, if: [$a, ==, 1]}` fires once, and 2 on the second so it falls through.
const STOPS_UP_TO_DECISION = [
  CLOSED, // textbox: close
  FIRST_LINE,
  FOX_LINE,
  "Wait for audio to stop",
  "Looping audio",
  "Another song...",
  "And now... Actors!",
  "Here I am",
  "Just talking...",
  "And here I come",
  "Whee!",
  "Bye",
  "Bye bye, actors",
  "Here I am", // second pass through `label: loop`
  "Just talking...",
  "And here I come",
  "Whee!",
  "Bye",
  "Bye bye, actors",
  CLOSED, // textbox: close
  "This is a YAML anchor", // the *anchor alias
  DECISION_QUESTION, // rendered together with the decision, since Say does not stop before one
]

// After picking the first option (jump: asd).
const STOPS_AFTER_GOOD_CHOICE = [
  "More YAML quoting tests...",
  "2", // the unquoted `- 2` above it is a number, and is dropped with a parser warning
  "no", // YAML 1.2 core schema: `no` is a plain string, not a boolean
  "Quoted",
  MULTILINE,
  "I'm just some random dude",
  "But I'm a defined actor",
  CLOSED,
  "Here I am", // jump: loop
]

// After picking the second option (jump: bad).
const STOPS_AFTER_BAD_CHOICE = ["That was a bad choice.", "And here we go again...", "Here I am"]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

// Resolves the next time a render pass finishes with the player stopped (i.e. waiting for input).
const nextStop = (renderer: DomRenderer, player: VnPlayer): Promise<void> =>
  new Promise((resolve) => {
    const callback = () => {
      if (!player.state.stopAfterRender) return
      renderer.onFinishedCallbacks.splice(renderer.onFinishedCallbacks.indexOf(callback), 1)
      resolve()
    }
    renderer.onFinishedCallbacks.push(callback)
  })

// appendTextNodesToDiv assigns each character to `span.innerText`, and the innerText setter
// turns a "\n" into a <br>. textContent alone would silently drop the demo's multiline node's
// line breaks, so put them back.
const textBoxText = (root: HTMLDivElement): string | null => {
  const box = root.querySelector(".vn-adv-textbox")
  if (box === null) return null
  return [...box.children].map((span) => (span.querySelector("br") === null ? span.textContent : "\n")).join("")
}

const textBoxTextOrClosed = (root: HTMLDivElement): string => textBoxText(root) ?? CLOSED

const nameTag = (root: HTMLDivElement): HTMLDivElement | null => root.querySelector(".vn-adv-nametag")

const spriteElems = (root: HTMLDivElement): HTMLImageElement[] =>
  [...root.querySelectorAll("#vn-sprite-renderer img")] as HTMLImageElement[]

// Only the sprites the renderer still considers live - elements mid fade-out have their id deleted.
const liveSprites = (root: HTMLDivElement): Record<string, HTMLImageElement> => {
  const result: Record<string, HTMLImageElement> = {}
  for (const elem of spriteElems(root)) {
    if (elem.dataset.vnSpriteId !== undefined) result[elem.dataset.vnSpriteId] = elem
  }
  return result
}

const decisionItems = (root: HTMLDivElement): HTMLDivElement[] =>
  [...root.querySelectorAll("#vn-decision-renderer .vn-decision-item")] as HTMLDivElement[]

const arrow = (root: HTMLDivElement): HTMLDivElement => root.querySelector(".vn-arrow") as HTMLDivElement

const skipAction = (root: HTMLDivElement): HTMLDivElement => root.querySelector(".vn-action-skip") as HTMLDivElement

const bgCanvas = (root: HTMLDivElement): HTMLCanvasElement =>
  root.querySelector("#vn-background-renderer") as HTMLCanvasElement

type Pixel = [number, number, number, number]

// Samples a horizontal line across the canvas. The blinds transition reveals the new background
// in vertical slices, so a row sampled mid-transition contains both old and new pixels.
const sampleRow = (canvas: HTMLCanvasElement, y: number, samples = 64): Pixel[] => {
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D
  const row = ctx.getImageData(0, y, canvas.width, 1).data
  const pixels: Pixel[] = []
  for (let i = 0; i < samples; i++) {
    const x = Math.floor((i * (canvas.width - 1)) / (samples - 1))
    pixels.push([row[x * 4], row[x * 4 + 1], row[x * 4 + 2], row[x * 4 + 3]])
  }
  return pixels
}

const isWhite = (p: Pixel) => p[0] === 255 && p[1] === 255 && p[2] === 255 && p[3] === 255

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

interface PlayCall {
  asset: string
  loop: boolean
}

interface Harness {
  root: HTMLDivElement
  player: VnPlayer
  renderer: DomRenderer
  images: Record<string, HTMLImageElement>
  playCalls: PlayCall[]
  // how many stops the harness has advanced past, i.e. the index into STOPS_UP_TO_DECISION
  stopIndex: number
}

// initialState.seenCommands is a single shared mutable instance, and demoState spreads it.
// Every test needs its own or skip-mode availability leaks between them.
const freshDemoState = (): VnPlayerState => ({ ...demoState, seenCommands: new ConsecutiveIntegerSet() })

// Puts the demo's real assets straight into the renderer's asset loaders, under the same keys
// DomRenderer.loadAssets() would derive. Their src paths are relative to the page in the real
// player, which does not resolve under the test runner's URL, hence loading them by hand.
const loadDemoAssets = async (
  renderer: DomRenderer,
  state: VnPlayerState
): Promise<Record<string, HTMLImageElement>> => {
  const images = renderer["imageLoader"]["assets"] as Record<string, HTMLImageElement>
  const audio = renderer["audioLoader"]["assets"] as Record<string, HTMLAudioElement>

  const imagePaths: string[] = []
  for (const actor in state.actors) {
    for (const sprite of state.actors[actor].sprites ?? []) imagePaths.push(`sprites/${actor}/${sprite}`)
  }
  for (const bg of state.backgrounds) imagePaths.push(`backgrounds/${bg}`)

  await Promise.all(
    imagePaths.map(async (path) => {
      const img = new Image()
      img.src = "/test-assets/" + path
      // survives cloneNode, so tests can tell which asset an element in the DOM came from
      img.dataset.testAsset = path
      await img.decode()
      images[path] = img
    })
  )

  // Playback is stubbed out below, so these never need to load.
  for (const asset of state.audioAssets) {
    const elem = new Audio()
    elem.dataset.testAsset = asset
    audio["audio/" + asset] = elem
  }

  return images
}

let harnessRoot: HTMLDivElement
let playCalls: PlayCall[]
const realPlay = HTMLMediaElement.prototype.play

// Chromium's autoplay policy rejects play() without a user gesture, and AudioRenderer does not
// catch that. Stubbing it also gives us a log of what the demo asked to play, and how.
beforeEach(() => {
  localStorage.clear()
  playCalls = []
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    playCalls.push({ asset: this.dataset.testAsset ?? this.src, loop: this.loop })
    return Promise.resolve()
  }

  document.body.innerHTML = ""
  harnessRoot = document.createElement("div")
  harnessRoot.id = "vn-div"
  harnessRoot.style.width = `${SCENE_WIDTH}px`
  harnessRoot.style.height = `${SCENE_HEIGHT}px`
  harnessRoot.innerHTML = VN_ACTIONS_HTML
  document.body.appendChild(harnessRoot)
})

afterEach(() => {
  HTMLMediaElement.prototype.play = realPlay
})

// Boots the demo exactly like playerIndex.ts does and waits for the first stop.
const startDemo = async (): Promise<Harness> => {
  const [state] = YamlParser.updateState(demoYaml, freshDemoState())
  const player = new VnPlayer(state)
  const renderer = new DomRenderer(harnessRoot, player)
  // The constructor already started rendering towards the first stop, so hook the callback up
  // before anything is awaited. Assets are only needed from the first advance on.
  const firstStop = nextStop(renderer, player)
  const images = await loadDemoAssets(renderer, state)
  await firstStop
  return { root: harnessRoot, player, renderer, images, playCalls, stopIndex: 0 }
}

// One user advance with the animations skipped: the first click starts the animated render, and
// every click after it lands while that render is still running, which re-renders straight to the
// end state without moving the player on. Exactly what an impatient player does, and it keeps a
// full walk of the demo down to a few hundred milliseconds instead of minutes.
//
// `stopped` has to be set synchronously from the finished callback: once the player is at rest the
// next click would advance it past the stop we are waiting for.
const advanceFast = async (h: Harness): Promise<void> => {
  let stopped = false
  const stop = new Promise<void>((resolve) => {
    const callback = () => {
      if (!h.player.state.stopAfterRender) return
      h.renderer.onFinishedCallbacks.splice(h.renderer.onFinishedCallbacks.indexOf(callback), 1)
      stopped = true
      resolve()
    }
    h.renderer.onFinishedCallbacks.push(callback)
  })

  h.renderer.advance()
  const deadline = performance.now() + 5000
  while (!stopped) {
    await sleep(1)
    if (stopped) break
    if (performance.now() > deadline) {
      throw new Error(
        `advance stalled at command ${h.player.state.commandIndex} ` +
          `(text: ${JSON.stringify(textBoxTextOrClosed(h.root))})`
      )
    }
    h.renderer.advance()
  }
  h.stopIndex++
  return stop
}

const advanceCollect = async (h: Harness, steps: number): Promise<string[]> => {
  const texts: string[] = []
  for (let i = 0; i < steps; i++) {
    await advanceFast(h)
    texts.push(textBoxTextOrClosed(h.root))
  }
  return texts
}

// Steps forward to the given index in STOPS_UP_TO_DECISION (0 is the first stop, which startDemo
// already reached) and checks every line passed along the way.
const advanceToStop = async (h: Harness, index: number): Promise<void> => {
  const from = h.stopIndex
  const texts = await advanceCollect(h, index - from)
  expect(texts).toEqual(STOPS_UP_TO_DECISION.slice(from + 1, index + 1))
}

const expectedSpriteTransform = (
  img: HTMLImageElement,
  x: number,
  y: number,
  anchorX: number,
  anchorY: number
): string => {
  const xPos = SCENE_WIDTH * x - img.width * anchorX
  const yPos = SCENE_HEIGHT * y - img.height * anchorY
  return `translate(${Math.round(xPos)}px, ${Math.round(yPos)}px)`
}

describe("demo story - script", () => {
  it("parses with only the three warnings the demo deliberately contains", async () => {
    const [state, errors] = YamlParser.updateState(demoYaml, freshDemoState())

    expect(errors.map((e) => `L${e.location.startLine}: ${e.message}`)).toEqual([
      "L74: ugh is not a recognized command.",
      "L94: Unrecognized item. A command should be a string or a single-keyed map.",
      "L97: Unrecognized item. A command should be a string or a single-keyed map.",
    ])
    expect(errors.every((e) => e.level === ErrorLevel.WARNING)).toBe(true)

    // The three warned-about items produce no command at all, so the story just skips them.
    expect(state.labels).toEqual({ loop: 14, asd: 38, bad: 48 })
    expect(state.commands).toHaveLength(55)
  })
})

describe("demo story - narrative", () => {
  it("stops on each line in order, loops the actor scene exactly twice, and reaches the decision", async () => {
    const h = await startDemo()

    expect(textBoxTextOrClosed(h.root)).toBe(STOPS_UP_TO_DECISION[0])
    const texts = await advanceCollect(h, STOPS_UP_TO_DECISION.length - 1)
    expect(texts).toEqual(STOPS_UP_TO_DECISION.slice(1))

    // $a drives the loop: incremented once per pass, so the conditional jump fires only the first time.
    expect(h.player.state.variables).toEqual({ a: 2 })
  }, 30000)

  it("plays the quoting-test branch after the first decision option", async () => {
    const h = await startDemo()
    await advanceToStop(h, STOPS_UP_TO_DECISION.length - 1)

    decisionItems(h.root)[0].click()
    await nextStop(h.renderer, h.player)
    expect(textBoxTextOrClosed(h.root)).toBe(STOPS_AFTER_GOOD_CHOICE[0])

    const texts = await advanceCollect(h, STOPS_AFTER_GOOD_CHOICE.length - 1)
    expect(texts).toEqual(STOPS_AFTER_GOOD_CHOICE.slice(1))
  }, 30000)

  it("plays the bad branch after the second decision option", async () => {
    const h = await startDemo()
    await advanceToStop(h, STOPS_UP_TO_DECISION.length - 1)

    decisionItems(h.root)[1].click()
    await nextStop(h.renderer, h.player)
    expect(textBoxTextOrClosed(h.root)).toBe(STOPS_AFTER_BAD_CHOICE[0])

    const texts = await advanceCollect(h, STOPS_AFTER_BAD_CHOICE.length - 1)
    expect(texts).toEqual(STOPS_AFTER_BAD_CHOICE.slice(1))
  }, 30000)

  it("renders the multiline YAML node as line breaks", async () => {
    const h = await startDemo()
    await advanceToStop(h, STOPS_UP_TO_DECISION.length - 1)
    decisionItems(h.root)[0].click()
    await nextStop(h.renderer, h.player)

    await advanceCollect(h, STOPS_AFTER_GOOD_CHOICE.indexOf(MULTILINE))

    const box = h.root.querySelector(".vn-adv-textbox") as HTMLDivElement
    // one span per character, and every "\n" character became a <br>
    expect(box.children).toHaveLength(MULTILINE.length)
    expect(box.querySelectorAll("br")).toHaveLength(3)
    expect(textBoxText(h.root)).toBe(MULTILINE)
  }, 30000)
})

describe("demo story - textbox", () => {
  it("has no textbox at the first stop, then opens one for the first line", async () => {
    const h = await startDemo()

    expect(h.root.querySelector(".vn-adv-textbox")).toBeNull()
    expect(nameTag(h.root)).toBeNull()
    expect(spriteElems(h.root)).toEqual([])
    expect(decisionItems(h.root)).toEqual([])
    expect(arrow(h.root).style.display).toBe("")

    await advanceFast(h)

    const box = h.root.querySelector(".vn-adv-textbox") as HTMLDivElement
    expect(box).not.toBeNull()
    expect(box.children).toHaveLength(FIRST_LINE.length) // one span per character
    expect(textBoxText(h.root)).toBe(FIRST_LINE)
  }, 30000)

  it("colors narrator text with the narrator's textColor and shows no name tag", async () => {
    const h = await startDemo()
    await advanceFast(h)

    expect(nameTag(h.root)).toBeNull()
    const spans = [...(h.root.querySelector(".vn-adv-textbox") as HTMLDivElement).children]
    const colors = new Set(spans.map((s) => getComputedStyle(s).color))
    expect([...colors]).toEqual(["rgb(96, 186, 255)"]) // #60baff
  }, 30000)

  it("types text out one character at a time and completes it on the next click", async () => {
    const h = await startDemo()
    await advanceFast(h) // FIRST_LINE - the textbox is now open, so the next line has no enter animation

    const stop = nextStop(h.renderer, h.player)
    h.renderer.advance() // animated: FOX_LINE is ~270 characters at 20ms each
    await sleep(400)

    const typing = [...(h.root.querySelector(".vn-adv-textbox") as HTMLDivElement).children]
    expect(typing).toHaveLength(FOX_LINE.length)
    const shown = typing.filter((s) => getComputedStyle(s).opacity === "1")
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.length).toBeLessThan(FOX_LINE.length)

    h.renderer.advance() // this click must complete the line, not advance past it
    await stop

    const done = [...(h.root.querySelector(".vn-adv-textbox") as HTMLDivElement).children]
    expect(done.every((s) => getComputedStyle(s).opacity === "1")).toBe(true)
    expect(textBoxText(h.root)).toBe(FOX_LINE)
  }, 30000)

  it("shows each actor's name tag and removes it for narrator lines", async () => {
    const h = await startDemo()

    await advanceToStop(h, STOPS_UP_TO_DECISION.indexOf("Here I am"))
    expect(nameTag(h.root)?.textContent).toBe("Actor") // A1's `name`, not its id
    expect(getComputedStyle(nameTag(h.root) as HTMLDivElement).color).toBe("rgb(128, 0, 128)") // purple

    await advanceFast(h) // "Just talking..." - same actor, tag stays put
    expect(nameTag(h.root)?.textContent).toBe("Actor")

    await advanceFast(h) // "And here I come" - A2
    expect(nameTag(h.root)?.textContent).toBe("Actor2")
    expect(getComputedStyle(nameTag(h.root) as HTMLDivElement).color).toBe("rgb(255, 165, 0)") // orange

    await advanceCollect(h, 3) // "Whee!", "Bye", "Bye bye, actors" (narrator)
    expect(textBoxTextOrClosed(h.root)).toBe("Bye bye, actors")
    expect(nameTag(h.root)).toBeNull()
  }, 30000)

  it("names an undefined actor by its key and falls back to the default tag color", async () => {
    const h = await startDemo()
    await advanceToStop(h, STOPS_UP_TO_DECISION.length - 1)
    decisionItems(h.root)[0].click()
    await nextStop(h.renderer, h.player)
    await advanceCollect(h, STOPS_AFTER_GOOD_CHOICE.indexOf("I'm just some random dude"))

    expect(nameTag(h.root)?.textContent).toBe("Rando")
    expect(getComputedStyle(nameTag(h.root) as HTMLDivElement).color).toBe("rgb(255, 255, 255)")

    await advanceFast(h)
    expect(textBoxTextOrClosed(h.root)).toBe("But I'm a defined actor")
    expect(nameTag(h.root)?.textContent).toBe("Actor")
  }, 30000)

  it("removes the textbox again on `textbox: close`", async () => {
    const h = await startDemo()
    const closeIndex = STOPS_UP_TO_DECISION.lastIndexOf(CLOSED)
    await advanceToStop(h, closeIndex - 1)

    expect(h.root.querySelector(".vn-adv-textbox")).not.toBeNull()
    await advanceFast(h)
    expect(h.root.querySelector(".vn-adv-textbox")).toBeNull()
    expect(nameTag(h.root)).toBeNull()

    await advanceFast(h) // the *anchor alias reopens it
    expect(textBoxText(h.root)).toBe("This is a YAML anchor")
    expect(nameTag(h.root)?.textContent).toBe("Actor")
  }, 30000)
})

describe("demo story - sprites", () => {
  it("shows, moves, swaps and hides the demo's actors", async () => {
    const h = await startDemo()
    const a1Idle = h.images["sprites/A1/idle.png"]
    const a1Two = h.images["sprites/A1/2.png"]
    const a2Idle = h.images["sprites/A2/idle.png"]

    // `show: {actor: A1, sprite: idle.png}` - centered, since x/y/anchors all default to 0.5
    await advanceToStop(h, STOPS_UP_TO_DECISION.indexOf("Here I am"))
    let sprites = liveSprites(h.root)
    expect(Object.keys(sprites)).toEqual(["A1"])
    expect(sprites["A1"].dataset.testAsset).toBe("sprites/A1/idle.png")
    expect(sprites["A1"].style.transform).toBe(expectedSpriteTransform(a1Idle, 0.5, 0.5, 0.5, 0.5))

    // `show: {actor: A1, sprite: 2.png, x: .2}` - crossfade to another sprite, further left
    await advanceFast(h)
    sprites = liveSprites(h.root)
    expect(Object.keys(sprites)).toEqual(["A1"])
    expect(sprites["A1"].dataset.testAsset).toBe("sprites/A1/2.png")
    expect(sprites["A1"].style.transform).toBe(expectedSpriteTransform(a1Two, 0.2, 0.5, 0.5, 0.5))
    expect(spriteElems(h.root)).toHaveLength(1) // the old element is gone, not just orphaned

    // `show: {actor: A2, ... x: 0, y: 0, anchorX: 0, anchorY: 0}` - top left corner
    await advanceFast(h)
    sprites = liveSprites(h.root)
    expect(Object.keys(sprites).sort()).toEqual(["A1", "A2"])
    expect(sprites["A2"].dataset.testAsset).toBe("sprites/A2/idle.png")
    expect(sprites["A2"].style.transform).toBe("translate(0px, 0px)")

    // `show: {actor: A2, ... x: 1, y: 1, anchorX: 1, anchorY: 1}` - bottom right corner
    await advanceFast(h)
    sprites = liveSprites(h.root)
    expect(sprites["A2"].style.transform).toBe(expectedSpriteTransform(a2Idle, 1, 1, 1, 1))

    await advanceFast(h) // "Bye"
    await advanceFast(h) // `hide: A2` then "Bye bye, actors"
    expect(textBoxTextOrClosed(h.root)).toBe("Bye bye, actors")
    expect(Object.keys(liveSprites(h.root))).toEqual(["A1"])
    expect(spriteElems(h.root)).toHaveLength(1)

    // `hide: A1` then the conditional jump back to `label: loop`, which re-shows A1
    await advanceFast(h)
    expect(textBoxTextOrClosed(h.root)).toBe("Here I am")
    const looped = liveSprites(h.root)
    expect(Object.keys(looped)).toEqual(["A1"])
    expect(looped["A1"].dataset.testAsset).toBe("sprites/A1/idle.png")
  }, 30000)

  it("keeps the DOM sprites in sync with state at every stop of the whole demo", async () => {
    const h = await startDemo()

    const violations: string[] = []
    h.renderer.onFinishedCallbacks.push(() => {
      if (!h.player.state.stopAfterRender) return
      const stateIds = Object.keys(h.player.state.animatableState.sprites).sort()
      const domIds = Object.keys(liveSprites(h.root)).sort()
      if (JSON.stringify(stateIds) !== JSON.stringify(domIds)) {
        violations.push(`at command ${h.player.state.commandIndex}: state=[${stateIds}] dom=[${domIds}]`)
      }
    })

    await advanceToStop(h, STOPS_UP_TO_DECISION.length - 1)
    decisionItems(h.root)[0].click()
    await nextStop(h.renderer, h.player)
    await advanceCollect(h, STOPS_AFTER_GOOD_CHOICE.length - 1)

    expect(violations).toEqual([])
  }, 30000)

  it("clears all sprites when the story hides them", async () => {
    const h = await startDemo()
    await advanceToStop(h, STOPS_UP_TO_DECISION.lastIndexOf(CLOSED))

    // `hide: A2` / `hide: A1` ran before the second-pass jump fell through
    expect(h.player.state.animatableState.sprites).toEqual({})
    expect(spriteElems(h.root)).toEqual([])
  }, 30000)
})

describe("demo story - decision", () => {
  it("renders both options with a staggered entry animation", async () => {
    const h = await startDemo()
    await advanceToStop(h, STOPS_UP_TO_DECISION.length - 2) // "This is a YAML anchor"

    // let this one play out fully, so the decision's entry animation actually runs
    const stop = nextStop(h.renderer, h.player)
    h.renderer.advance()
    await stop

    const items = decisionItems(h.root)
    expect(items.map((i) => i.textContent)).toEqual([OPTION_GOOD, OPTION_BAD])
    expect(items.map((i) => i.style.transform)).toEqual(["scaleY(1)", "scaleY(1)"])
    expect(items.map((i) => i.style.transitionDelay)).toEqual(["0ms", "300ms"])

    // the Say before a decision does not stop, so the question and the options appear together
    expect(textBoxText(h.root)).toBe(DECISION_QUESTION)

    // no "click to continue" arrow while a decision is pending, and skipping is not allowed
    expect(arrow(h.root).style.display).toBe("none")
    expect(skipAction(h.root).classList.contains("vn-action-disabled")).toBe(true)
  }, 30000)

  it("jumps to the chosen label, blinking the picked option, and clears the options", async () => {
    const h = await startDemo()
    await advanceToStop(h, STOPS_UP_TO_DECISION.length - 1)

    const items = decisionItems(h.root)
    const stop = nextStop(h.renderer, h.player)
    items[0].click()

    // the click blinks the picked option and locks input until the animation ends
    expect(items[0].classList.contains("vn-decision-item-blink")).toBe(true)
    expect(items[1].classList.contains("vn-decision-item-blink")).toBe(false)
    expect(h.renderer.ignoreInputs).toBe(true)

    await stop
    expect(textBoxTextOrClosed(h.root)).toBe("More YAML quoting tests...")
    expect(decisionItems(h.root)).toEqual([])
    expect(h.player.state.decision).toBeNull()
    expect(arrow(h.root).style.display).toBe("")
  }, 30000)

  it("takes the bad branch to `label: bad` for the second option", async () => {
    const h = await startDemo()
    await advanceToStop(h, STOPS_UP_TO_DECISION.length - 1)

    const stop = nextStop(h.renderer, h.player)
    decisionItems(h.root)[1].click()
    await stop

    expect(textBoxTextOrClosed(h.root)).toBe("That was a bad choice.")
    expect(decisionItems(h.root)).toEqual([])
  }, 30000)
})

describe("demo story - audio", () => {
  it("starts the non-looping bgm, restarts it looping once it ends, then swaps and stops it", async () => {
    const h = await startDemo()

    // `bgm: {audio: bgm/map01.ogg, loop: false}`
    await advanceToStop(h, STOPS_UP_TO_DECISION.indexOf("Wait for audio to stop"))
    expect(playCalls).toEqual([{ asset: "bgm/map01.ogg", loop: false }])
    expect(h.player.state.animatableState.audio).toEqual({ bgm: "bgm/map01.ogg", loopBgm: false, sfx: null })

    // the line asks the player to wait for the track to finish - simulate that
    const playing = h.renderer["audioRenderer"]["bgmElem"] as HTMLAudioElement
    expect(playing.loop).toBe(false)
    playing.dispatchEvent(new Event("ended"))
    expect(h.renderer["audioRenderer"]["bgmElem"]).toBeNull()

    // `bgm: "bgm/map01.ogg"` - same track, but looping this time, and nothing is playing
    await advanceFast(h)
    expect(textBoxTextOrClosed(h.root)).toBe("Looping audio")
    expect(playCalls).toEqual([
      { asset: "bgm/map01.ogg", loop: false },
      { asset: "bgm/map01.ogg", loop: true },
    ])

    // `bgm: "bgm/dayl_preview.ogg"` - the old track fades out first (1500ms), then the new one starts
    await advanceFast(h)
    expect(textBoxTextOrClosed(h.root)).toBe("Another song...")
    expect(h.player.state.animatableState.audio.bgm).toBe("bgm/dayl_preview.ogg")
    expect(playCalls).toHaveLength(2) // not yet - still crossfading
    await sleep(2000)
    expect(playCalls[2]).toEqual({ asset: "bgm/dayl_preview.ogg", loop: true })

    // `bgm: stop`
    await advanceFast(h)
    expect(textBoxTextOrClosed(h.root)).toBe("And now... Actors!")
    expect(h.player.state.animatableState.audio.bgm).toBeNull()
    expect(h.renderer["audioRenderer"]["bgmElem"]).toBeNull()
  }, 30000)

  it("fires the sfx once on the bad branch", async () => {
    const h = await startDemo()
    await advanceToStop(h, STOPS_UP_TO_DECISION.length - 1)

    const before = playCalls.length
    const stop = nextStop(h.renderer, h.player)
    decisionItems(h.root)[1].click()
    await stop

    expect(playCalls.slice(before)).toEqual([{ asset: "sfx/bigthump.ogg", loop: false }])

    // sfx is a one-shot: State.advance clears it again, and `sfx: "sfx/bigthump.ogg"` is followed
    // by two bg commands and a line before the story stops, so it is long gone by now
    expect(h.player.state.animatableState.audio.sfx).toBeNull()

    await advanceFast(h)
    expect(playCalls).toHaveLength(before + 1)
  }, 30000)
})

describe("demo story - background", () => {
  it("starts on the initial white background", async () => {
    const h = await startDemo()
    await nextFrame()
    await nextFrame()

    const canvas = bgCanvas(h.root)
    expect(canvas.width).toBe(SCENE_WIDTH)
    expect(canvas.height).toBe(SCENE_HEIGHT)
    expect(sampleRow(canvas, SCENE_HEIGHT / 2).every(isWhite)).toBe(true)
  }, 30000)

  it("reveals the first background in vertical slices (blinds)", async () => {
    const h = await startDemo()
    await nextFrame()

    // `bg: {image: a.png, transition: blinds, duration: 2000, ...}` then the first line
    const stop = nextStop(h.renderer, h.player)
    h.renderer.advance()
    await sleep(700)

    // mid-transition: some slices already show a.png, the rest are still the white it faded from
    const midRow = sampleRow(bgCanvas(h.root), SCENE_HEIGHT / 2)
    expect(midRow.some(isWhite)).toBe(true)
    expect(midRow.some((p) => !isWhite(p))).toBe(true)

    h.renderer.advance() // skip to the end state
    await stop
    await nextFrame()
    await nextFrame()

    expect(sampleRow(bgCanvas(h.root), SCENE_HEIGHT / 2).some(isWhite)).toBe(false)
    expect(textBoxText(h.root)).toBe(FIRST_LINE)
  }, 30000)

  it("keeps painting the background across the rest of the demo", async () => {
    const h = await startDemo()
    await advanceToStop(h, STOPS_UP_TO_DECISION.length - 1)
    await nextFrame()
    await nextFrame()

    // b.png is the last background set before the decision
    const row = sampleRow(bgCanvas(h.root), SCENE_HEIGHT / 2)
    expect(row.some((p) => p[3] > 0)).toBe(true)
  }, 30000)
})

describe("demo story - player actions", () => {
  it("only enables the skip action once the upcoming command has been seen", async () => {
    const h = await startDemo()

    // first pass through the actor scene: everything ahead is new
    await advanceToStop(h, STOPS_UP_TO_DECISION.indexOf("Here I am"))
    expect(skipAction(h.root).classList.contains("vn-action-disabled")).toBe(true)

    // second pass: the same commands, now seen, so skipping is allowed
    await advanceToStop(h, STOPS_UP_TO_DECISION.lastIndexOf("Here I am"))
    expect(skipAction(h.root).classList.contains("vn-action-disabled")).toBe(false)
  }, 30000)

  it("steps back a line when the back action is clicked", async () => {
    const h = await startDemo()
    await advanceToStop(h, STOPS_UP_TO_DECISION.indexOf("Wait for audio to stop"))

    const stop = nextStop(h.renderer, h.player)
    ;(h.root.querySelector(".vn-action-back") as HTMLDivElement).click()
    await stop

    expect(textBoxTextOrClosed(h.root)).toBe(FOX_LINE)

    // and forward again to the same line
    await advanceFast(h)
    expect(textBoxTextOrClosed(h.root)).toBe("Wait for audio to stop")
  }, 30000)

  it("persists seen commands under the demo's save id, so a reload remembers them", async () => {
    const h = await startDemo()
    expect(localStorage.getItem("vn-test")).toBeNull()

    await advanceToStop(h, STOPS_UP_TO_DECISION.indexOf("And now... Actors!"))

    // exactly what playerIndex.ts does on boot
    const saved = loadFromLocalStorage("test")
    expect(saved.saves).toEqual([])

    const [state] = YamlParser.updateState(demoYaml, freshDemoState())
    const reloaded = new VnPlayer(state, saved)
    expect(reloaded.state.seenCommands.contains(0)).toBe(true)
    expect(reloaded.state.seenCommands.contains(11)).toBe(true) // "Another song..."
    expect(reloaded.state.seenCommands.contains(54)).toBe(false) // the final jump, never reached
  }, 30000)
})
