import { beforeEach, describe, expect, it } from "vitest"
import { parseManifest } from "../../src/yamlParser/parseManifest"
import { YamlParser } from "../../src/yamlParser/YamlParser"
import {
  createProject,
  deleteProject,
  listProjects,
  readEditorState,
  readProject,
  writeManifest,
  writeScript,
} from "../../src/storage/projectStore"
import { writeEditorState } from "../../src/storage/projectStore"
import { readText, writeFile } from "../../src/storage/opfs"
import { clearOpfsStore, storeRoot } from "../helpers/opfs"

// Project semantics over the OPFS primitives: where a project's files live, what counts as a
// project, and how one is read and written.

const MANIFEST = `formatVersion: 1
id: my-story
title: My Story
`

const SCRIPT = `story:
  - Hello
`

beforeEach(async () => {
  await clearOpfsStore()
})

describe("the project store", () => {
  it("round-trips a created project through the listing", async () => {
    await createProject("my-story", { manifestText: MANIFEST, scriptText: SCRIPT })

    expect(await listProjects()).toEqual([{ directory: "my-story", id: "my-story", title: "My Story" }])
    expect(await readProject("my-story")).toEqual({ manifestText: MANIFEST, scriptText: SCRIPT })
  })

  it("does not list a directory with no manifest", async () => {
    // Not a project with a missing name - not a project. It is what a crashed rename or import
    // leaves behind, and the rename ticket's sweep is what deletes it.
    const root = await storeRoot()
    await writeFile(root, "projects/residue/script.yaml", SCRIPT)

    expect(await listProjects()).toEqual([])
  })

  it("lists a project whose manifest does not parse, with no id and no title", async () => {
    // An author's project with a typo in it. Dropping it would make the picker the one place they
    // cannot go to fix it, and the editor opens a broken manifest perfectly well already (ADR 0002).
    const root = await storeRoot()
    await writeFile(root, "projects/broken/manifest.yaml", "id: [unclosed\n")
    await writeFile(root, "projects/broken/script.yaml", SCRIPT)

    expect(await listProjects()).toEqual([{ directory: "broken", id: null, title: null }])
  })

  it("reports a directory and a manifest id that disagree, and rewrites neither", async () => {
    // The state the rename ticket exists to resolve, and the reason ProjectSummary is a summary
    // rather than a list of ids. The fix is always to rename the directory to match the manifest -
    // never to rewrite the manifest to match the directory, which is the cheap-looking direction.
    const root = await storeRoot()
    await writeFile(root, "projects/old-name/manifest.yaml", MANIFEST)
    await writeFile(root, "projects/old-name/script.yaml", SCRIPT)

    expect(await listProjects()).toEqual([{ directory: "old-name", id: "my-story", title: "My Story" }])
    expect(await readText(root, "projects/old-name/manifest.yaml")).toBe(MANIFEST)
  })

  it("refuses an id that cannot name a directory", async () => {
    await expect(createProject("MyStory")).rejects.toThrow(/a-z/)
    await expect(createProject("con")).rejects.toThrow(/reserved device name/)
    await expect(createProject("..")).rejects.toThrow(/a-z/)
    await expect(createProject("")).rejects.toThrow(/a-z/)

    expect(await listProjects()).toEqual([])
  })

  it("mints a project that parses clean when it is given no files", async () => {
    // A genuinely empty script.yaml has no `story` key, which parseStory reports - so a brand-new
    // project would open with a red gutter as its first impression.
    await createProject("fresh")

    const { manifestText, scriptText } = await readProject("fresh")
    const [manifest, manifestErrors] = parseManifest(manifestText)
    expect(manifestErrors).toEqual([])
    if (manifest === null) throw new Error("the minted manifest does not parse")
    expect(manifest.id).toBe("fresh")
    expect(YamlParser.parseStory(scriptText, manifest)[1]).toEqual([])
    expect(YamlParser.parseStory(scriptText, manifest)[0].commands.length).toBeGreaterThan(0)
  })

  it("writes each buffer on its own", async () => {
    await createProject("my-story", { manifestText: MANIFEST, scriptText: SCRIPT })

    await writeScript("my-story", "story:\n  - Edited\n")
    await writeManifest("my-story", MANIFEST + "actors:\n  A: {}\n")

    const files = await readProject("my-story")
    expect(files.scriptText).toBe("story:\n  - Edited\n")
    expect(files.manifestText).toContain("actors:")
  })

  it("removes the tree on delete, and stops listing the project", async () => {
    await createProject("my-story", { manifestText: MANIFEST, scriptText: SCRIPT })
    const root = await storeRoot()
    await writeFile(root, "projects/my-story/assets/backgrounds/a.png", "not really a png")

    await deleteProject("my-story")

    expect(await listProjects()).toEqual([])
    await expect(readProject("my-story")).rejects.toThrow()
  })

  it("round-trips the editor's own bookkeeping", async () => {
    await writeEditorState({ lastOpened: "my-story" })

    expect(await readEditorState()).toEqual({ lastOpened: "my-story" })
  })

  it("reads a missing or unparseable editor.yaml as empty rather than throwing", async () => {
    // editor.yaml is defined as losable: the store degrades to enumeration without it, and that
    // rule is the migration strategy, which is why the file gets no schema version.
    expect(await readEditorState()).toEqual({})

    const root = await storeRoot()
    await writeFile(root, "editor.yaml", "lastOpened: [unclosed\n")
    expect(await readEditorState()).toEqual({})

    await writeFile(root, "editor.yaml", "lastOpened: 7\n")
    expect(await readEditorState()).toEqual({})
  })

  it("keeps editor.yaml outside projects/, so it cannot travel in an export", async () => {
    await createProject("my-story", { manifestText: MANIFEST, scriptText: SCRIPT })
    await writeEditorState({ lastOpened: "my-story" })

    expect(await listProjects()).toEqual([{ directory: "my-story", id: "my-story", title: "My Story" }])
    expect(await readText(await storeRoot(), "editor.yaml")).toContain("lastOpened")
  })
})
