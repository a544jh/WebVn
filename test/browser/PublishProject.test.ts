import { BlobReader, BlobWriter, ZipReader } from "@zip.js/zip.js/lib/zip-core-custom.js"
import { beforeEach, describe, expect, it } from "vitest"
import { importArchive, publishProject } from "../../src/storage/archive"
import { walk } from "../../src/storage/opfs"
import {
  createProject,
  deleteProject,
  readEditorState,
  removeProjectFile,
  writeProjectFile,
} from "../../src/storage/projectStore"
import { publishSession, wirePublish } from "../../src/sessionTools"
import { clearOpfsStore, storeRoot } from "../helpers/opfs"
import { manifestNaming } from "../helpers/testManifest"
import {
  blurEditor,
  releaseStoredEditorLock,
  startEditorFromStore,
  typeManifest,
  typeScript,
  waitFor,
} from "../helpers/vnHarness"

// Publish against real OPFS and real zip.js, shaped like the export suite: build the zip, read it back.
// The README's text, the filename and the import-side skip of the player's files are settled in
// `test/unit/archive.test.ts`.

// A scratch directory no other suite uses, and project directories named after the suite - locks are
// origin-wide, whatever root the store is pointed at. See test/helpers/opfs.ts.
const SCRATCH = "test-scratch-publish-project"
const PUBLISHED = "publish-subject"

// **Stand-ins for the player**, served by vitest the way the deployed app serves `player.html` and
// `playerIndex.js` from its own directory - publish is told where they are rather than finding out.
const PLAYER = new URL("/test/fixtures/player/", location.href).href
// A folder that has no player in it.
const NO_PLAYER = new URL("/test/fixtures/published/no-manifest/", location.href).href

const MANIFEST = `formatVersion: 1
id: ${PUBLISHED}
title: A Story To Publish
actors:
  Guide:
    sprites:
      idle: idle.png
backgrounds:
  room: room.png
  also-room: room.png
audioAssets:
  thump: thump.ogg
`
const SCRIPT = "story:\n  - bg: room\n  - Guide: A line for readers.\n"

const makeProject = async (): Promise<void> => {
  await createProject(PUBLISHED, { manifestText: MANIFEST, scriptText: SCRIPT })
  await writeProjectFile(PUBLISHED, "assets/backgrounds/room.png", "room bytes")
  await writeProjectFile(PUBLISHED, "assets/sprites/Guide/idle.png", "sprite bytes")
  await writeProjectFile(PUBLISHED, "assets/audio/thump.ogg", "audio bytes")
  // In the project, and declared by nothing - which an archive carries and a published folder does not.
  await writeProjectFile(PUBLISHED, "assets/backgrounds/stray.png", "undeclared bytes")
}

const contentsOf = async (blob: Blob): Promise<Record<string, string>> => {
  const reader = new ZipReader(new BlobReader(blob))
  const contents: Record<string, string> = {}
  for (const entry of await reader.getEntries()) {
    if (entry.directory) continue
    contents[entry.filename] = await entry.getData<Blob>(new BlobWriter()).then((data) => data.text())
  }
  await reader.close()
  return contents
}

const published = async (player = PLAYER): Promise<{ blob: Blob; filename: string }> => {
  const result = await publishProject(PUBLISHED, player)
  if (result.kind !== "published") throw new Error(`expected a published zip, got ${result.kind}`)
  return result
}

const filesOf = async (directory: string): Promise<string[]> => {
  const root = await storeRoot(SCRATCH)
  const paths: string[] = []
  for await (const file of walk(root, `projects/${directory}`)) paths.push(file.path)
  return paths.sort()
}

const served = async (file: string): Promise<string> => (await fetch(PLAYER + file)).text()

beforeEach(async () => {
  await releaseStoredEditorLock()
  await clearOpfsStore(SCRATCH)
  document.body.innerHTML = ""
})

describe("publishing a project", () => {
  it("holds the player, the manifest, the script and exactly the files the manifest declares", async () => {
    await makeProject()

    const contents = await contentsOf((await published()).blob)

    expect(Object.keys(contents).sort()).toEqual([
      "README.txt",
      "assets/audio/thump.ogg",
      "assets/backgrounds/room.png",
      "assets/sprites/Guide/idle.png",
      "index.html",
      "manifest.yaml",
      "playerIndex.js",
      "script.yaml",
    ])
    expect(contents["manifest.yaml"]).toBe(MANIFEST)
    expect(contents["assets/backgrounds/room.png"]).toBe("room bytes")
  })

  it("carries the player byte for byte, with its page under the name a host serves a folder by", async () => {
    await makeProject()

    const contents = await contentsOf((await published()).blob)

    expect(contents["index.html"]).toBe(await served("player.html"))
    expect(contents["playerIndex.js"]).toBe(await served("playerIndex.js"))
  })

  it("is named so Downloads tells it from a backup", async () => {
    await makeProject()

    expect((await published()).filename).toBe(`${PUBLISHED}-published.zip`)
  })

  it("publishes a script with problems in it, which play exactly as they do in the preview", async () => {
    // ADR 0002 and 0007: the manifest gates, the script never does.
    await createProject(PUBLISHED, {
      manifestText: manifestNaming(PUBLISHED),
      scriptText: "story:\n  - bg: nowhere\n  - notACommand: 1\n",
    })

    expect((await publishProject(PUBLISHED, PLAYER)).kind).toBe("published")
  })

  it("is refused while declared files are missing, and names every one of them", async () => {
    await makeProject()
    await removeProjectFile(PUBLISHED, "assets/backgrounds/room.png")
    await removeProjectFile(PUBLISHED, "assets/audio/thump.ogg")

    const result = await publishProject(PUBLISHED, PLAYER)

    expect(result).toEqual({
      kind: "missing",
      files: ["assets/backgrounds/room.png", "assets/audio/thump.ogg"],
    })
  })

  it("is refused for a manifest that does not parse, in export's terms", async () => {
    await createProject(PUBLISHED, { manifestText: "formatVersion: 1\nid: [unclosed\n", scriptText: SCRIPT })

    const result = await publishProject(PUBLISHED, PLAYER)

    expect(result).toMatchObject({ kind: "refused", problem: "its manifest.yaml does not parse" })
  })

  it("is refused when the player's own files could not be fetched, rather than writing a zip that cannot play", async () => {
    await makeProject()

    const result = await publishProject(PUBLISHED, NO_PLAYER)

    expect(result.kind).toBe("refused")
    if (result.kind === "refused") expect(result.problem).toContain("player")
  })

  it("leaves the library's last-exported line alone, since a published zip is not a backup", async () => {
    await makeProject()

    await published()

    expect((await readEditorState()).exported?.[PUBLISHED]).toBeUndefined()
  })
})

