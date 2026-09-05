import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { bootEditor, BootedEditor } from "../../src/editorBoot"
import { createProject, readProject } from "../../src/storage/projectStore"
import { clearOpfsStore } from "../helpers/opfs"
import {
  advanceVn,
  createVnRoot,
  nextStop,
  releaseStoredEditorLock,
  settle,
  sleep,
  textBoxText,
  typeCharacter,
} from "../helpers/vnHarness"

// A scratch directory no other suite uses - see test/helpers/opfs.ts.
const SCRATCH = "test-scratch-close-project"

// Putting a project down. A page load used to be the only teardown there was: nothing released the
// lock, nothing stopped the storer, the renderer kept two document listeners and two timers, and
// both roots kept whatever was mounted in them. This is the prefactor every remount rides on, so
// every test here boots twice into the same elements or asserts on what the first boot let go of.

// Two projects, because half of this is about what a *superseded* session does.
const A = "close-test-a"
const B = "close-test-b"

const manifestFor = (id: string): string => `formatVersion: 1\nid: ${id}\ntitle: ${id}\n`

const SCRIPT = "story:\n  - First line\n  - Second line\n"

// A project with music, for the teardown that has to silence it.
const MUSICAL_MANIFEST = `formatVersion: 1
id: ${"close-test-a"}
title: With Music
audioAssets:
  theme: bgm/theme.ogg
`

// The music starts on the *second* command, so the boot's own run to the first stop does not reach
// it - the asset is injected in between, since nothing here has a real file to decode.
// A background mid-pan, which is what keeps the render loop asking for frames. The line in front of
// it matters: the editor loads a script unanimated, so a `bg` the boot walks past jumps straight to
// its end state and asks for nothing. Reaching it by advancing renders it animated, the way clicking
// through the preview does.
const PANNING_SCRIPT = `story:
  - Before the pan
  - bg:
      image: "#123456"
      transition: fade
      duration: 0
      pan:
        from: [0, 0, 100, 100]
        to: [0, 0, 2000, 2000]
        duration: 10000
  - Panning
`

const MUSICAL_SCRIPT = `story:
  - Before the music
  - bgm:
      audio: theme
  - Playing
`

const heldLockNames = async (): Promise<string[]> =>
  ((await navigator.locks.query()).held ?? []).map((info) => info.name ?? "")

let root: HTMLDivElement
let editorRoot: HTMLDivElement

// The same shape test/helpers/vnHarness.ts's StartedEditor has, so typeCharacter and advanceVn read
// it - plus the boot's own handles, which is what these tests are about.
interface OpenProject extends BootedEditor {
  root: HTMLDivElement
  editorRoot: HTMLDivElement
}

// bootEditor into the elements this suite holds, rather than the harness's fresh ones: a remount
// into the *same* elements is the thing being tested.
const open = async (directory: string): Promise<OpenProject> => {
  const booted = await bootEditor({ vnDiv: root, vnEditorDiv: editorRoot }, directory)
  if (booted.kind === "refused") throw new Error("the editor refused to boot: " + booted.reason)
  const firstStop = nextStop(booted.renderer, booted.player)
  await booted.openProject()
  await firstStop
  opened = { ...booted, root, editorRoot }
  return opened
}

// Chromium's autoplay policy rejects play() without a user gesture, and AudioRenderer does not catch
// that - so it is stubbed, which also gives a log of what was started and what was stopped.
let played: HTMLMediaElement[]
let paused: HTMLMediaElement[]
const realPlay = HTMLMediaElement.prototype.play
const realPause = HTMLMediaElement.prototype.pause

// Whatever a test left open, so one failure cannot hold a lock and refuse every boot after it.
let opened: OpenProject | null = null

afterEach(async () => {
  HTMLMediaElement.prototype.play = realPlay
  HTMLMediaElement.prototype.pause = realPause
  await opened?.close()
  opened = null
})

