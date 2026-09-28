import { beforeEach, describe, expect, it } from "vitest"
import { saveToLocalStorage } from "../../src/core/save"
import { ProjectPicker } from "../../src/picker/ProjectPicker"
import { walk } from "../../src/storage/opfs"
import { takeProjectLock } from "../../src/storage/projectLock"
import {
  createProject,
  listProjectDirectories,
  listProjects,
  readEditorState,
  readProject,
} from "../../src/storage/projectStore"
import { recoverProjects } from "../../src/storage/recoverProjects"
import { importFromUrl } from "../../src/storage/urlImport"
import { clearOpfsStore, storeRoot } from "../helpers/opfs"
import { immediately, NO_DEMO } from "../helpers/picker"
import { manifestNaming } from "../helpers/testManifest"
import { waitFor } from "../helpers/vnHarness"

// Import from URL against real fetch and real OPFS: the folders are ones vitest serves out of this
// repo, which makes them same-origin published folders - `test/fixtures/published/`, each one a way
// for a folder to be wrong. What an address means is settled in `test/unit/publishedFolder.test.ts`.

// A scratch directory no other suite uses - see test/helpers/opfs.ts.
const SCRATCH = "test-scratch-url-import"

// **Every fixture's id is this suite's**, because `navigator.locks` is origin-wide: the demo's id
// belongs to the one suite that adds the demo, and anything this suite imports it names itself.
const COMPLETE = "url-import-complete"

const FIXTURES = new URL("/test/fixtures/published/", location.href).href
const folder = (name: string): string => `${FIXTURES}${name}/`

// Every file a project holds, as paths inside it - which is what "exactly these files" is asserted
// over, rather than a list of the ones a test thought to check.
const filesOf = async (directory: string): Promise<string[]> => {
  const root = await storeRoot(SCRATCH)
  const paths: string[] = []
  for await (const file of walk(root, `projects/${directory}`)) paths.push(file.path)
  return paths.sort()
}

const expectRefused = async (address: string): Promise<{ problem: string; advice: string }> => {
  const result = await importFromUrl(address)
  if (result.kind !== "refused") throw new Error(`expected a refusal, got ${result.kind}`)
  return result
}

beforeEach(async () => {
  await clearOpfsStore(SCRATCH)
  window.localStorage.removeItem(`vn-save-${COMPLETE}`)
})

describe("importing a published folder from its address", () => {
  it("lands the folder as a new project holding its manifest, its script and exactly the files it declares", async () => {
    const result = await importFromUrl(folder("complete"))

    expect(result).toEqual({ kind: "imported", directory: COMPLETE, title: "A Published Story", overwrote: false })
    // Not the player's page beside them, and not a file the folder has that the manifest does not
    // name - and the background two ids declare, once.
    expect(await filesOf(COMPLETE)).toEqual([
      "assets/audio/thump.ogg",
      "assets/backgrounds/room.png",
      "assets/sprites/Guide/idle.png",
      "manifest.yaml",
      "script.yaml",
    ])
    expect((await readProject(COMPLETE)).scriptText).toContain("A line from a published folder.")
  })

  it("keeps the bytes it was sent", async () => {
    await importFromUrl(folder("complete"))

    const root = await storeRoot(SCRATCH)
    const stored = await (
      await (
        await (await root.getDirectoryHandle("projects")).getDirectoryHandle(COMPLETE)
      )
        .getDirectoryHandle("assets")
        .then((assets) => assets.getDirectoryHandle("audio"))
        .then((audio) => audio.getFileHandle("thump.ogg"))
    ).getFile()
    const served = await (await fetch(folder("complete") + "assets/audio/thump.ogg")).arrayBuffer()
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(new Uint8Array(served))
  })

  it("files the project under its manifest's id, whatever the address says", async () => {
    // `complete/` is the folder's name; `url-import-complete` is the project's.
    await importFromUrl(folder("complete") + "index.html?from=somewhere#top")

    expect((await listProjects()).map((project) => project.directory)).toEqual([COMPLETE])
  })

  it("dates the new project and drops the saves filed under its id", async () => {
    // Anything that claims an id drops its saves: a reader's playthrough of a published build with
    // the same id describes a story this project may not have.
    saveToLocalStorage(COMPLETE, { seenCommands: [], saves: [] } as never)

    await importFromUrl(folder("complete"))

    expect(window.localStorage.getItem(`vn-save-${COMPLETE}`)).toBeNull()
    expect((await readEditorState()).created?.[COMPLETE]).toBeDefined()
  })
})

