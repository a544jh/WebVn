import { beforeEach, describe, expect, it } from "vitest"
import { saveToLocalStorage } from "../../src/core/save"
import { demoManifest } from "../../src/demoStory"
import { ProjectPicker } from "../../src/picker/ProjectPicker"
import { publishedFiles } from "../../src/publishedFolder"
import { walk } from "../../src/storage/opfs"
import { takeProjectLock } from "../../src/storage/projectLock"
import { createProject, listProjects, readEditorState, readProject } from "../../src/storage/projectStore"
import { clearOpfsStore, storeRoot } from "../helpers/opfs"
import { immediately } from "../helpers/picker"
import { manifestNaming } from "../helpers/testManifest"
import { releaseStoredEditorLock, startEditorFromStore, waitFor } from "../helpers/vnHarness"

// Add demo project, which is a URL import of the demo the app is deployed beside. Here that is the
// `test-assets/` folder vitest serves, which is what CopyPlugin publishes into `dist/`.
//
// **The one suite that adds the real demo.** Its directory is fixed at `webvn-demo`, every add takes
// that directory's project lock, and `navigator.locks` is origin-wide - so a second suite adding it
// would contend with this one for the lock and be refused as "open in another tab" roughly whenever
// the two ran at once. Every other suite imports a fixture whose id is its own.

// A scratch directory no other suite uses - see test/helpers/opfs.ts.
const SCRATCH = "test-scratch-demo-project"

const DEMO_FOLDER = new URL("/test-assets/", location.href).href
const DEMO = demoManifest.id

let pickerRoot: HTMLDivElement

const newPicker = (): ProjectPicker =>
  new ProjectPicker(pickerRoot, () => Promise.resolve(null), immediately, { demoFolder: DEMO_FOLDER })

const demoButton = (): HTMLButtonElement | null => pickerRoot.querySelector(".vn-picker-demo")
const rowTitles = (): string[] =>
  [...pickerRoot.querySelectorAll(".vn-picker-title")].map((elem) => elem.textContent ?? "")
const banner = (): HTMLElement | null => pickerRoot.querySelector(".vn-picker-banner")
const bannerSays = (tone: "refusal" | "result"): boolean => banner()?.classList.contains(`vn-picker-${tone}`) ?? false

const addDemo = async (): Promise<void> => {
  const picker = newPicker()
  await picker.render()
  demoButton()?.click()
  await waitFor("the add to finish", () => banner() !== null && demoButton()?.disabled === false)
}

const filesOf = async (directory: string): Promise<string[]> => {
  const root = await storeRoot(SCRATCH)
  const paths: string[] = []
  for await (const file of walk(root, `projects/${directory}`)) paths.push(file.path)
  return paths.sort()
}

beforeEach(async () => {
  await releaseStoredEditorLock()
  await clearOpfsStore(SCRATCH)
  window.localStorage.removeItem(`vn-save-${DEMO}`)
  document.body.innerHTML = ""
  pickerRoot = document.createElement("div")
  document.body.appendChild(pickerRoot)
})

describe("Add demo project", () => {
  it("lands the demo from the folder the app is deployed beside, every declared file with it", async () => {
    await addDemo()

    expect(await listProjects()).toEqual([{ directory: DEMO, id: DEMO, title: demoManifest.title }])
    // Exactly the published folder, which is the same list publish writes: the demo's manifest, its
    // script, and every file its manifest declares - and none of the player's files beside them.
    expect(await filesOf(DEMO)).toEqual([...publishedFiles(demoManifest)].sort())
    expect((await readProject(DEMO)).scriptText).toContain("This is WebVn")
  })

  it("leaves the author on the picker with the row and the news, and the button still there", async () => {
    await addDemo()

    expect(rowTitles()).toEqual([demoManifest.title])
    expect(bannerSays("result")).toBe(true)
    expect(banner()?.textContent).toBe(`The demo was added. "${demoManifest.title}" is in your library.`)
    expect(demoButton()).not.toBe(null)
  })

  it("dates the demo and drops the saves filed under its id", async () => {
    // Including a reader's saves from `player.html` on the same origin, which on the deployed site is
    // this one: anything that claims an id drops its saves.
    saveToLocalStorage(DEMO, { seenCommands: [], saves: [] } as never)

    await addDemo()

    expect(window.localStorage.getItem(`vn-save-${DEMO}`)).toBeNull()
    expect((await readEditorState()).created?.[DEMO]).toBeDefined()
  })

  it("is shown while the demo is listed", async () => {
    await createProject(DEMO, { manifestText: manifestNaming(DEMO, "Mine"), scriptText: "story:\n  - Mine\n" })

    await newPicker().render()

    expect(demoButton()).not.toBe(null)
  })

  it("is refused a second time, and the demo already there is untouched", async () => {
    await createProject(DEMO, { manifestText: manifestNaming(DEMO, "Tinkered"), scriptText: "story:\n  - Mine\n" })

    await addDemo()

    expect(bannerSays("refusal")).toBe(true)
    expect(banner()?.textContent).toBe(
      `The demo was not added: ${demoManifest.title} is already in your library, under ${DEMO}. ` +
        "To add it, delete or rename the existing project."
    )
    expect(await readProject(DEMO)).toEqual({
      manifestText: manifestNaming(DEMO, "Tinkered"),
      scriptText: "story:\n  - Mine\n",
    })
  })

  it("is refused while the demo is open in another tab, and writes nothing", async () => {
    const held = await takeProjectLock(DEMO)
    if (held === null) throw new Error("the demo lock was already held before the test started")
    try {
      await addDemo()

      expect(bannerSays("refusal")).toBe(true)
      expect(banner()?.textContent).toContain("is open in another tab")
      expect(await listProjects()).toEqual([])
    } finally {
      await held.release()
    }
  })
})

describe("the demo, once added", () => {
  it("opens playable in the editor", async () => {
    await addDemo()

    const started = await startEditorFromStore(DEMO)

    // Reaching this line is already most of the proof - the harness awaits a render that finished
    // with the player stopped, which a story that failed to build or a sub-renderer that threw never
    // produces. The demo opens with `textbox: close`, so there is no ADV box to read at its first stop.
    expect(started.editor.isManifestValid()).toBe(true)
    expect(started.player.state.title).toBe(demoManifest.title)
    expect(started.player.state.commandIndex).toBeGreaterThan(0)
    // Every declared file arrived, so the editor has nothing to mark missing.
    expect(await started.renderer.loadAssets(started.player.state)).toEqual([])
  })
})
