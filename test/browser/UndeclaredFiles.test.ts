import { beforeEach, describe, expect, it } from "vitest"
import { exists } from "../../src/storage/opfs"
import { createProject, writeProjectFile } from "../../src/storage/projectStore"
import { YamlParser } from "../../src/yamlParser/YamlParser"
import { clearOpfsStore, storedManifest, storeRoot } from "../helpers/opfs"
import {
  blurEditor,
  releaseStoredEditorLock,
  servedAssets,
  settle,
  StartedEditor,
  startEditor,
  startEditorFromStore,
  typeManifest,
  waitFor,
} from "../helpers/vnHarness"

// Files under `assets/` that no declaration points at, in the asset panel - CONTEXT.md's _undeclared
// file_. `.scratch/asset-panel/issues/06` is the ticket, and the canvas's `AssetUndeclared`,
// `DeclareAsset`, `DeclareSprite`, `DeclareMissing` and `RemoveUndeclared` boards are what it draws.
// Which group a file lands in is pinned in `test/unit/undeclaredFiles.test.ts`; this is the panel
// drawing that, and the two writes it adds.

// Named after this suite: `navigator.locks` is origin-wide and knows nothing about scratch roots.
const SCRATCH = "undeclared-files-suite"
const PROJECT = "undeclared-files-project"

// `storm` points at a file that is not there, which is the commonest way an undeclared file appears:
// `file:` edited by hand, leaving the file it used to name behind.
const MANIFEST = `formatVersion: 1
id: undeclared-files
title: Undeclared Files
backgrounds:
  cliffs: a.png
  storm: storm-night.png
actors:
  A1:
    sprites:
      idle: idle.png
`

const SCRIPT = "story:\n  - A line.\n"

const LISTING = [
  // The project describing itself, which is never listed.
  "manifest.yaml",
  "script.yaml",
  "assets/backgrounds/a.png",
  "assets/backgrounds/storm.png",
  "assets/backgrounds/old/sketch.png",
  "assets/audio/gulls.ogg",
  "assets/sprites/A1/idle.png",
  "assets/sprites/A1/scared.png",
  "assets/sprites/Ghost/idle.png",
  "assets/sprites/ghost/x.png",
  "assets/notes.txt",
]

const start = (options: Parameters<typeof startEditor>[2] = {}) =>
  startEditor(MANIFEST, SCRIPT, { resolver: servedAssets(), taken: LISTING, ...options })

const undeclaredRow = (started: StartedEditor, path: string): HTMLElement | null =>
  started.panelRoot.querySelector(`.vn-asset-row[data-vn-undeclared="${path}"]`)

const declaredRow = (started: StartedEditor, key: string): HTMLElement | null =>
  started.panelRoot.querySelector(`.vn-asset-row[data-vn-asset="${key}"]`)

const header = (started: StartedEditor, key: string): HTMLElement | null =>
  started.panelRoot.querySelector(`.vn-asset-group[data-vn-asset-group="${key}"]`)

// The listing lands a moment after mount, so a suite waits for the row it is about to look at.
const waitForRow = async (started: StartedEditor, path: string): Promise<HTMLElement> => {
  await waitFor(`${path}'s row to appear`, () => undeclaredRow(started, path) !== null)
  return undeclaredRow(started, path) as HTMLElement
}

// The list as an author reads it, top to bottom: `# name trailing` for a header, the manifest key
// for a declared row, `~path` for an undeclared one.
const drawn = (started: StartedEditor): string[] =>
  [...(started.panelRoot.querySelector(".vn-asset-list")?.children ?? [])].map((child) => {
    const elem = child as HTMLElement
    if (elem.classList.contains("vn-asset-group")) {
      const trailing = elem.querySelector(".vn-asset-group-count, .vn-asset-group-note")?.textContent
      return `# ${elem.querySelector(".vn-asset-group-name")?.textContent}${
        trailing === undefined ? "" : " " + trailing
      }`
    }
    return elem.dataset.vnAsset ?? `~${elem.dataset.vnUndeclared}`
  })

