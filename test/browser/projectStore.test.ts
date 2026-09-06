import { beforeEach, describe, expect, it } from "vitest"
import { parseManifest } from "../../src/yamlParser/parseManifest"
import { YamlParser } from "../../src/yamlParser/YamlParser"
import {
  createProject,
  forgetProject,
  mintProject,
  recordOpened,
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

// A scratch directory no other suite uses - see test/helpers/opfs.ts.
const SCRATCH = "test-scratch-project-store"

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
  await clearOpfsStore(SCRATCH)
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
    const root = await storeRoot(SCRATCH)
    await writeFile(root, "projects/residue/script.yaml", SCRIPT)

    expect(await listProjects()).toEqual([])
  })

  it("lists a project whose manifest does not parse, with no id and no title", async () => {
    // An author's project with a typo in it. Dropping it would make the picker the one place they
    // cannot go to fix it, and the editor opens a broken manifest perfectly well already (ADR 0002).
    const root = await storeRoot(SCRATCH)
    await writeFile(root, "projects/broken/manifest.yaml", "id: [unclosed\n")
    await writeFile(root, "projects/broken/script.yaml", SCRIPT)

    expect(await listProjects()).toEqual([{ directory: "broken", id: null, title: null }])
  })

  it("reports a directory and a manifest id that disagree, and rewrites neither", async () => {
    // The state the rename ticket exists to resolve, and the reason ProjectSummary is a summary
    // rather than a list of ids. The fix is always to rename the directory to match the manifest -
    // never to rewrite the manifest to match the directory, which is the cheap-looking direction.
    const root = await storeRoot(SCRATCH)
    await writeFile(root, "projects/old-name/manifest.yaml", MANIFEST)
    await writeFile(root, "projects/old-name/script.yaml", SCRIPT)

    expect(await listProjects()).toEqual([{ directory: "old-name", id: "my-story", title: "My Story" }])
    expect(await readText(root, "projects/old-name/manifest.yaml")).toBe(MANIFEST)
  })

  it("refuses an id that cannot name a directory", async () => {
    await expect(mintProject("MyStory", "My Story")).rejects.toThrow(/a-z/)
    await expect(mintProject("con", "Con")).rejects.toThrow(/reserved device name/)
    await expect(mintProject("..", "Dots")).rejects.toThrow(/a-z/)
    await expect(mintProject("", "Nameless")).rejects.toThrow(/a-z/)

    expect(await listProjects()).toEqual([])
  })

  it("mints a project that parses clean, under the title it was given", async () => {
    // A genuinely empty script.yaml has no `story` key, which parseStory reports - so a brand-new
    // project would open with a red gutter as its first impression.
    await mintProject("fresh", "A Fresh Start")

    const { manifestText, scriptText } = await readProject("fresh")
    const [manifest, manifestErrors] = parseManifest(manifestText)
    expect(manifestErrors).toEqual([])
    if (manifest === null) throw new Error("the minted manifest does not parse")
    expect(manifest.id).toBe("fresh")
    // The title the author typed, not a copy of the id: the picker shows one and addresses by the
    // other.
    expect(manifest.title).toBe("A Fresh Start")
    expect(YamlParser.parseStory(scriptText, manifest)[1]).toEqual([])
    expect(YamlParser.parseStory(scriptText, manifest)[0].commands.length).toBeGreaterThan(0)
  })

  it("mints a manifest that parses for every id the schema accepts", async () => {
    // `true`, `false` and `null` fit the id charset and are the three YAML reads as scalars rather
    // than strings, so an interpolated `id: true` produced a manifest that does not parse - exactly
    // the red gutter minting exists to avoid. Measured 2026-09-05 before this was serialized.
    for (const id of ["true", "false", "null", "no", "on", "y"]) {
      await mintProject(id, `Project ${id}`)
      const [manifest, errors] = parseManifest((await readProject(id)).manifestText)
      expect(errors).toEqual([])
      expect(manifest?.id).toBe(id)
    }
  })

  it("mints a manifest that parses for a title with YAML in it", async () => {
    // Free text the author typed, so a quote, a colon or a newline would break any hand-rolled
    // quoting. The serializer knows those rules and this module does not have to.
    await mintProject("quoted", 'He said: "hi"\nand left')

    const [manifest, errors] = parseManifest((await readProject("quoted")).manifestText)
    expect(errors).toEqual([])
    expect(manifest?.title).toBe('He said: "hi"\nand left')
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
    const root = await storeRoot(SCRATCH)
    await writeFile(root, "projects/my-story/assets/backgrounds/a.png", "not really a png")

    await deleteProject("my-story")

    expect(await listProjects()).toEqual([])
    await expect(readProject("my-story")).rejects.toThrow()
  })

  it("round-trips the editor's own bookkeeping", async () => {
    const state = {
      lastOpened: { "my-story": "2026-09-05T10:00:00.000Z" },
      created: { "my-story": "2026-09-01T09:00:00.000Z" },
      exported: { "my-story": "2026-09-06T11:02:31.000Z" },
    }
    await writeEditorState(state)

    expect(await readEditorState()).toEqual(state)
  })

  it("dates a project as it is created, whichever way it was put into the store", async () => {
    // In createProject rather than at each caller, so minting one, seeding the demo and the import
    // that will share this call are all dated by construction. OPFS will not tell us - measured
    // 2026-09-05, it enumerates by name and has no insertion component to read.
    await mintProject("minted", "Minted")
    await createProject("given", { manifestText: MANIFEST, scriptText: SCRIPT })

    const { created } = await readEditorState()
    expect(Object.keys(created ?? {}).sort()).toEqual(["given", "minted"])
    expect(new Date(created?.minted ?? "").getTime()).toBeLessThanOrEqual(Date.now())
  })

  it("forgets a deleted project, so the next one to reuse the id does not inherit its date", async () => {
    // Not tidiness: an entry that outlives its directory would put a brand-new project at the old
    // one's place in the list, dated to work its author never did.
    await mintProject("my-story", "My Story")
    await recordOpened("my-story")
    const first = (await readEditorState()).created?.["my-story"]

    await deleteProject("my-story")
    await forgetProject("my-story")
    expect(await readEditorState()).toEqual({ lastOpened: {}, created: {}, exported: {} })

    await mintProject("my-story", "Someone Else's")
    expect((await readEditorState()).created?.["my-story"]).not.toBe(first)
  })

  it("notes when a project was opened, without dropping what it already knew", async () => {
    // The picker draws "opened 2 days ago" against every row, so this is a moment per project - and
    // a merge rather than a replace, because a rename marker is about to live in this file too.
    await mintProject("my-story", "My Story")
    await mintProject("other-story", "Other Story")
    await recordOpened("my-story")
    await recordOpened("other-story")

    const { lastOpened, created } = await readEditorState()
    expect(Object.keys(lastOpened ?? {}).sort()).toEqual(["my-story", "other-story"])
    // And the creation dates the two projects already had are still there beside them.
    expect(Object.keys(created ?? {}).sort()).toEqual(["my-story", "other-story"])
    expect(new Date(lastOpened?.["my-story"] ?? "").getTime()).toBeLessThanOrEqual(Date.now())
  })

  it("reads a missing or unparseable editor.yaml as empty rather than throwing", async () => {
    // editor.yaml is defined as losable: the store degrades to enumeration without it, and that
    // rule is the migration strategy, which is why the file gets no schema version.
    // A missing file, an unparseable one and one holding nonsense all read the same shape, so no
    // caller has to tell them apart.
    const empty = { lastOpened: {}, created: {}, exported: {} }
    expect(await readEditorState()).toEqual(empty)

    const root = await storeRoot(SCRATCH)
    await writeFile(root, "editor.yaml", "lastOpened: [unclosed\n")
    expect(await readEditorState()).toEqual(empty)

    await writeFile(root, "editor.yaml", "lastOpened: 7\n")
    expect(await readEditorState()).toEqual(empty)
  })

  it("discards the shape tranche 1 wrote rather than migrating it", async () => {
    // `lastOpened: <directory>` was one name, from when there was one project and the field had
    // nothing to decide. Reading it as empty *is* the migration - see EditorState for why this file
    // gets no schema version.
    await writeFile(await storeRoot(SCRATCH), "editor.yaml", "lastOpened: my-story\n")

    expect(await readEditorState()).toEqual({ lastOpened: {}, created: {}, exported: {} })
  })

  it("keeps one unreadable entry from costing the rest", async () => {
    await writeFile(
      await storeRoot(SCRATCH),
      "editor.yaml",
      "lastOpened:\n  good: 2026-09-05T10:00:00.000Z\n  bad: 7\n"
    )

    expect(await readEditorState()).toEqual({
      lastOpened: { good: "2026-09-05T10:00:00.000Z" },
      created: {},
      exported: {},
    })
  })

  it("keeps editor.yaml outside projects/, so it cannot travel in an export", async () => {
    await createProject("my-story", { manifestText: MANIFEST, scriptText: SCRIPT })
    await recordOpened("my-story")

    expect(await listProjects()).toEqual([{ directory: "my-story", id: "my-story", title: "My Story" }])
    expect(await readText(await storeRoot(SCRATCH), "editor.yaml")).toContain("lastOpened")
  })
})
