import { beforeEach, describe, expect, it } from "vitest"
import {
  exists,
  isSupported,
  listDirectories,
  opfsRoot,
  readBlob,
  readText,
  removeRecursive,
  walk,
  WalkedFile,
} from "../../src/storage/opfs"
import { clearOpfs } from "../helpers/opfs"
import { writeFile } from "../../src/storage/opfs"

// The filesystem layer, which knows nothing about projects. OPFS is a browser API, so a test for it
// misfiled under test/unit/ would die on a missing navigator.storage rather than fail usefully.

let dir: FileSystemDirectoryHandle

beforeEach(async () => {
  dir = await clearOpfs()
})

const walked = async (start: FileSystemDirectoryHandle, path?: string): Promise<WalkedFile[]> => {
  const files: WalkedFile[] = []
  for await (const file of walk(start, path)) files.push(file)
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

const paths = async (start: FileSystemDirectoryHandle, path?: string): Promise<string[]> =>
  (await walked(start, path)).map((file) => file.path)

describe("opfs", () => {
  it("reports that this browser can hold a project", () => {
    expect(isSupported()).toBe(true)
  })

  it("round-trips text", async () => {
    await writeFile(dir, "script.yaml", "story:\n  - Hello\n")

    expect(await readText(dir, "script.yaml")).toBe("story:\n  - Hello\n")
  })

  it("round-trips binary", async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255])
    await writeFile(dir, "assets/backgrounds/a.png", new Blob([bytes]))

    const blob = await readBlob(dir, "assets/backgrounds/a.png")
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes)
  })

  it("creates the directories on the way to a nested path", async () => {
    await writeFile(dir, "projects/my-story/assets/sprites/A1/idle.png", "not really a png")

    expect(await readText(dir, "projects/my-story/assets/sprites/A1/idle.png")).toBe("not really a png")
  })

  it("overwrites rather than appending", async () => {
    await writeFile(dir, "script.yaml", "a much longer first version")
    await writeFile(dir, "script.yaml", "short")

    expect(await readText(dir, "script.yaml")).toBe("short")
  })

  it("says whether a path is there", async () => {
    await writeFile(dir, "a/b.txt", "x")

    expect(await exists(dir, "a/b.txt")).toBe(true)
    expect(await exists(dir, "a/c.txt")).toBe(false)
    expect(await exists(dir, "nowhere/at/all.txt")).toBe(false)
  })

  it("leaves no tmp file behind after a successful write", async () => {
    // The one that catches a write - the move-less fallback especially - that forgot to clean up.
    await writeFile(dir, "script.yaml", "story:\n")

    expect(await paths(dir)).toEqual(["script.yaml"])
  })

  it("yields every file under a tree, with paths relative to where the walk started", async () => {
    await writeFile(dir, "manifest.yaml", "id: my-story")
    await writeFile(dir, "assets/backgrounds/a.png", "a")
    await writeFile(dir, "assets/sprites/A1/idle.png", "bb")

    expect(await paths(dir)).toEqual(["assets/backgrounds/a.png", "assets/sprites/A1/idle.png", "manifest.yaml"])
    expect(await paths(dir, "assets")).toEqual(["backgrounds/a.png", "sprites/A1/idle.png"])
  })

  it("carries each file's size, which is the only place a per-project figure can come from", async () => {
    // navigator.storage.estimate() is origin-wide, so the library UI's per-project number has
    // nowhere else to come from - and getFile().size is already in hand during the walk.
    await writeFile(dir, "a.txt", "12345")

    expect((await walked(dir))[0].size).toBe(5)
  })

  it("yields nothing for an empty directory, and nothing for one that is not there", async () => {
    await dir.getDirectoryHandle("empty", { create: true })

    expect(await paths(dir, "empty")).toEqual([])
    expect(await paths(dir, "no-such-directory")).toEqual([])
  })

  it("lists the directories under a path, and nothing for one that is not there", async () => {
    await writeFile(dir, "projects/my-story/manifest.yaml", "x")
    await writeFile(dir, "projects/other/manifest.yaml", "x")
    await writeFile(dir, "projects/loose-file.txt", "x")

    expect((await listDirectories(dir, "projects")).sort()).toEqual(["my-story", "other"])
    expect(await listDirectories(dir, "no-such-directory")).toEqual([])
  })

  it("empties a populated tree, and does not throw on one that is not there", async () => {
    await writeFile(dir, "projects/my-story/assets/backgrounds/a.png", "a")
    await writeFile(dir, "projects/my-story/manifest.yaml", "x")

    await removeRecursive(dir, "projects/my-story")

    expect(await paths(dir)).toEqual([])
    await expect(removeRecursive(dir, "projects/my-story")).resolves.toBeUndefined()
  })

  it("leaves one of two concurrent writes intact, and no tmp file behind", async () => {
    // Debounced storing can start a second write while the first is between its write and its move,
    // and unserialized they would share one tmp name. Serializing per path also makes the last write
    // win, which is what a debounced store wants.
    await Promise.all([writeFile(dir, "script.yaml", "first"), writeFile(dir, "script.yaml", "second")])

    expect(await readText(dir, "script.yaml")).toBe("second")
    expect(await paths(dir)).toEqual(["script.yaml"])
  })

  it("hands back the origin private file system root", async () => {
    expect((await opfsRoot()).kind).toBe("directory")
  })
})