const control = (started: StartedEditor, path: string, name: string): HTMLButtonElement | null =>
  undeclaredRow(started, path)?.querySelector(`.vn-asset-${name}`) ?? null

const openDialog = (): HTMLDialogElement | null => document.querySelector("dialog.vn-dialog")

const waitForDialog = async (): Promise<HTMLDialogElement> => {
  await waitFor("the dialog to open", () => openDialog() !== null)
  return openDialog() as HTMLDialogElement
}

const dialogText = (): string =>
  [...(openDialog()?.querySelectorAll(".vn-dialog-body") ?? [])].map((p) => p.textContent).join("\n")

const idInput = (): HTMLInputElement => openDialog()?.querySelector("input") as HTMLInputElement
const idHint = (): string => (openDialog()?.querySelector(".vn-dialog-hint") as HTMLElement).textContent ?? ""

const typeId = (value: string): void => {
  idInput().value = value
  idInput().dispatchEvent(new Event("input"))
}

const confirm = (): void => (openDialog()?.querySelector(".vn-dialog-confirm") as HTMLButtonElement).click()
const cancel = (): void => (openDialog()?.querySelector(".vn-dialog-cancel") as HTMLButtonElement).click()

describe("undeclared files in the asset panel", () => {
  it("draws each in the group its folder names, after the declared rows", async () => {
    const started = await start()
    await waitForRow(started, "assets/notes.txt")

    expect(drawn(started)).toEqual([
      // The count stays a count of declarations: two, with four rows under it.
      "# Backgrounds 2",
      "backgrounds/cliffs",
      "backgrounds/storm",
      "~assets/backgrounds/old/sketch.png",
      "~assets/backgrounds/storm.png",
      "# Audio 0",
      "~assets/audio/gulls.ogg",
      "# Actors 1",
      "# A1 1",
      "actors/A1/sprites/idle",
      "~assets/sprites/A1/scared.png",
      // A folder whose actor nobody declared says so where the count goes - and a lowercase one is
      // drawn too, though nothing could ever declare it.
      "# Ghost not declared",
      "~assets/sprites/Ghost/idle.png",
      "# ghost not declared",
      "~assets/sprites/ghost/x.png",
      // Last, and only because something is in it. Nothing outside assets/ is listed at all.
      "# Other files",
      "~assets/notes.txt",
    ])
  })

  it("names each by its path below its group's folder, and says it is not declared", async () => {
    const started = await start()
    const row = await waitForRow(started, "assets/backgrounds/old/sketch.png")

    expect(row.querySelector(".vn-asset-name")?.textContent).toBe("old/sketch.png")
    expect(row.querySelector(".vn-asset-undeclared-note")?.textContent).toBe("not declared")
    expect(undeclaredRow(started, "assets/notes.txt")?.querySelector(".vn-asset-name")?.textContent).toBe("notes.txt")
  })

  // Orange means a declared file is missing. An undeclared one is its opposite and changes nothing
  // about what plays, so it wears no status colour at all.
  it("wears no orange, beside a missing row that does", async () => {
    const started = await start()
    const row = await waitForRow(started, "assets/backgrounds/storm.png")
    await waitFor("storm-night.png to be reported missing", () =>
      Boolean(declaredRow(started, "backgrounds/storm")?.classList.contains("vn-asset-missing"))
    )

    expect(row.classList.contains("vn-asset-missing")).toBe(false)
    expect(getComputedStyle(row.querySelector(".vn-asset-name") as HTMLElement).color).toBe("rgb(102, 102, 102)")
    expect(header(started, "actors/Ghost")?.classList.contains("vn-asset-missing")).toBe(false)
  })

  it("offers Preview, Declare and Remove, never Replace - and no Declare where nothing could be declared", async () => {
    const started = await start()
    await waitForRow(started, "assets/notes.txt")

    for (const path of ["assets/backgrounds/storm.png", "assets/sprites/Ghost/idle.png"]) {
      expect(control(started, path, "preview")).not.toBeNull()
      expect(control(started, path, "declare")).not.toBeNull()
      expect(control(started, path, "remove")).not.toBeNull()
      expect(control(started, path, "replace")).toBeNull()
    }
    // Absent rather than disabled: in Other files, and under a folder no actor could be called.
    for (const path of ["assets/notes.txt", "assets/sprites/ghost/x.png"]) {
      expect(control(started, path, "preview")).not.toBeNull()
      expect(control(started, path, "declare")).toBeNull()
      expect(control(started, path, "remove")).not.toBeNull()
    }
  })

  // A fresh import of an archive with a bare manifest: "Nothing declared yet." over it would hide
  // exactly the files this exists to show.
  it("draws the groups rather than the empty state when the only files are undeclared", async () => {
    const bare = "formatVersion: 1\nid: undeclared-files\ntitle: Undeclared Files\n"
    const started = await startEditor(bare, SCRIPT, { taken: ["assets/backgrounds/x.png"] })
    await waitForRow(started, "assets/backgrounds/x.png")

    expect(started.panelRoot.querySelector(".vn-asset-empty")).toBeNull()
    expect(drawn(started)).toEqual(["# Backgrounds 0", "~assets/backgrounds/x.png", "# Audio 0", "# Actors 0"])
  })

  // `declaresActor`'s one rule: the engine has `default` and `narrator` either way, but the manifest
  // declares them only by declaring a sprite - and Declare on such a folder adds the actor just as it
  // would `Ghost`, so the dialog says so.
  it("draws a sprite folder for the engine's own actors as not declared, until they declare a sprite", async () => {
    const started = await start({ taken: [...LISTING, "assets/sprites/narrator/n.png"] })
    await waitForRow(started, "assets/sprites/narrator/n.png")

    expect(header(started, "actors/narrator")?.querySelector(".vn-asset-group-note")?.textContent).toBe("not declared")
    expect(header(started, "actors/narrator")?.querySelector(".vn-asset-group-count")).toBeNull()

    control(started, "assets/sprites/narrator/n.png", "declare")?.click()
    await waitForDialog()
    expect(dialogText()).toContain("narrator is not declared yet, so this declares the actor too.")
    confirm()

    await waitFor("the declared row to appear", () => declaredRow(started, "actors/narrator/sprites/n") !== null)
    expect(header(started, "actors/narrator")?.querySelector(".vn-asset-group-count")?.textContent).toBe("1")
  })

  it("is gated on the manifest parsing, except for preview", async () => {
    const started = await start()
    await waitForRow(started, "assets/backgrounds/storm.png")

    typeManifest(started, "formatVersion: 1\nid: undeclared-files\ntitle: [\n")
    await blurEditor(started)

    await waitFor("Declare to be gated", () =>
      Boolean(control(started, "assets/backgrounds/storm.png", "declare")?.disabled)
    )
    expect(control(started, "assets/backgrounds/storm.png", "declare")?.title).toContain("manifest.yaml does not parse")
    expect(control(started, "assets/backgrounds/storm.png", "remove")?.disabled).toBe(true)
    expect(control(started, "assets/backgrounds/storm.png", "preview")?.disabled).toBe(false)
  })
})

