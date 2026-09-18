import { beforeEach, describe, expect, it } from "vitest"
import { userEvent } from "@vitest/browser/context"
import { NoOp } from "../../src/core/commands/NoOp"
import { ErrorLevel } from "../../src/core/commands/Parser"
import { createProject, readProject } from "../../src/storage/projectStore"
import { exists } from "../../src/storage/opfs"
import { YamlParser } from "../../src/yamlParser/YamlParser"
import { clearOpfsStore, storeRoot } from "../helpers/opfs"
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

// Removing an asset: its declaration out of manifest.yaml and its file off disk, both.
// docs/adr/0006 is the decision and says why the file goes too.

// Named after this suite: `navigator.locks` is origin-wide and knows nothing about scratch roots.
const SCRATCH = "remove-asset-suite"
const PROJECT = "remove-asset-project"

const MANIFEST = `formatVersion: 1
id: remove-asset
title: Remove Asset
backgrounds:
  cliffs: a.png
  jetty: b.png
audioAssets:
  waves: sfx/bigthump.ogg
actors:
  A1:
    sprites:
      idle: idle.png
`

// Two lines naming `waves`, so the confirmation has a number worth saying.
const SCRIPT = "story:\n  - bgm: waves\n  - A line.\n  - bgm: waves\n"

// The store-backed boot below gets a script with no music in it. Chromium's autoplay policy rejects
// `play()` without a user gesture and `AudioRenderer` does not catch that, so a story that opens on
// a `bgm` never finishes its first render - which is the stub `CloseProject.test.ts` installs and
// this suite has no reason to need.
const SILENT_SCRIPT = "story:\n  - A line.\n"

const row = (started: StartedEditor, key: string): HTMLElement | null =>
  started.panelRoot.querySelector(`.vn-asset-row[data-vn-asset="${key}"]`)

const rowKeys = (started: StartedEditor): string[] =>
  [...started.panelRoot.querySelectorAll(".vn-asset-row")].map((elem) => (elem as HTMLElement).dataset.vnAsset ?? "")

const removeControl = (started: StartedEditor, key: string): HTMLButtonElement =>
  row(started, key)?.querySelector(".vn-asset-remove") as HTMLButtonElement

const openDialog = (): HTMLDialogElement | null => document.querySelector("dialog.vn-dialog")

const dialogText = (): string =>
  [...(openDialog()?.querySelectorAll(".vn-dialog-body") ?? [])].map((p) => p.textContent).join("\n")

const waitForDialog = async (): Promise<void> => {
  await waitFor("the confirmation to open", () => openDialog() !== null)
}

const confirm = (): void => (openDialog()?.querySelector(".vn-dialog-confirm") as HTMLButtonElement).click()
const cancel = (): void => (openDialog()?.querySelector(".vn-dialog-cancel") as HTMLButtonElement).click()

describe("removing an asset", () => {
  it("takes the declaration out of the manifest and the row out of the panel", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    removeControl(started, "backgrounds/cliffs").click()
    await waitForDialog()
    confirm()

    await waitFor("the row to go", () => row(started, "backgrounds/cliffs") === null)
    expect(started.editor.getManifestText()).toBe(MANIFEST.replace("  cliffs: a.png\n", ""))
    // Only that one: its neighbour in the same group is untouched.
    expect(rowKeys(started)).toContain("backgrounds/jetty")
  })

  it("names the file it is about to delete, and how much of the script names the id", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    removeControl(started, "audioAssets/waves").click()
    await waitForDialog()

    // The id and the filename are different things, and the author picked the row by id.
    expect(dialogText()).toContain("Remove waves from this project? Its file sfx/bigthump.ogg is deleted.")
    expect(dialogText()).toContain("waves is named on 2 lines in script.yaml")
    cancel()
  })

  it("says so plainly when nothing in the script names it", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    removeControl(started, "backgrounds/jetty").click()
    await waitForDialog()
    expect(dialogText()).toContain("jetty is not named anywhere in script.yaml.")
    cancel()
  })

  it("writes nothing at all when the author cancels", async () => {
    const removed: string[] = []
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets(), removed })

    removeControl(started, "backgrounds/cliffs").click()
    await waitForDialog()
    cancel()
    await settle()

    expect(removed).toEqual([])
    expect(started.editor.getManifestText()).toBe(MANIFEST)
    expect(rowKeys(started)).toContain("backgrounds/cliffs")
  })

  // ADR 0004's guarantee, asserted here because it is what makes removal safe: the scene stops
  // drawing its background and says so on the line, and it repairs itself the moment the id is
  // declared again.
  it("leaves a script that still names the id playing, with a warning at the same index", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })
    const before = started.player.state.commands.length

    removeControl(started, "audioAssets/waves").click()
    await waitForDialog()
    confirm()

    await waitFor("the row to go", () => row(started, "audioAssets/waves") === null)

    const commands = started.player.state.commands
    expect(commands).toHaveLength(before)
    expect(commands[0]).toBeInstanceOf(NoOp)

    const [, errors] = YamlParser.parseStory(SCRIPT, started.player.state)
    const warnings = errors.filter((error) => error.level === ErrorLevel.WARNING)
    expect(warnings.map((error) => error.location.startLine)).toEqual([2, 4])
    expect(warnings[0].message).toContain("No audio asset is declared as waves")
  })

  // The removal leaves `sprites:` with nothing under it, which YAML reads as null - and until
  // `actorSchema.sprites` was wrapped in `declared` that stopped the manifest parsing, *after* the
  // file had gone. A project an author cannot open to fix is the worst outcome this panel has.
  it("leaves a parsing manifest after an actor's last sprite goes", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    removeControl(started, "actors/A1/sprites/idle").click()
    await waitForDialog()
    confirm()

    await waitFor("the row to go", () => row(started, "actors/A1/sprites/idle") === null)
    expect(started.panelRoot.querySelector(".vn-asset-panel-stale")).toBeNull()
    const [manifest, errors] = YamlParser.parseManifest(started.editor.getManifestText())
    expect(errors).toEqual([])
    expect(manifest?.actors.A1.sprites).toBeUndefined()
  })

  it("puts no remove control on an actor row or a group header", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    // Only the leaves have one, and an actor is cast rather than an asset.
    expect(started.panelRoot.querySelectorAll(".vn-asset-remove")).toHaveLength(4)
    for (const header of started.panelRoot.querySelectorAll(".vn-asset-group")) {
      expect(header.querySelector(".vn-asset-remove")).toBeNull()
    }
  })

  it("is disabled while the manifest does not parse, and says why", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })
    expect(removeControl(started, "backgrounds/cliffs").disabled).toBe(false)

    typeManifest(started, "formatVersion: 1\nid: remove-asset\ntitle: [\n")
    await blurEditor(started)

    await waitFor("the control to be gated", () => removeControl(started, "backgrounds/cliffs").disabled)
    expect(removeControl(started, "backgrounds/cliffs").title).toContain("manifest.yaml does not parse")
  })
})