describe("a published folder refused", () => {
  it("names the first declared file that is not there", async () => {
    const refusal = await expectRefused(folder("missing-file"))

    expect(refusal.problem).toBe("assets/backgrounds/gone.png is missing there")
    expect(refusal.advice).toBe("Nothing was written. The story declares that file, but the site does not have it.")
  })

  it("leaves nothing in the library once the picker has redrawn", async () => {
    // The file that failed came after one that arrived, so the import had written into its directory
    // before it stopped. That directory has no manifest - the commit is the last write - and the
    // sweep every picker render runs is what takes it away.
    await expectRefused(folder("missing-file"))
    await recoverProjects()

    expect(await listProjectDirectories()).toEqual([])
  })

  it("refuses a declared file the site answers with a web page", async () => {
    const refusal = await expectRefused(folder("html-file"))

    expect(refusal.problem).toBe("assets/backgrounds/page.html is missing there")
    expect(refusal.advice).toBe("Nothing was written. The site answered with a web page instead of that file.")
  })

  it("refuses an address with no manifest.yaml", async () => {
    const refusal = await expectRefused(folder("no-manifest"))

    expect(refusal.problem).toBe("there is no manifest.yaml at that address")
    expect(refusal.advice).toBe(
      "Nothing was written. Import from URL takes the address of a published WebVn story - the page that plays it."
    )
  })

  it("refuses a folder with no script.yaml", async () => {
    const refusal = await expectRefused(folder("no-script"))

    expect(refusal.problem).toBe("it has no script.yaml")
    expect(refusal.advice).toBe("Nothing was written. A published story holds its script beside its manifest.")
  })

  it("refuses a manifest that does not parse, with the parser's first error", async () => {
    const refusal = await expectRefused(folder("unparsed"))

    expect(refusal.problem).toBe("its manifest.yaml does not parse")
    expect(refusal.advice).toMatch(/^Nothing was written\. Line \d+: /)
  })

  it("refuses an address nothing answers, naming both things that look like that from inside a page", async () => {
    const refusal = await expectRefused("http://127.0.0.1:1/some-story/")

    expect(refusal.problem).toBe("it could not be reached, or it does not let other sites read its files")
    expect(refusal.advice).toBe(
      "Nothing was written. Check the address. If it is right, that site does not allow importing."
    )
  })

  it("leaves the library as it was after every refusal", async () => {
    await createProject("url-import-bystander", {
      manifestText: manifestNaming("url-import-bystander"),
      scriptText: "story:\n  - Mine\n",
    })

    for (const name of ["missing-file", "html-file", "no-manifest", "no-script", "unparsed"])
      await importFromUrl(folder(name))
    await recoverProjects()

    expect(await listProjectDirectories()).toEqual(["url-import-bystander"])
  })
})

describe("an id already in the library", () => {
  it("is refused, never overwritten, and nothing the folder declares is fetched", async () => {
    await createProject(COMPLETE, {
      manifestText: manifestNaming(COMPLETE, "Mine"),
      scriptText: "story:\n  - My own line\n",
    })
    performance.clearResourceTimings()

    const result = await importFromUrl(folder("complete"))

    expect(result).toEqual({ kind: "taken", directory: COMPLETE, title: "A Published Story" })
    expect(await readProject(COMPLETE)).toEqual({
      manifestText: manifestNaming(COMPLETE, "Mine"),
      scriptText: "story:\n  - My own line\n",
    })
    // The two YAML files have to be fetched to learn the id; nothing after them may be.
    const fetched = performance.getEntriesByType("resource").map((entry) => entry.name)
    expect(fetched.filter((name) => name.includes("/complete/assets/"))).toEqual([])
  })

  it("is refused while that project is open in another tab", async () => {
    const held = await takeProjectLock(COMPLETE)
    try {
      const refusal = await expectRefused(folder("complete"))

      expect(refusal.problem).toBe(`"${COMPLETE}" is open in another tab`)
      expect(refusal.advice).toBe("Nothing was imported. Close it there and try again.")
    } finally {
      await held?.release()
    }
    expect(await listProjectDirectories()).toEqual([])
  })
})