describe("declaring an undeclared file", () => {
  it("asks only for the id, prefilled from the file's name, and copies nothing", async () => {
    const written = new Map<string, Blob>()
    const started = await start({ written })
    await waitForRow(started, "assets/backgrounds/old/sketch.png")
    control(started, "assets/backgrounds/old/sketch.png", "declare")?.click()
    await waitForDialog()

    expect(openDialog()?.querySelectorAll("input, select")).toHaveLength(1)
    // The basename of the last segment, so a nested file offers `sketch` rather than `old/sketch`.
    expect(idInput().value).toBe("sketch")
    expect(dialogText()).toBe(
      "Declaring old/sketch.png as a background. It is already in this project, so nothing is copied."
    )
    expect(idHint()).toBe("What the script names. bg: sketch")
    confirm()

    await waitFor("the declared row to appear", () => declaredRow(started, "backgrounds/sketch") !== null)
    expect(undeclaredRow(started, "assets/backgrounds/old/sketch.png")).toBeNull()
    expect(started.editor.getManifestText()).toContain("  sketch: old/sketch.png\n")
    expect(written.size).toBe(0)
  })

  // No listing is read for this - an adoption changes what is declared and never what is on disk, and
  // the draw subtracts against the state it has by then.
  it("turns into the declared row when it is declared by hand", async () => {
    const started = await start()
    await waitForRow(started, "assets/audio/gulls.ogg")

    typeManifest(started, MANIFEST + "audioAssets:\n  gulls: gulls.ogg\n")
    await blurEditor(started)

    await waitFor("the declared row to appear", () => declaredRow(started, "audioAssets/gulls") !== null)
    expect(undeclaredRow(started, "assets/audio/gulls.ogg")).toBeNull()
  })

  // The commonest case, and the prefill lands on exactly the id that is taken: `file: storm.png`
  // edited to `storm-night.png` leaves `storm.png` undeclared, and Declare on it offers `storm`.
  it("names the fix when the id is declared and its file is missing", async () => {
    const started = await start()
    await waitForRow(started, "assets/backgrounds/storm.png")
    await waitFor("storm-night.png to be reported missing", () =>
      Boolean(declaredRow(started, "backgrounds/storm")?.classList.contains("vn-asset-missing"))
    )

    control(started, "assets/backgrounds/storm.png", "declare")?.click()
    await waitForDialog()
    expect(idInput().value).toBe("storm")
    confirm()

    expect(openDialog()).not.toBeNull()
    expect(idHint()).toBe(
      "storm is already declared, and its file storm-night.png is missing. To use this file for it, change storm-night.png to storm.png in manifest.yaml."
    )
    cancel()
  })

  it("refuses an id whose file is there the plain way", async () => {
    const started = await start()
    await waitForRow(started, "assets/backgrounds/old/sketch.png")

    control(started, "assets/backgrounds/old/sketch.png", "declare")?.click()
    await waitForDialog()
    typeId("cliffs")
    confirm()

    expect(openDialog()).not.toBeNull()
    expect(idHint()).toBe("A background with this id is already declared.")
    cancel()
  })

  it("declares the actor too for a sprite under a folder nobody declared, and says so", async () => {
    const started = await start()
    await waitForRow(started, "assets/sprites/Ghost/idle.png")

    control(started, "assets/sprites/Ghost/idle.png", "declare")?.click()
    await waitForDialog()
    expect(dialogText()).toBe(
      "Declaring idle.png as a sprite for Ghost. It is already in this project, so nothing is copied.\n" +
        "Ghost is not declared yet, so this declares the actor too."
    )
    confirm()

    await waitFor("the declared row to appear", () => declaredRow(started, "actors/Ghost/sprites/idle") !== null)
    const [manifest] = YamlParser.parseManifest(started.editor.getManifestText())
    expect(manifest?.actors.Ghost?.sprites).toEqual({ idle: "idle.png" })
    // The same branch, now an actor with a declaration to count.
    expect(header(started, "actors/Ghost")?.querySelector(".vn-asset-group-count")?.textContent).toBe("1")
  })

  it("says nothing about the actor for a sprite under one already declared", async () => {
    const started = await start()
    await waitForRow(started, "assets/sprites/A1/scared.png")

    control(started, "assets/sprites/A1/scared.png", "declare")?.click()
    await waitForDialog()
    expect(dialogText()).toBe(
      "Declaring scared.png as a sprite for A1. It is already in this project, so nothing is copied."
    )
    cancel()
  })
})

