import { beforeEach, describe, expect, it } from "vitest"
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
  return { ...booted, root, editorRoot }
}

beforeEach(async () => {
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
