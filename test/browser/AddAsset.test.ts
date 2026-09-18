import { beforeEach, describe, expect, it } from "vitest"
import { createProject, readProject, readProjectFile } from "../../src/storage/projectStore"
import { clearOpfsStore } from "../helpers/opfs"
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

// `Add asset`: a file on disk, **and** a line in manifest.yaml. An undeclared file is invisible to
// the engine, so both halves or neither.
//
// The store-backed test at the bottom is the one that exercises the wiring that ships - `editorBoot`
// hands the panel three functions over `projectStore` - and the rest drive the dialog over an
// in-memory one, which is faster and is where the refusals live.

// Named after this suite: `navigator.locks` is origin-wide and knows nothing about scratch roots, so
// two suites sharing a directory name contend for one `vn-project-<directory>` lock even with their
// files nowhere near each other.
const SCRATCH = "add-asset-suite"
const PROJECT = "add-asset-project"

const SCRIPT = "story:\n  - A line.\n"

const MANIFEST = `formatVersion: 1
id: add-asset
title: Add Asset
backgrounds:
  cliffs: a.png
actors:
  A1:
    sprites:
      idle: idle.png
`

// A file the author picked, as the platform hands one over.
const pickedFile = (name: string, type = "image/png"): File => new File([new Uint8Array([1, 2, 3])], name, { type })

// Driving the panel's hidden `<input type="file">`, which is the only way a file reaches it.
const pick = (started: StartedEditor, file: File): void => {
  const input = started.panelRoot.querySelector(".vn-asset-add-input") as HTMLInputElement
  const transfer = new DataTransfer()
  transfer.items.add(file)
  input.files = transfer.files
  input.dispatchEvent(new Event("change"))
}

const openDialog = (): HTMLDialogElement | null => document.querySelector("dialog.vn-dialog")

const waitForDialog = async (): Promise<HTMLDialogElement> => {
  await waitFor("the Add asset dialog to open", () => openDialog() !== null)
  return openDialog() as HTMLDialogElement
}

const fieldFor = (label: string): HTMLElement => {
  const rows = [...(openDialog()?.querySelectorAll(".vn-dialog-field") ?? [])]
  const row = rows.find((candidate) => candidate.querySelector(".vn-dialog-label")?.textContent === label)
  if (row === undefined) throw new Error(`the dialog has no "${label}" field`)
  return row as HTMLElement
}

// Whether a field is on screen, as a reader sees it rather than as the property says.
const shown = (label: string): boolean => getComputedStyle(fieldFor(label)).display !== "none"

const inputFor = (label: string): HTMLInputElement => fieldFor(label).querySelector("input") as HTMLInputElement
const selectFor = (label: string): HTMLSelectElement => fieldFor(label).querySelector("select") as HTMLSelectElement
const hintOf = (label: string): string =>
  (fieldFor(label).querySelector(".vn-dialog-hint") as HTMLElement).textContent ?? ""

// Typing, as the dialog hears it: `input` is what clears a problem and refreshes the hints.
const type = (label: string, value: string): void => {
  const input = inputFor(label)
  input.value = value
  input.dispatchEvent(new Event("input"))
}

const choose = (label: string, option: string): void => {
  const select = selectFor(label)
  select.value = option
  select.dispatchEvent(new Event("change"))
}

const confirm = (): void => (openDialog()?.querySelector(".vn-dialog-confirm") as HTMLButtonElement).click()
const cancel = (): void => (openDialog()?.querySelector(".vn-dialog-cancel") as HTMLButtonElement).click()

const rowKeys = (started: StartedEditor): string[] =>
  [...started.panelRoot.querySelectorAll(".vn-asset-row")].map((row) => (row as HTMLElement).dataset.vnAsset ?? "")

const addButton = (started: StartedEditor): HTMLButtonElement =>
  started.panelRoot.querySelector(".vn-asset-add") as HTMLButtonElement

