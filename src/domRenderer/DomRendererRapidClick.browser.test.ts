import { beforeEach, describe, expect, it } from "vitest"
import { initialState, VnPlayer } from "../core/player"
import { YamlParser } from "../yamlParser/YamlParser"
import { DomRenderer } from "./DomRenderer"

// Long enough that its typing animation (characterDelay 20ms) is still running when the test clicks again.
const LINE_3 = "Line 3 is deliberately long so that its typing animation is still running when the next click arrives"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

const textBoxText = (root: HTMLDivElement): string | null => root.querySelector(".vn-adv-textbox")?.textContent ?? null

const spriteElems = (root: HTMLDivElement): HTMLImageElement[] =>
  [...root.querySelectorAll("#vn-sprite-renderer img")] as HTMLImageElement[]

const SPRITE_COLORS = ["#9b59b6", "#2980b9", "#27ae60", "#e67e22"]

// A labeled colored rectangle, so sprites are actually visible when watching the
// tests with --browser.headless=false.
const makeSpriteImage = async (label: string, color: string): Promise<HTMLImageElement> => {
  const canvas = document.createElement("canvas")
  canvas.width = 220
  canvas.height = 480
  const ctx = canvas.getContext("2d")
  if (ctx === null) throw new Error("No 2d canvas context")
  ctx.fillStyle = color
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = "white"
  ctx.font = "20px sans-serif"
  ctx.textAlign = "center"
  ctx.fillText(label, canvas.width / 2, canvas.height / 2)
  const img = new Image()
  img.src = canvas.toDataURL()
  img.dataset.testAsset = label
  await img.decode()
  return img
}

// Puts pre-decoded images straight into the renderer's private image loader so sprite
// commands render without network fetches. dataset.testAsset survives cloneNode, so
// tests can check which asset an element in the DOM came from.
const registerTestSprites = async (renderer: DomRenderer, paths: string[]): Promise<void> => {
  const assets = renderer["imageLoader"]["assets"]
  for (const [i, path] of paths.entries()) {
    assets[path] = await makeSpriteImage(path, SPRITE_COLORS[i % SPRITE_COLORS.length])
  }
}

describe("DomRenderer rapid clicking with sprites", () => {
  let root: HTMLDivElement

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ""
    root = document.createElement("div")
    root.id = "vn-div"
    root.style.width = "1280px"
    root.style.height = "720px"
    document.body.appendChild(root)
  })

  it("does not skip a stop or lose a sprite when clicks land during sprite animations", async () => {
    const script = `
story:
  - Line 1
  - show:
      actor: A1
      sprite: a.png
  - Line 2
  - show:
      actor: A1
      sprite: b.png
  - ${LINE_3}
  - hide: A1
  - Line 4
`
    const [state, errors] = YamlParser.updateState(script, initialState)
    expect(errors).toEqual([])

    const player = new VnPlayer(state)
    const renderer = new DomRenderer(root, player)
    await registerTestSprites(renderer, ["sprites/A1/a.png", "sprites/A1/b.png"])

    await nextStop(renderer, player)
    expect(textBoxText(root)).toBe("Line 1")

    // Click: show A1 a.png starts its 500ms fade-in.
    const stopAtLine2 = nextStop(renderer, player)
    renderer.advance()
    await sleep(50)
    // Rapid second click while the fade-in is running: skip to Line 2.
    renderer.advance()
    await stopAtLine2
    expect(textBoxText(root)).toBe("Line 2")

    // Click: show A1 b.png crossfades, then the loop auto-advances to Line 3.
    renderer.advance()
    // Crossfade (500ms) has finished, Line 3's typing (~2s) is still running.
    await sleep(700)
    // This click must complete Line 3's typing, NOT advance past it.
    // With stale render callbacks from the interrupted fade-in, `finished` is
    // wrongly true here, so this click used to apply `hide: A1` and run on to
    // Line 4 - the sprite vanished and a stop was skipped.
    renderer.advance()

    await sleep(1500)

    expect(textBoxText(root)).toBe(LINE_3)
    expect(player.state.animatableState.sprites["A1"]).toBeDefined()
    expect(player.state.animatableState.sprites["A1"].sprite).toBe("b.png")
    const elems = spriteElems(root)
    expect(elems.map((elem) => elem.dataset.vnSpriteId)).toEqual(["A1"])
    expect(elems[0].dataset.testAsset).toBe("sprites/A1/b.png")
  }, 10000)

  it("keeps DOM sprites in sync with state when hammering through the whole story", async () => {
    const script = `
story:
  - Line 1
  - show:
      actor: A1
      sprite: a.png
      x: 0.3
  - Line 2
  - show:
      actor: A1
      sprite: b.png
      x: 0.3
  - Line 3
  - show:
      actor: A2
      sprite: a.png
      x: 0.7
  - Line 4
  - show:
      actor: A2
      sprite: a.png
      x: 0.9
  - Line 5
  - hide: A1
  - Line 6
  - show:
      actor: A1
      sprite: a.png
  - Line 7
  - hide: A1
  - hide: A2
  - The end
`
    const [state, errors] = YamlParser.updateState(script, initialState)
    expect(errors).toEqual([])

    const player = new VnPlayer(state)
    const renderer = new DomRenderer(root, player)
    await registerTestSprites(renderer, ["sprites/A1/a.png", "sprites/A1/b.png", "sprites/A2/a.png"])

    // After every finished render pass at a stop, the id-bearing sprite elements
    // must match the sprites in state exactly (elements mid fade-out have no id).
    const violations: string[] = []
    renderer.onFinishedCallbacks.push(() => {
      const stateIds = Object.keys(player.state.animatableState.sprites).sort()
      const domIds = spriteElems(root)
        .map((elem) => elem.dataset.vnSpriteId)
        .filter((id): id is string => id !== undefined)
        .sort()
      if (JSON.stringify(stateIds) !== JSON.stringify(domIds)) {
        violations.push(`at command ${player.state.commandIndex}: state=[${stateIds}] dom=[${domIds}]`)
      }
    })

    await nextStop(renderer, player)

    const delays = [15, 40, 90, 140, 30, 60]
    let clicks = 0
    while (!(player.state.commandIndex >= player.state.commands.length && player.state.stopAfterRender)) {
      renderer.advance()
      clicks++
      expect(clicks).toBeLessThan(100)
      await sleep(delays[clicks % delays.length])
    }

    // Let all transitions and any stragglers settle.
    await sleep(1200)

    expect(violations).toEqual([])
    expect(textBoxText(root)).toBe("The end")
    expect(player.state.animatableState.sprites).toEqual({})
    expect(spriteElems(root)).toEqual([])
  }, 15000)
})
