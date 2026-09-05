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
  dir = await clearOpfs("test-scratch-opfs")
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

  it("leaves nothing beside the file it wrote", async () => {
    // The engine's own swap file must not leak into enumeration. createWritable is implemented by
    // writing elsewhere and replacing on close - Chromium calls that `<name>.crswap` - and a project
    // directory is walked, listed and exported, so anything of the engine's showing up there would
    // read as the author's. It also catches a reintroduced tmp-then-move scheme that forgets to
    // clean up, which is what this test was originally for.
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

  it("lets the last of two concurrent writes win, however long the earlier one takes", async () => {
    // Ordering rather than atomicity: each write is already atomic on its own (see writeNow), so
    // what serialization buys is that the *last queued* write is the one that lands. The sizes are
    // lopsided on purpose - a big first write and a small second one is the case where "last to
    // finish" and "last queued" disagree, and asserting on two equal writes cannot tell them apart.
    const big = "x".repeat(8 * 1024 * 1024)
    await Promise.all([writeFile(dir, "script.yaml", big), writeFile(dir, "script.yaml", "second")])

    expect(await readText(dir, "script.yaml")).toBe("second")
    expect(await paths(dir)).toEqual(["script.yaml"])
  })

  it("hands back the origin private file system root", async () => {
    expect((await opfsRoot()).kind).toBe("directory")
  })
})
