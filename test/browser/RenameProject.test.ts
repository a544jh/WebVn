import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { AppShell } from "../../src/AppShell"
import { fakeNavigation, FakeNavigation } from "../helpers/navigation"
import { readBlob, writeFile } from "../../src/storage/opfs"
import { takeProjectLock } from "../../src/storage/projectLock"
import {
  createProject,
  listProjects,
  readEditorState,
  readProject,
  renameProject,
  writeEditorState,
} from "../../src/storage/projectStore"
import { manifestNaming } from "../helpers/testManifest"
import { clearOpfsStore, storeRoot } from "../helpers/opfs"
import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  releaseStoredEditorLock,
  settle,
  sleep,
  textBoxText,
  waitFor,
} from "../helpers/vnHarness"

// A scratch directory no other suite uses - see test/helpers/opfs.ts.
const SCRATCH = "test-scratch-rename"

// The directory follows the identity the manifest declares. Two halves: the store's move, whose
// ordering exists so every crash state is recoverable, and the session swap around it, whose
// ordering exists so nothing is torn down until every way of refusing has been taken.

const FROM = "old-name"
const TO = "new-name"

const SCRIPT = "story:\n  - A line\n  - Another line\n  - A third line\n  - A fourth line\n"

const makeProject = async (id: string): Promise<void> => {
  await createProject(id, { manifestText: manifestNaming(id, "A Story"), scriptText: SCRIPT })
  await writeFile(await storeRoot(SCRATCH), `projects/${id}/assets/backgrounds/a.png`, new Blob(["pretend-png"]))
}

const directories = async (): Promise<string[]> => (await listProjects()).map((p) => p.directory).sort()

beforeEach(async () => {
  await releaseStoredEditorLock()
  await clearOpfsStore(SCRATCH)
  await makeProject(FROM)
})

describe("the store's half of a rename", () => {
  it("leaves exactly one project, under the new directory, with everything intact", async () => {
    await renameProject(FROM, TO, manifestNaming(TO, "A Story"))

    expect(await directories()).toEqual([TO])
    const files = await readProject(TO)
    expect(files.manifestText).toContain(`id: ${TO}`)
    expect(files.scriptText).toBe(SCRIPT)
    const asset = await readBlob(await storeRoot(SCRATCH), `projects/${TO}/assets/backgrounds/a.png`)
    expect(await asset.text()).toBe("pretend-png")
  })

  it("writes the marker before the copy and clears it after the delete", async () => {
    // Sampled mid-flight rather than inferred from the ends: ticket 05's recovery reads this marker,
    // and a marker written after the copy would describe a state that had already happened.
    const markers: Array<string | undefined> = []
    const watch = setInterval(() => void readEditorState().then((s) => markers.push(s.pendingRename?.to)), 1)

    await renameProject(FROM, TO, manifestNaming(TO, "A Story"))
    clearInterval(watch)
    await sleep(30)

    expect(markers).toContain(TO)
    expect((await readEditorState()).pendingRename).toBeUndefined()
  })

  it("gives the destination no manifest until the copy is otherwise complete", async () => {
    // The invariant the whole ordering buys, and the one every recovery state in ticket 05 turns on:
    // before the commit the destination has no manifest and is therefore garbage by the store's own
    // rule, and after it, it is a valid project. There is no third state to guess about.
    //
    // Sampled rather than proved - two cheap reads per tick, over enough files that the copy spans
    // many of them. The manifest existing beside a destination that is still missing the last asset
    // is the state that must never be seen, and a manifest written any earlier would show it on
    // nearly every sample.
    const root = await storeRoot(SCRATCH)
    const last = "assets/backgrounds/b23.png"
    for (let n = 0; n < 24; n++) {
      await writeFile(root, `projects/${FROM}/assets/backgrounds/b${n}.png`, new Blob([`bytes-${n}`]))
    }

    const has = (path: string): Promise<boolean> =>
      readBlob(root, `projects/${TO}/${path}`).then(
        () => true,
        () => false
      )
    const committedEarly: boolean[] = []
    const watch = setInterval(() => {
      void Promise.all([has("manifest.yaml"), has(last)]).then(([manifest, complete]) =>
        committedEarly.push(manifest && !complete)
      )
    }, 3)

    await renameProject(FROM, TO, manifestNaming(TO, "A Story"))
    clearInterval(watch)
    await sleep(40)

    // The samples are worth nothing if the copy finished before any were taken.
    expect(committedEarly.length).toBeGreaterThan(3)
    expect(committedEarly).not.toContain(true)
    expect((await readProject(TO)).manifestText).toContain(`id: ${TO}`)
  })

  it("carries the bookkeeping to the new directory and forgets the old one", async () => {
    // Without this a renamed project has no recorded creation, which puts it in the undated bucket
    // the picker sorts first - so renaming would send a project to the top of the library.
    await writeEditorState({
      created: { [FROM]: "2026-01-01T00:00:00.000Z" },
      lastOpened: { [FROM]: "2026-02-02T00:00:00.000Z" },
    })

    await renameProject(FROM, TO, manifestNaming(TO, "A Story"))

    const { created, lastOpened } = await readEditorState()
    expect(created).toEqual({ [TO]: "2026-01-01T00:00:00.000Z" })
    expect(lastOpened).toEqual({ [TO]: "2026-02-02T00:00:00.000Z" })
  })

  it("destroys a destination that already exists, before the marker is written", async () => {
    await makeProject(TO)
    await writeFile(await storeRoot(SCRATCH), `projects/${TO}/assets/backgrounds/gone.png`, new Blob(["doomed"]))

    await renameProject(FROM, TO, manifestNaming(TO, "A Story"))

    expect(await directories()).toEqual([TO])
    // The overwritten project's own files are gone rather than merged with the incoming ones.
    await expect(readBlob(await storeRoot(SCRATCH), `projects/${TO}/assets/backgrounds/gone.png`)).rejects.toThrow()
  })
})