// Ticket 01 built the structure these sit in, and this is the part of it nobody could see working
// until there was a control to put in a row.
describe("a row's controls", () => {
  const controlsOf = (started: StartedEditor, key: string): HTMLElement =>
    row(started, key)?.querySelector(".vn-asset-controls") as HTMLElement

  it("appear on hover and on keyboard focus, and never move the row", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })
    const target = row(started, "backgrounds/cliffs") as HTMLElement
    const controls = controlsOf(started, "backgrounds/cliffs")

    const id = target.querySelector(".vn-asset-id") as HTMLElement
    // Measured as offsets within the row rather than against the viewport: `userEvent.hover` scrolls
    // its target into view, so a viewport-relative rect moves for a reason that is not a reflow.
    const shape = () => [target.offsetWidth, target.offsetHeight, id.offsetLeft, id.offsetWidth]

    expect(getComputedStyle(controls).opacity).toBe("0")
    const before = shape()

    await userEvent.hover(target)
    await waitFor("the controls to appear", () => getComputedStyle(controls).opacity === "1")

    // **Overlaid, not pushed.** A row that changed width under the pointer is the flicker
    // `.vn-picker-drop` documents at length, and the id must not move either.
    expect(shape()).toEqual(before)
    // Nor does the list gain anything to scroll sideways.
    const list = started.panelRoot.querySelector(".vn-asset-list") as HTMLElement
    expect(list.scrollWidth).toBe(list.clientWidth)

    await userEvent.hover(started.panelRoot.querySelector(".vn-asset-panel-bar") as HTMLElement)
    await waitFor("the controls to go again", () => getComputedStyle(controls).opacity === "0")

    // The keyboard half. `display: none` would take the control out of the tab order, so Tab could
    // never be the thing that brings it into view - which is why these are hidden with `opacity`.
    removeControl(started, "backgrounds/cliffs").focus()
    expect(getComputedStyle(controls).opacity).toBe("1")
  })
})

// The one that goes through the boot that ships: the file really comes off disk.
describe("removing an asset from a stored project", () => {
  beforeEach(async () => {
    await releaseStoredEditorLock()
    const dir = await clearOpfsStore(SCRATCH)
    await createProject(PROJECT, { manifestText: MANIFEST, scriptText: SILENT_SCRIPT })
    const assets = await dir
      .getDirectoryHandle("projects", { create: true })
      .then((projects) => projects.getDirectoryHandle(PROJECT, { create: true }))
      .then((project) => project.getDirectoryHandle("assets", { create: true }))
      .then((it) => it.getDirectoryHandle("backgrounds", { create: true }))
    const handle = await assets.getFileHandle("a.png", { create: true })
    const writable = await handle.createWritable()
    await writable.write(new Uint8Array([1, 2, 3]))
    await writable.close()
  })

  it("deletes the file and stores the manifest without the declaration", async () => {
    const started = await startEditorFromStore(PROJECT)
    const root = await storeRoot(SCRATCH)
    expect(await exists(root, `projects/${PROJECT}/assets/backgrounds/a.png`)).toBe(true)

    removeControl(started, "backgrounds/cliffs").click()
    await waitForDialog()
    confirm()

    await waitFor("the row to go", () => row(started, "backgrounds/cliffs") === null)
    await waitFor("the file to go", () =>
      exists(root, `projects/${PROJECT}/assets/backgrounds/a.png`).then((it) => !it)
    )

    await started.storing.flush()
    expect((await readProject(PROJECT)).manifestText).not.toContain("cliffs: a.png")
  })
})