describe("removing an undeclared file", () => {
  it("names its full path, deletes the file alone, and leaves the manifest as it was", async () => {
    const removed: string[] = []
    const started = await start({ removed })
    await waitForRow(started, "assets/backgrounds/old/sketch.png")

    control(started, "assets/backgrounds/old/sketch.png", "remove")?.click()
    await waitForDialog()
    expect(dialogText()).toBe(
      "Remove assets/backgrounds/old/sketch.png from this project? The file is deleted.\n" +
        "No declaration points at it, so nothing the story draws changes."
    )
    confirm()

    await waitFor("the row to go", () => undeclaredRow(started, "assets/backgrounds/old/sketch.png") === null)
    expect(removed).toEqual(["assets/backgrounds/old/sketch.png"])
    expect(started.editor.getManifestText()).toBe(MANIFEST)
  })

  it("says so when the file could not be deleted, and keeps its row", async () => {
    const started = await start({ refuseRemove: true })
    await waitForRow(started, "assets/notes.txt")

    control(started, "assets/notes.txt", "remove")?.click()
    await waitForDialog()
    confirm()

    await waitFor(
      "the refusal to open",
      () => openDialog()?.querySelector(".vn-dialog-title")?.textContent === "The file was not removed"
    )
    expect(dialogText()).toBe("assets/notes.txt could not be deleted, so it is still here.")
    confirm()
    expect(undeclaredRow(started, "assets/notes.txt")).not.toBeNull()
  })
})