beforeEach(async () => {
  played = []
  paused = []
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    played.push(this)
    return Promise.resolve()
  }
  HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
    paused.push(this)
  }

  // A previous suite's boot still holds its lock - a real tab releases by going away, and a test
  // file is one tab for its whole run.
  await releaseStoredEditorLock()
  await clearOpfsStore(SCRATCH)
  await createProject(A, { manifestText: manifestFor(A), scriptText: SCRIPT })
  await createProject(B, { manifestText: manifestFor(B), scriptText: SCRIPT })

  root = createVnRoot({ actions: true })
  editorRoot = document.createElement("div")
  document.body.appendChild(editorRoot)
})

describe("closing a project", () => {
  it("stops the music", async () => {
    // Audio is the one part of a session that does not live in the vn root: the loaders hand out
    // detached `<audio>` clones, which play perfectly well without ever being in the document. So
    // restoring the root's markup - which is what puts every other rendered thing away - leaves a
    // looping track playing over whatever replaced the project.
    await createProject(A, { manifestText: MUSICAL_MANIFEST, scriptText: MUSICAL_SCRIPT })
    const booted = await open(A)
    // Injected rather than loaded: playback is stubbed, so this never needs to decode.
    const loader = booted.renderer["audioLoader"] as unknown as { assets: Record<string, HTMLAudioElement> }
    loader.assets["assets/audio/bgm/theme.ogg"] = new Audio()

    await advanceVn(booted)
    expect(played).toHaveLength(1)
    expect(paused).toHaveLength(0)

    await booted.close()

    // Everything this session started is stopped - and immediately, not faded: a graceful fade-out
    // of a project the author has already left is a second and a half of a story that is gone.
    expect(paused).toEqual(played)
  })

  it("releases the lock, so the same project can be opened again", async () => {
    const booted = await open(A)
    expect(await heldLockNames()).toContain(`vn-project-${A}`)

    await booted.close()

    expect(await heldLockNames()).not.toContain(`vn-project-${A}`)
    const again = await open(A)
    expect(again.directory).toBe(A)
    await again.close()
  })

  it("writes what was typed but not yet stored", async () => {
    // The flush is what makes closing lossless: an author who types and immediately leaves has not
    // waited out the debounce, and the interval's worth of typing is theirs.
    const booted = await open(A)
    typeCharacter(booted, "  - Typed and closed straight away\n")

    await booted.close()

    expect((await readProject(A)).scriptText).toContain("Typed and closed straight away")
  })

  it("stops answering the page's flush events", async () => {
    const booted = await open(A)
    await booted.close()

    // A stopped storer with something pending is the measured loss in miniature: its three
    // listeners used to outlive the session, so a later page event queued its older text behind
    // whatever the live session had already written.
    booted.storing.changed("script", "story:\n  - Text from a storer that was stopped\n")

    editorRoot.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    window.dispatchEvent(new Event("pagehide"))
    await asHiddenDocument(() => document.dispatchEvent(new Event("visibilitychange")))
    await sleep(100)

    expect((await readProject(A)).scriptText).toBe(SCRIPT)
  })

  it("opens a project on the newest text after switching away and back", async () => {
    // The measured loss, end to end. Boot A, type without waiting out the debounce, close, work in
    // B, and come back: A used to be reopened over text an abandoned storer wrote after the fact.
    const a = await open(A)
    typeCharacter(a, "  - Typed into A\n")
    await a.close()

    const b = await open(B)
    typeCharacter(b, "  - Typed into B\n")
    await b.close()

    const again = await open(A)
    // Long enough for anything still listening to have had its turn.
    await sleep(100)

    expect((await readProject(A)).scriptText).toContain("Typed into A")
    expect((await readProject(A)).scriptText).not.toContain("Typed into B")
    expect(again.editor.getScript()).toContain("Typed into A")
    await again.close()
  })

  it("stops answering the keyboard", async () => {
    const booted = await open(A)
    await advanceVn(booted)
    expect(textBoxText(root)).toBe("Second line")

    await booted.close()
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }))
    await settle()

    // PageUp is undo. A superseded renderer answering it would step a story nobody is looking at.
    expect(booted.player.state.commandIndex).toBe(2)
  })

  it("cancels autoplay and skip mode", async () => {
    const booted = await open(A)
    // Skip mode only runs over text already read, so walk the story and come back to the top.
    await advanceVn(booted)
    booted.renderer.undo()
    await settle()

    booted.renderer.enableAutoplay()
    booted.renderer.enterSkipMode()
    expect(booted.renderer.skipMode).toBe(true)
    const index = booted.player.state.commandIndex

    await booted.close()

    expect(booted.renderer.autoplayInterval).toBe(null)
    expect(booted.renderer.skipMode).toBe(false)
    // Several skip ticks' worth. A cancelled timer is one that never comes back.
    await sleep(300)
    expect(booted.player.state.commandIndex).toBe(index)
  })

  it("stops asking for animation frames", async () => {
    // `needMoreFrames = false` was not enough, and read as though it were: `renderFrame` reassigns
    // that field from the renderable on every tick, so a frame queued at teardown overwrote the
    // false and rescheduled as if nothing had happened - which is the only case a teardown of an
    // animation loop is for. A pan is what keeps the loop genuinely hungry; without one the
    // renderable reports it wants no more frames and any teardown at all looks like it worked.
    await createProject(A, { manifestText: manifestFor(A), scriptText: PANNING_SCRIPT })
    const booted = await open(A)
    await advanceVn(booted)

    const frames: number[] = []
    const realRaf = window.requestAnimationFrame
    window.requestAnimationFrame = (cb) => {
      frames.push(1)
      return realRaf(cb)
    }
    try {
      // The loop is running: a ten-second pan has plenty left to draw.
      await sleep(120)
      expect(frames.length).toBeGreaterThan(2)

      await booted.close()
      frames.length = 0
      await sleep(300)

      expect(frames).toHaveLength(0)
    } finally {
      window.requestAnimationFrame = realRaf
    }
  })

  it("paints nothing once it is closed, however late the caller arrives", async () => {
    // The net under every late continuation. A session is closed by a click that can land in the
    // middle of an asset load, and `loadScript` awaits that load before handing the story to
    // `loadStory` - so the story would otherwise be painted into a root the next session is about
    // to be given. Asserted through the two doors something outside the renderer can still reach.
    const booted = await open(A)
    expect(textBoxText(root)).toBe("First line")

    await booted.close()
    const before = root.innerHTML

    booted.renderer.render(true)
    booted.renderer.loadStory(booted.player.state, true)
    await settle()

    expect(root.innerHTML).toBe(before)
    expect(textBoxText(root)).toBe(null)
  })

  it("leaves one editor and one vn when the same elements are remounted", async () => {
    const first = await open(A)
    await first.close()
    const second = await open(A)

    expect(editorRoot.querySelectorAll(".CodeMirror").length).toBe(1)
    expect(root.querySelectorAll("#vn-actions").length).toBe(1)
    expect(root.querySelectorAll("#vn-sprite-renderer").length).toBe(1)
    expect(root.querySelectorAll("#vn-background-renderer").length).toBe(1)
    expect(root.querySelectorAll(".vn-arrow").length).toBe(1)

    // And one *listening* vn, which is what the counts above cannot show: two renderers over one
    // root would both advance on a single click.
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await settle()
    expect(textBoxText(root)).toBe("Second line")

    await second.close()
  })

  it("leaves the action bar working after a remount", async () => {
    // The vn root is restored to the markup it was handed rather than emptied: the action bar is
    // part of the page, and a second session without one is not a whole vn.
    const first = await open(A)
    await first.close()
    const second = await open(A)
    await advanceVn(second)
    expect(textBoxText(root)).toBe("Second line")
    ;(root.querySelector(".vn-action-back") as HTMLElement).click()
    await settle()

    expect(textBoxText(root)).toBe("First line")
    await second.close()
  })
})

// `visibilitychange` is guarded on the state rather than fired blind, so a test that wants to see
// the handler run has to make the document look hidden while the event goes out.
const asHiddenDocument = async (fire: () => void): Promise<void> => {
  const original = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState")
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
  try {
    fire()
  } finally {
    delete (document as unknown as Record<string, unknown>).visibilityState
    if (original !== undefined) Object.defineProperty(Document.prototype, "visibilityState", original)
  }
}