// The session swap, over the markup src/index.html ships.
let elements: {
  pickerDiv: HTMLDivElement
  sessionDiv: HTMLDivElement
  vnDiv: HTMLDivElement
  vnEditorDiv: HTMLDivElement
}
let shell: AppShell | null = null
// The address bar this shell writes to, so a rename can be asked what it did with it.
let navigation: FakeNavigation
// How many times the shell put a project down. A close is not idempotent - it releases the lock and
// tears the renderer down - so "once" is the assertion, not "at least once".
let closes = 0

const mountPage = (): void => {
  localStorage.clear()
  document.body.innerHTML = ""
  const pickerDiv = document.createElement("div")
  const sessionDiv = document.createElement("div")
  sessionDiv.hidden = true
  const vnDiv = document.createElement("div")
  vnDiv.id = "vn-div"
  vnDiv.style.width = `${SCENE_WIDTH}px`
  vnDiv.style.height = `${SCENE_HEIGHT}px`
  const vnEditorDiv = document.createElement("div")
  sessionDiv.append(vnDiv, vnEditorDiv)
  document.body.append(pickerDiv, sessionDiv)
  elements = { pickerDiv, sessionDiv, vnDiv, vnEditorDiv }
}

const openShell = async (directory: string): Promise<AppShell> => {
  mountPage()
  navigation = fakeNavigation()
  closes = 0
  shell = new AppShell(elements, { onOpen: () => undefined, onClose: () => closes++, navigation })
  // `start()`, not `showPicker()`: it is what src/index.ts calls, and it is what registers the shell
  // on the address bar. Reaching past it left `navigation.go` firing into nothing, which is a test
  // that races an event the shell was never listening for.
  await shell.start()
  const row = elements.pickerDiv.querySelector(`.vn-picker-open[data-vn-project="${directory}"]`) as HTMLButtonElement
  row.click()
  // The story, not merely the session: a session is set before its buffers are filled, and a test
  // that advances from here would lose its first click to a story that had not arrived.
  await waitFor("the story to be loaded", () => (shell?.getSession()?.player.state.commandIndex ?? 0) > 0)
  return shell
}

const dialog = (): HTMLDialogElement | null => document.querySelector("dialog.vn-dialog")
const dialogTitle = (): string => dialog()?.querySelector(".vn-dialog-title")?.textContent ?? ""
const dialogText = (): string =>
  [...(dialog()?.querySelectorAll(".vn-dialog-body") ?? [])].map((e) => e.textContent).join(" ")
const press = (which: "confirm" | "cancel"): void =>
  (dialog()?.querySelector(`.vn-dialog-${which}`) as HTMLButtonElement).click()