// The listing is read again after every one of the panel's jobs, succeeded or failed, which is what
// keeps the rows agreeing with the folder without reading it on every adoption.
describe("the rows follow the folder", () => {
  const undeclaredPaths = (started: StartedEditor): string[] =>
    [...started.panelRoot.querySelectorAll(".vn-asset-row.vn-asset-undeclared")].map(
      (row) => (row as HTMLElement).dataset.vnUndeclared ?? ""
    )

  const idle = (started: StartedEditor): boolean =>
    started.panelRoot.querySelector(".vn-asset-add")?.textContent?.trim() === "Add asset"

  it("leaves the rows as they were after a replace", async () => {
    const started = await start()
    await waitForRow(started, "assets/notes.txt")
    const before = undeclaredPaths(started)

    const input = declaredRow(started, "backgrounds/cliffs")?.querySelector(
      ".vn-asset-replace-input"
    ) as HTMLInputElement
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array([7, 8, 9])], "anything.png", { type: "image/png" }))
    input.files = transfer.files
    input.dispatchEvent(new Event("change"))

    await waitFor("the replace to finish", () => idle(started))
    expect(undeclaredPaths(started)).toEqual(before)
    expect(undeclaredRow(started, "assets/backgrounds/a.png")).toBeNull()
  })

  // Reachable only when the manifest buffer changes while Add asset is copying the file: the bytes
  // land and the declaration does not. The dialog says so, and the file is a row from then on rather
  // than a sentence telling the author to go and type its line.
  it("turns a file whose declaration could not be written into an undeclared row", async () => {
    const flow = "{formatVersion: 1, id: undeclared-files, title: Undeclared Files}\n"
    let started: StartedEditor | undefined = undefined
    started = await start({ whileWriting: () => typeManifest(started as StartedEditor, flow) })
    await waitForRow(started, "assets/notes.txt")

    const input = started.panelRoot.querySelector(".vn-asset-add-input") as HTMLInputElement
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array([1, 2, 3])], "jetty.png", { type: "image/png" }))
    input.files = transfer.files
    input.dispatchEvent(new Event("change"))
    await waitForDialog()
    confirm()

    await waitFor(
      "the half-done add to be said",
      () => openDialog()?.querySelector(".vn-dialog-title")?.textContent === "The declaration was not written"
    )
    confirm()
    await waitForRow(started, "assets/backgrounds/jetty.png")
  })

  it("keeps a file's row when its declaration is refused", async () => {
    // A flow-style manifest parses, so the panel is not gated - but no declaration can be spliced in.
    const flow = "{formatVersion: 1, id: undeclared-files, title: Undeclared Files, backgrounds: {cliffs: a.png}}\n"
    const started = await startEditor(flow, SCRIPT, { resolver: servedAssets(), taken: LISTING })
    await waitForRow(started, "assets/backgrounds/storm.png")

    control(started, "assets/backgrounds/storm.png", "declare")?.click()
    await waitForDialog()
    confirm()

    await waitFor(
      "the refusal to open",
      () => openDialog()?.querySelector(".vn-dialog-title")?.textContent === "The asset was not declared"
    )
    confirm()
    await waitFor("the panel to finish", () => idle(started))
    expect(undeclaredRow(started, "assets/backgrounds/storm.png")).not.toBeNull()
    expect(started.editor.getManifestText()).toBe(flow)
  })

  it("turns a declared asset whose file could not be deleted into an undeclared row", async () => {
    const started = await start({ refuseRemove: true })
    await waitForRow(started, "assets/notes.txt")

    declaredRow(started, "backgrounds/cliffs")?.querySelector<HTMLButtonElement>(".vn-asset-remove")?.click()
    await waitForDialog()
    confirm()

    // The declaration went first, as ADR 0006 orders it, and the delete failed: the file is still on
    // disk with nothing declaring it, which is a row from here on rather than a console line.
    await waitForRow(started, "assets/backgrounds/a.png")
    expect(declaredRow(started, "backgrounds/cliffs")).toBeNull()
  })

  it("draws an added asset as its declared row, never as an undeclared one", async () => {
    const started = await start()
    await waitForRow(started, "assets/notes.txt")

    const input = started.panelRoot.querySelector(".vn-asset-add-input") as HTMLInputElement
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array([1, 2, 3])], "jetty.png", { type: "image/png" }))
    input.files = transfer.files
    input.dispatchEvent(new Event("change"))
    await waitForDialog()
    confirm()

    await waitFor("the declared row to appear", () => declaredRow(started, "backgrounds/jetty") !== null)
    expect(undeclaredRow(started, "assets/backgrounds/jetty.png")).toBeNull()
  })
})