describe("the picker's Import from URL", () => {
  let pickerRoot: HTMLDivElement

  const dialog = (): HTMLDialogElement | null => document.querySelector("dialog.vn-dialog")
  const addressField = (): HTMLInputElement => dialog()?.querySelector("input") as HTMLInputElement
  const pressImport = (): void => (dialog()?.querySelector(".vn-dialog-confirm") as HTMLButtonElement).click()
  const problemBesideField = (): string | null =>
    (dialog()?.querySelector(".vn-dialog-hint-problem") as HTMLElement | null)?.textContent ?? null
  const banner = (): HTMLElement | null => pickerRoot.querySelector(".vn-picker-banner")
  const rowTitles = (): string[] =>
    [...pickerRoot.querySelectorAll(".vn-picker-title")].map((elem) => elem.textContent ?? "")

  const openImportDialog = async (): Promise<void> => {
    const picker = new ProjectPicker(pickerRoot, () => Promise.resolve(null), immediately, { demo: NO_DEMO })
    await picker.render()
    ;(pickerRoot.querySelector(".vn-picker-import-url") as HTMLButtonElement).click()
    await waitFor("the Import from URL dialog", () => dialog() !== null)
  }

  const typeAddress = (address: string): void => {
    addressField().value = address
    addressField().dispatchEvent(new Event("input", { bubbles: true }))
  }

  beforeEach(() => {
    document.body.innerHTML = ""
    pickerRoot = document.createElement("div")
    document.body.appendChild(pickerRoot)
  })

  it("imports the folder at the address typed, and stays on the picker with the row and the news", async () => {
    await openImportDialog()
    typeAddress(folder("complete"))
    pressImport()

    await waitFor("the imported row", () => rowTitles().includes("A Published Story"))
    await waitFor("the result banner", () => banner()?.classList.contains("vn-picker-result") ?? false)
    expect(banner()?.textContent).toBe(`${location.host} was imported. "A Published Story" is in your library.`)
  })

  it("refuses a player link beside the field, with what was typed still in it", async () => {
    await openImportDialog()
    const link = `${folder("complete")}player.html?vn=H4sIAAAAAAAAA41Sy27bMBC8`
    typeAddress(link)
    pressImport()

    expect(dialog()).not.toBeNull()
    expect(addressField().value).toBe(link)
    expect(problemBesideField()).toBe(
      "That is a player link. It carries a script but no art or audio - paste the address of the published folder instead."
    )
  })

  it("refuses an address that is not http or https beside the field", async () => {
    await openImportDialog()
    typeAddress("file:///home/someone/story/")
    pressImport()

    expect(dialog()).not.toBeNull()
    expect(problemBesideField()).toContain("https://")
  })

  it("puts what the network said in the banner, under the site's name", async () => {
    await openImportDialog()
    typeAddress(folder("missing-file"))
    pressImport()

    await waitFor("the refusal banner", () => banner()?.classList.contains("vn-picker-refusal") ?? false)
    expect(banner()?.textContent).toBe(
      `${location.host} was not imported: assets/backgrounds/gone.png is missing there. ` +
        "Nothing was written. The story declares that file, but the site does not have it."
    )
    // Drawn after the sweep, so the half-written directory is already gone.
    expect(await listProjectDirectories()).toEqual([])
  })

  it("refuses an id already in the library in the banner", async () => {
    await createProject(COMPLETE, { manifestText: manifestNaming(COMPLETE, "Mine"), scriptText: "story:\n  - Mine\n" })
    await openImportDialog()
    typeAddress(folder("complete"))
    pressImport()

    await waitFor("the refusal banner", () => banner()?.classList.contains("vn-picker-refusal") ?? false)
    expect(banner()?.textContent).toBe(
      `${location.host} was not imported: "A Published Story" is already in your library, under ${COMPLETE}. ` +
        "Nothing was written. To import it, delete or rename the existing project."
    )
  })

  it("does nothing when cancelled", async () => {
    await openImportDialog()
    typeAddress(folder("complete"))
    ;(dialog()?.querySelector(".vn-dialog-cancel") as HTMLButtonElement).click()

    await waitFor("the dialog to close", () => dialog() === null)
    expect(banner()).toBeNull()
    expect(await listProjectDirectories()).toEqual([])
  })
})