// Editing `id:` in the manifest buffer and leaving it, which is the trigger.
const editIdAndBlur = async (id: string): Promise<void> => {
  const cm = (elements.vnEditorDiv.querySelector(".CodeMirror") as unknown as { CodeMirror: CodeMirror.Editor })
    .CodeMirror
  ;(elements.vnEditorDiv.querySelector('.vn-editor-tab[data-vn-buffer="manifest"]') as HTMLButtonElement).click()
  cm.getDoc().setValue(manifestNaming(id, "A Story"))
  cm.focus()
  cm.getInputField().blur()
  await waitFor("the rename dialog", () => dialog() !== null)
}

afterEach(async () => {
  await shell?.getSession()?.close()
  shell = null
})

describe("renaming from the editor", () => {
  it("asks, naming both directories and what a published build's players lose", async () => {
    await openShell(FROM)
    await editIdAndBlur(TO)

    expect(dialogTitle()).toBe("Rename this project?")
    expect(dialogText()).toContain(`projects/${FROM}/`)
    expect(dialogText()).toContain(`projects/${TO}/`)
    // The author's own saves travel; the ones in other people's browsers, under a build already
    // published as `from`, are the half nothing local can reach.
    expect(dialogText()).toContain("your saves")
    expect(dialogText()).toContain("will not find their saves")
    press("cancel")
    await waitFor("the dialog to close", () => dialog() === null)
  })

  it("moves the project and reopens on it, without passing through the picker", async () => {
    const shell = await openShell(FROM)
    await editIdAndBlur(TO)
    press("confirm")
    await waitFor("the session to reopen renamed", () => shell.getSession()?.directory === TO)

    expect(await directories()).toEqual([TO])
    expect(shell.getSession()?.directory).toBe(TO)
    // The storer, the resolver and the lock all address the new directory, and the author never saw
    // the list.
    expect(elements.pickerDiv.hidden).toBe(true)
    expect(elements.sessionDiv.hidden).toBe(false)
    expect(await heldLocks()).toContain(`vn-project-${TO}`)
    expect(await heldLocks()).not.toContain(`vn-project-${FROM}`)
  })

  it("follows the project in the URL, replacing the entry rather than adding one", async () => {
    const shell = await openShell(FROM)
    expect(navigation.current()).toBe(FROM)

    await editIdAndBlur(TO)
    press("confirm")
    await waitFor("the session to reopen renamed", () => shell.getSession()?.directory === TO)

    // A reload now finds the project where it actually is.
    expect(navigation.current()).toBe(TO)
    // Replaced, not pushed: the project moved under the author, they did not navigate. The entry
    // overwritten is the one opening it pushed, so Back goes where the author came from rather than
    // to the old name. Only that entry: an older one naming the same project survives a rename, and
    // walking back to it gets the boot's "there is no project called that".
    expect(navigation.pushed).toEqual([FROM])
  })

  it("wins a race with a Back pressed while it is asking", async () => {
    // The one place two swaps genuinely overlap: a rename is long - it holds a modal - and a
    // `popstate` can arrive in the middle of it. The queue makes the Back wait, and reading the
    // address bar at its turn is what makes the wait harmless: by then the rename has moved the URL
    // to the new directory, so the Back finds the session already matching and does nothing.
    //
    // Swallowing the Back is the deliberate half of that. The alternative - acting on the bare URL
    // the Back put there - drew the picker under a URL naming the renamed project, which breaks the
    // one invariant the URL work is built on.
    const shell = await openShell(FROM)
    await editIdAndBlur(TO)

    // Back, while the dialog is still up.
    navigation.go(null)
    press("confirm")
    await waitFor("the session to reopen renamed", () => shell.getSession()?.directory === TO)
    await settle()

    expect(shell.getSession()?.directory).toBe(TO)
    // The view and the address bar agree, which is the whole point.
    expect(navigation.current()).toBe(TO)
    expect(elements.sessionDiv.hidden).toBe(false)
    expect(elements.pickerDiv.hidden).toBe(true)

    // The two that say the Back did not run *underneath* the rename. Unqueued, it closed the
    // session the rename was still holding - a second teardown and a second lock release - and drew
    // the list, and the end state converged anyway, which is why asserting only the end state was
    // not a test of anything.
    expect(closes).toBe(1)
    expect(elements.pickerDiv.children.length).toBe(0)
  })

  it("reverts the id alone when the author declines, keeping every other edit", async () => {
    const shell = await openShell(FROM)
    const cm = (elements.vnEditorDiv.querySelector(".CodeMirror") as unknown as { CodeMirror: CodeMirror.Editor })
      .CodeMirror
    ;(elements.vnEditorDiv.querySelector('.vn-editor-tab[data-vn-buffer="manifest"]') as HTMLButtonElement).click()
    cm.getDoc().setValue(`formatVersion: 1\nid: ${TO}\ntitle: A Renamed Title\nbackgrounds:\n  sky: sky.png\n`)
    cm.focus()
    cm.getInputField().blur()
    await waitFor("the rename dialog", () => dialog() !== null)

    press("cancel")
    await waitFor("the id to be put back", () =>
      (shell.getSession()?.editor.getManifestText() ?? "").includes(`id: ${FROM}`)
    )

    expect(await directories()).toEqual([FROM])
    const text = shell.getSession()?.editor.getManifestText() ?? ""
    expect(text).toContain(`id: ${FROM}`)
    // Everything the author changed apart from the one field is still theirs.
    expect(text).toContain("title: A Renamed Title")
    expect(text).toContain("sky: sky.png")
  })

  it("refuses before tearing anything down when the destination is open in another tab", async () => {
    await makeProject(TO)
    const held = await takeProjectLock(TO)
    if (held === null) throw new Error("the lock was already held before the test started")
    const shell = await openShell(FROM)

    await editIdAndBlur(TO)
    press("confirm")
    await waitFor("the overwrite question", () => dialogTitle() === `Overwrite "${TO}"?`)
    press("confirm")
    await waitFor("the refusal", () => dialogTitle() === "The project was not renamed")

    expect(dialogTitle()).toBe("The project was not renamed")
    expect(dialogText()).toContain("another tab")
    press("confirm")
    await waitFor("the id to be put back", () =>
      (shell.getSession()?.editor.getManifestText() ?? "").includes(`id: ${FROM}`)
    )

    // Left in the project they were editing, still able to type.
    expect(shell.getSession()?.directory).toBe(FROM)
    expect(await directories()).toEqual([FROM, TO].sort())
    expect(shell.getSession()?.editor.getManifestText()).toContain(`id: ${FROM}`)
    await held.release()
  })

  it("refuses up front when the copy would not fit, and changes nothing", async () => {
    // The old tree survives until the new one is complete, so a rename needs room for a second copy
    // and would otherwise die partway with QuotaExceededError. `persist()` does not help - that is
    // eviction, not quota.
    const shell = await openShell(FROM)
    await withEstimate({ quota: 1000, usage: 900 }, async () => {
      await editIdAndBlur(TO)
      press("confirm")
      await waitFor("the refusal", () => dialogTitle() === "The project was not renamed")

      expect(dialogTitle()).toBe("The project was not renamed")
      expect(dialogText()).toContain("free")
      expect(dialogText()).toContain("Nothing has been changed")
      press("confirm")
      await waitFor("the dialog to close", () => dialog() === null)
    })

    expect(await directories()).toEqual([FROM])
    expect(shell.getSession()?.directory).toBe(FROM)
    expect(shell.getSession()?.editor.getManifestText()).toContain(`id: ${FROM}`)
  })

  it("leaves the author where they were in the story", async () => {
    // A rename changes nothing about the story, so landing back at its first line would be the same
    // theatre as bouncing the author out to the picker - which this deliberately does not do.
    const shell = await openShell(FROM)
    await advanceThrough(shell, 3)
    const before = shell.getSession()?.player.state.commandIndex
    expect(textBoxText(elements.vnDiv)).toBe("A fourth line")

    await editIdAndBlur(TO)
    press("confirm")
    await waitFor("the session to reopen renamed", () => shell.getSession()?.directory === TO)

    expect(shell.getSession()?.directory).toBe(TO)
    expect(shell.getSession()?.player.state.commandIndex).toBe(before)
    expect(textBoxText(elements.vnDiv)).toBe("A fourth line")
    // And it is a real path rather than a teleport, so undo still walks back from here.
    shell.getSession()?.renderer.undo()
    await sleep(150)
    expect(textBoxText(elements.vnDiv)).toBe("A third line")
  })

  it("keeps what the player has already read, so skip mode still works", async () => {
    // A close flushes the buffers and not the player's save data, so this would otherwise be lost
    // between the last advance and the rename.
    const shell = await openShell(FROM)
    await advanceThrough(shell, 3)
    const seen = shell.getSession()?.player.state.seenCommands.toJSON()

    await editIdAndBlur(TO)
    press("confirm")
    await waitFor("the session to reopen renamed", () => shell.getSession()?.directory === TO)

    expect(shell.getSession()?.player.state.seenCommands.toJSON()).toEqual(seen)
  })

  it("takes the author's saves with the project", async () => {
    // A real save slot, made the way the pause menu makes one, rather than JSON planted behind the
    // session's back - the session's own data is what a rename has to carry.
    const shell = await openShell(FROM)
    await advanceThrough(shell, 2)
    shell.getSession()?.renderer.saveToSlot(0)
    const saved = shell.getSession()?.player.saves[0]

    await editIdAndBlur(TO)
    press("confirm")
    await waitFor("the session to reopen renamed", () => shell.getSession()?.directory === TO)

    expect(localStorage.getItem(`vn-save-${FROM}`)).toBe(null)
    expect(shell.getSession()?.player.saves).toEqual([saved])
    expect(JSON.parse(localStorage.getItem(`vn-save-${TO}`) ?? "null")?.saves).toEqual([saved])
  })

  it("destroys the overwritten project's saves rather than handing them to the renamed one", async () => {
    // The sharp edge. Save data is keyed `vn-save-<id>`, so without this the project that arrives at
    // the destination inherits the save slots and seen-command set of the project that was just
    // deleted - paths through a story it does not have. ROUGH_EDGES.md has what that costs: replay
    // throws loudly on a path that does not match, and SaveLoadMenu has no try/catch, so Load is
    // simply a dead button.
    await makeProject(TO)
    const shell = await openShell(FROM)
    localStorage.setItem(
      `vn-save-${TO}`,
      JSON.stringify({ seenCommands: [[0, 99]], saves: [{ timestamp: 9, path: [9] }] })
    )

    await editIdAndBlur(TO)
    press("confirm")
    await waitFor("the overwrite question", () => dialogTitle() === `Overwrite "${TO}"?`)
    press("confirm")
    await waitFor("the session to reopen renamed", () => shell.getSession()?.directory === TO)

    // What is under the destination's key afterwards is the renamed project's own - here, nothing
    // saved at all - and not one slot of the project that was destroyed.
    expect(shell.getSession()?.player.saves).toEqual([])
    expect(JSON.parse(localStorage.getItem(`vn-save-${TO}`) ?? "null")?.saves).toEqual([])
    expect(localStorage.getItem(`vn-save-${TO}`)).not.toContain("99")
  })

  it("asks a second question before overwriting, and declining it leaves both projects", async () => {
    await makeProject(TO)
    const shell = await openShell(FROM)

    await editIdAndBlur(TO)
    press("confirm")
    await waitFor("the overwrite question", () => dialogTitle() === `Overwrite "${TO}"?`)

    expect(dialogTitle()).toBe(`Overwrite "${TO}"?`)
    expect(dialogText()).toContain("cannot be recovered")
    press("cancel")
    await waitFor("the id to be put back", () =>
      (shell.getSession()?.editor.getManifestText() ?? "").includes(`id: ${FROM}`)
    )

    expect(await directories()).toEqual([FROM, TO].sort())
    expect(shell.getSession()?.directory).toBe(FROM)
  })
})