// Listings resolve when the walk does, which is not the order they were asked in.
describe("the listing", () => {
  // A listing the test lets go of when it chooses, taken as a snapshot of what was present when it was
  // asked - which is what a walk started then would have seen.
  const held = () => {
    let release: () => void = () => undefined
    const listing = (present: ReadonlySet<string>) => {
      const snapshot = new Set(present)
      return new Promise<Set<string>>((resolve) => {
        release = () => resolve(snapshot)
      })
    }
    return { listing, release: () => release() }
  }

  it("never lets an older listing land over a newer one", async () => {
    const mount = held()
    const started = await start({
      list: (call, present) => (call === 1 ? mount.listing(present) : Promise.resolve(new Set(present))),
    })

    // The mount's listing is still out, and a job's lands first: cliffs' file is deleted.
    declaredRow(started, "backgrounds/cliffs")?.querySelector<HTMLButtonElement>(".vn-asset-remove")?.click()
    await waitForDialog()
    confirm()
    await waitForRow(started, "assets/notes.txt")

    // The mount's listing still holds a.png. Landing now, it would draw a deleted file.
    mount.release()
    await settle()
    expect(undeclaredRow(started, "assets/backgrounds/a.png")).toBeNull()
  })

  it("lands an older listing when the newer one failed, being newer than what is shown", async () => {
    const mount = held()
    const started = await start({
      refuseRemove: true,
      list: (call, present) =>
        call === 1 ? mount.listing(present) : Promise.reject(new DOMException("walk", "NotFoundError")),
    })

    // The delete is refused, so nothing on disk changes - and the job's own listing fails.
    declaredRow(started, "backgrounds/cliffs")?.querySelector<HTMLButtonElement>(".vn-asset-remove")?.click()
    await waitForDialog()
    confirm()
    await waitFor("the remove to finish", () => declaredRow(started, "backgrounds/cliffs") === null)

    // The mount's listing is the newest that answered, and right: a.png is on disk, declared by nothing.
    mount.release()
    await waitForRow(started, "assets/backgrounds/a.png")
  })

  // "Nothing" before the first listing is only what is not known yet.
  it("does not say nothing is declared until a listing has found nothing", async () => {
    const bare = "formatVersion: 1\nid: undeclared-files\ntitle: Undeclared Files\n"
    const mount = held()
    const started = await startEditor(bare, SCRIPT, {
      taken: ["assets/backgrounds/x.png"],
      list: (call, present) => (call === 1 ? mount.listing(present) : Promise.resolve(new Set(present))),
    })
    await settle()
    expect(started.panelRoot.querySelector(".vn-asset-empty")).toBeNull()

    mount.release()
    await waitForRow(started, "assets/backgrounds/x.png")
    expect(started.panelRoot.querySelector(".vn-asset-empty")).toBeNull()
  })

  it("says nothing is declared once a listing has found nothing", async () => {
    const bare = "formatVersion: 1\nid: undeclared-files\ntitle: Undeclared Files\n"
    const started = await startEditor(bare, SCRIPT, { taken: [] })
    await waitFor("the empty state", () => started.panelRoot.querySelector(".vn-asset-empty") !== null)
  })
})