describe("adding an asset", () => {
  it("writes the file, splices the declaration, and draws the row", async () => {
    const written = new Map<string, Blob>()
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets(), written })

    pick(started, pickedFile("jetty.png"))
    await waitForDialog()
    confirm()

    await waitFor("the new background to be drawn", () => rowKeys(started).includes("backgrounds/jetty"))
    expect([...written.keys()]).toEqual(["assets/backgrounds/jetty.png"])
    expect(started.editor.getManifestText()).toBe(
      MANIFEST.replace("  cliffs: a.png\n", "  cliffs: a.png\n  jetty: jetty.png\n")
    )
  })

  it("appends the group when the manifest declares none", async () => {
    const bare = "formatVersion: 1\nid: add-asset\ntitle: Add Asset\n"
    const started = await startEditor(bare, SCRIPT)

    pick(started, pickedFile("jetty.png"))
    await waitForDialog()
    confirm()

    await waitFor("the group to be appended", () => rowKeys(started).includes("backgrounds/jetty"))
    expect(started.editor.getManifestText()).toBe(bare + "backgrounds:\n  jetty: jetty.png\n")
  })

  it("reveals Actor for a sprite, and Actor name for one nobody has cast", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    pick(started, pickedFile("worried.png"))
    await waitForDialog()
    // **Computed, not the property.** `.vn-dialog-field` sets `display: flex`, which is
    // author-origin and beats the UA's `[hidden]` rule - so asserting `.hidden` passed while both
    // fields were on screen.
    expect(shown("Actor")).toBe(false)
    expect(shown("Actor name")).toBe(false)

    choose("Kind", "Sprite")
    expect(shown("Actor")).toBe(true)
    // The actors the panel is drawing, offered in the manifest's own order.
    expect([...selectFor("Actor").options].map((option) => option.value)).toEqual(["A1", "New actor..."])
    expect(shown("Actor name")).toBe(false)

    choose("Actor", "New actor...")
    expect(shown("Actor name")).toBe(true)
    cancel()
  })

  it("writes the actor entry and its sprites map for a sprite whose actor is new", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    pick(started, pickedFile("worried.png"))
    await waitForDialog()
    choose("Kind", "Sprite")
    choose("Actor", "New actor...")
    type("Actor name", "Fisher")
    confirm()

    await waitFor("the new sprite to be drawn", () => rowKeys(started).includes("actors/Fisher/sprites/worried"))
    expect(started.editor.getManifestText()).toBe(MANIFEST + "  Fisher:\n    sprites:\n      worried: worried.png\n")
  })

  // The hint is what the dialog is for: the rule beside the field it belongs to.
  it("says where the file will be stored, and what the script would write", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    pick(started, pickedFile("jetty.png"))
    await waitForDialog()
    expect(hintOf("Id")).toBe("What the script names. bg: jetty")
    expect(hintOf("File name")).toBe("Stored as assets/backgrounds/jetty.png")

    choose("Kind", "Sprite")
    expect(hintOf("Id")).toBe("What the script names this sprite.")
    expect(hintOf("File name")).toBe("Stored as assets/sprites/A1/jetty.png")
    cancel()
  })

  it("refuses an id its group already declares, and keeps the dialog up with what was typed", async () => {
    const written = new Map<string, Blob>()
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets(), written })

    pick(started, pickedFile("cliffs-v2.png"))
    await waitForDialog()
    type("Id", "cliffs")
    confirm()

    expect(openDialog()).not.toBeNull()
    expect(hintOf("Id")).toBe("A background with this id is already declared.")
    expect(inputFor("Id").value).toBe("cliffs")
    // Nothing was written on the way to a refusal: the dialog is the gate, not the write.
    expect([...written.keys()]).toEqual([])
    cancel()
  })

  it("refuses a lowercase actor with the schema's own message", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    pick(started, pickedFile("worried.png"))
    await waitForDialog()
    choose("Kind", "Sprite")
    choose("Actor", "New actor...")
    type("Actor name", "fisher")
    confirm()

    expect(openDialog()).not.toBeNull()
    expect(hintOf("Actor name")).toContain("must be capitalized")
    cancel()
  })

  it("refuses a filename the project already holds, and says which file is in the way", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, {
      resolver: servedAssets(),
      taken: ["assets/backgrounds/jetty.png"],
    })

    pick(started, pickedFile("jetty.png"))
    await waitForDialog()
    type("Id", "jetty")
    confirm()

    expect(openDialog()).not.toBeNull()
    expect(hintOf("File name")).toContain("assets/backgrounds/jetty.png is already in this project")
    cancel()
  })

  // `editor.ts`'s revert guard, carried across: a manifest this ate would be worse than a
  // declaration the author has to type.
  it("refuses to splice a flow-style manifest, and copies nothing on the way to the refusal", async () => {
    const flow = "{formatVersion: 1, id: add-asset, title: Add Asset}\n"
    const written = new Map<string, Blob>()
    const started = await startEditor(flow, SCRIPT, { written })

    pick(started, pickedFile("jetty.png"))
    await waitForDialog()
    confirm()

    await waitFor(
      "the refusal to be shown",
      () => document.querySelector(".vn-dialog-title")?.textContent === "The asset was not added"
    )
    expect(started.editor.getManifestText()).toBe(flow)
    // **Asked before anything is written**, so there is no file the project does not point at.
    expect([...written.keys()]).toEqual([])
    ;(document.querySelector(".vn-dialog-confirm") as HTMLButtonElement).click()
  })

  // The repo's own demo manifest declares `Rando: {}`, so this is not a shape only a test writes.
  it("refuses a sprite for an actor declared in flow style, and copies nothing", async () => {
    const written = new Map<string, Blob>()
    const started = await startEditor(MANIFEST + "  Rando: {}\n", SCRIPT, { resolver: servedAssets(), written })

    pick(started, pickedFile("idle.png"))
    await waitForDialog()
    choose("Kind", "Sprite")
    choose("Actor", "Rando")
    confirm()

    await waitFor(
      "the refusal to be shown",
      () => document.querySelector(".vn-dialog-title")?.textContent === "The asset was not added"
    )
    expect([...written.keys()]).toEqual([])
    ;(document.querySelector(".vn-dialog-confirm") as HTMLButtonElement).click()
  })

  it("is disabled while the manifest does not parse, and says why", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })
    expect(addButton(started).disabled).toBe(false)

    typeManifest(started, "formatVersion: 1\nid: add-asset\ntitle: [\n")
    await blurEditor(started)

    await waitFor("the button to be gated", () => addButton(started).disabled)
    expect(addButton(started).title).toContain("manifest.yaml does not parse")
  })

  it("leaves everything alone when the author backs out", async () => {
    const written = new Map<string, Blob>()
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets(), written })

    pick(started, pickedFile("jetty.png"))
    await waitForDialog()
    cancel()
    await settle()

    expect([...written.keys()]).toEqual([])
    expect(started.editor.getManifestText()).toBe(MANIFEST)
  })
})

// The one that goes through the boot that ships, rather than an in-memory stand-in for its file
// operations.
describe("adding an asset to a stored project", () => {
  beforeEach(async () => {
    await releaseStoredEditorLock()
    await clearOpfsStore(SCRATCH)
    await createProject(PROJECT, { manifestText: MANIFEST, scriptText: SCRIPT })
  })

  it("puts the file in the project and the declaration in the stored manifest", async () => {
    const started = await startEditorFromStore(PROJECT)

    pick(started, pickedFile("jetty.png"))
    await waitForDialog()
    confirm()

    await waitFor("the new background to be drawn", () => rowKeys(started).includes("backgrounds/jetty"))

    const blob = await readProjectFile(PROJECT, "assets/backgrounds/jetty.png")
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))

    // The buffer change fires onBufferChangeCallbacks like a keystroke, so the storer picks it up -
    // flushed here rather than waited out, because the debounce is 2000ms.
    await started.storing.flush()
    expect((await readProject(PROJECT)).manifestText).toContain("jetty: jetty.png")
  })
})