const heldLocks = async (): Promise<string[]> =>
  ((await navigator.locks.query()).held ?? []).map((info) => info.name ?? "")

// The browser's own answer about how much room is left, stood in for. There is no seam to inject
// here on purpose - `availableBytes` asks `navigator.storage` directly, the way `isSupported` and
// the lock do - so the test replaces the API for the length of one call.
const withEstimate = async (estimate: StorageEstimate, run: () => Promise<void>): Promise<void> => {
  const real = navigator.storage.estimate.bind(navigator.storage)
  navigator.storage.estimate = () => Promise.resolve(estimate)
  try {
    await run()
  } finally {
    navigator.storage.estimate = real
  }
}

// One click's worth of story at a time, waiting for each render to come to rest - a fixed sleep is
// what made the first version of the playhead test read two advances where it had made three.
const advanceThrough = async (shell: AppShell, steps: number): Promise<void> => {
  for (let step = 0; step < steps; step++) {
    const session = shell.getSession()
    if (session === null) throw new Error("no project is open")
    const stopped = new Promise<void>((resolve) => {
      const done = (): void => {
        if (!session.player.state.stopAfterRender) return
        session.renderer.onFinishedCallbacks.splice(session.renderer.onFinishedCallbacks.indexOf(done), 1)
        resolve()
      }
      session.renderer.onFinishedCallbacks.push(done)
    })
    session.renderer.advance()
    await stopped
  }
}