// Through the boot that ships: the listing is a real walk, and a remove really takes the file off disk.
describe("undeclared files in a stored project", () => {
  beforeEach(async () => {
    await releaseStoredEditorLock()
    await clearOpfsStore(SCRATCH)
    await createProject(PROJECT, { manifestText: MANIFEST, scriptText: SCRIPT })
    await writeProjectFile(PROJECT, "assets/backgrounds/a.png", new Blob([new Uint8Array([1, 2, 3])]))
    await writeProjectFile(PROJECT, "assets/backgrounds/old-cliffs.png", new Blob([new Uint8Array([4, 5, 6])]))
  })

  it("lists what the walk finds, and nothing the manifest declares", async () => {
    const started = await startEditorFromStore(PROJECT)
    await waitForRow(started, "assets/backgrounds/old-cliffs.png")

    expect(undeclaredRow(started, "assets/backgrounds/a.png")).toBeNull()
    expect(started.panelRoot.querySelectorAll(".vn-asset-undeclared.vn-asset-row")).toHaveLength(1)
  })

  it("deletes a removed file off disk and stores nothing different", async () => {
    const started = await startEditorFromStore(PROJECT)
    await waitForRow(started, "assets/backgrounds/old-cliffs.png")
    const root = await storeRoot(SCRATCH)

    control(started, "assets/backgrounds/old-cliffs.png", "remove")?.click()
    await waitForDialog()
    confirm()

    await waitFor("the row to go", () => undeclaredRow(started, "assets/backgrounds/old-cliffs.png") === null)
    expect(await exists(root, `projects/${PROJECT}/assets/backgrounds/old-cliffs.png`)).toBe(false)
    expect(await exists(root, `projects/${PROJECT}/assets/backgrounds/a.png`)).toBe(true)
    expect(await storedManifest(PROJECT)).toBe(MANIFEST)
  })

  // Through `storeNow`, like Add asset's declaration: on disk at once rather than after the debounce.
  it("declares a stored file without copying it, and stores the declaration at once", async () => {
    const started = await startEditorFromStore(PROJECT)
    await waitForRow(started, "assets/backgrounds/old-cliffs.png")

    control(started, "assets/backgrounds/old-cliffs.png", "declare")?.click()
    await waitForDialog()
    confirm()

    await waitFor("the declared row to appear", () => declaredRow(started, "backgrounds/old-cliffs") !== null)
    await waitFor("the declaration to be stored", async () =>
      Boolean((await storedManifest(PROJECT))?.includes("  old-cliffs: old-cliffs.png\n"))
    )
    expect(undeclaredRow(started, "assets/backgrounds/old-cliffs.png")).toBeNull()
  })
})