describe("the round trip", () => {
  it("imports back through Import ZIP as exactly the published files, and none of the player's", async () => {
    await makeProject()
    const zip = await published()
    await deleteProject(PUBLISHED)

    const result = await importArchive(new File([zip.blob], zip.filename), {
      confirmOverwrite: () => Promise.reject(new Error("nothing should be filed there")),
    })

    expect(result.kind).toBe("imported")
    expect(await filesOf(PUBLISHED)).toEqual([
      "assets/audio/thump.ogg",
      "assets/backgrounds/room.png",
      "assets/sprites/Guide/idle.png",
      "manifest.yaml",
      "script.yaml",
    ])
  })
})

describe("the editor's Publish control", () => {
  let delivered: string[]
  const wiring = () => ({
    playerFolder: PLAYER,
    deliver: (_blob: Blob, filename: string) => void delivered.push(filename),
  })

  const dialog = (): HTMLDialogElement | null => document.querySelector("dialog.vn-dialog")
  const dialogText = (): string => dialog()?.textContent ?? ""
  const closeDialog = (): void => (dialog()?.querySelector(".vn-dialog-confirm") as HTMLButtonElement).click()

  beforeEach(() => {
    delivered = []
  })

  it("delivers the zip and says what to do with it", async () => {
    await makeProject()
    const started = await startEditorFromStore(PUBLISHED)

    const done = publishSession(started, wiring())
    await waitFor("the hosting dialog", () => dialog() !== null)

    expect(delivered).toEqual([`${PUBLISHED}-published.zip`])
    expect(dialog()?.querySelector(".vn-dialog-title")?.textContent).toBe("Published")
    expect(dialogText()).toContain(`${PUBLISHED}-published.zip`)
    expect(dialogText()).toContain("static web host")
    expect(dialogText()).toContain("Opening index.html straight from your disk will not work.")
    closeDialog()
    await done
    expect(dialog()).toBeNull()
  })

  it("carries the sentence typed a moment before, which is the flush", async () => {
    await makeProject()
    const started = await startEditorFromStore(PUBLISHED)
    let zip: Blob | null = null
    typeScript(started, "story:\n  - The last thing I wrote.\n")

    const done = publishSession(started, { playerFolder: PLAYER, deliver: (blob) => void (zip = blob) })
    await waitFor("the hosting dialog", () => dialog() !== null)
    closeDialog()
    await done

    expect(zip).not.toBeNull()
    expect((await contentsOf(zip as unknown as Blob))["script.yaml"]).toContain("The last thing I wrote.")
  })

  it("lists every missing declared file in a dialog, and delivers nothing", async () => {
    await makeProject()
    await removeProjectFile(PUBLISHED, "assets/backgrounds/room.png")
    await removeProjectFile(PUBLISHED, "assets/sprites/Guide/idle.png")
    const started = await startEditorFromStore(PUBLISHED)

    const done = publishSession(started, wiring())
    await waitFor("the refusal dialog", () => dialog() !== null)

    expect(dialog()?.querySelector(".vn-dialog-title")?.textContent).toBe("Not published")
    const listed = [...(dialog()?.querySelectorAll(".vn-dialog-list li") ?? [])].map((item) => item.textContent)
    expect(listed).toEqual(["assets/sprites/Guide/idle.png", "assets/backgrounds/room.png"])
    expect(dialogText()).toContain("Add each one in the asset panel, or remove its declaration.")
    expect(delivered).toEqual([])
    closeDialog()
    await done
  })

  it("is greyed while the manifest does not parse, and refused if it is reached anyway", async () => {
    await makeProject()
    const started = await startEditorFromStore(PUBLISHED)
    const button = document.createElement("button")
    document.body.appendChild(button)
    wirePublish(button, started, wiring())
    expect(button.disabled).toBe(false)

    typeManifest(started, "formatVersion: 1\nid: [unclosed\n")
    await blurEditor(started)

    expect(button.disabled).toBe(true)
    const done = publishSession(started, wiring())
    await waitFor("the refusal dialog", () => dialog() !== null)
    expect(dialogText()).toContain("does not parse")
    expect(delivered).toEqual([])
    closeDialog()
    await done
  })
})
