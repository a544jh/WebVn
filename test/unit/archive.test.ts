import { describe, expect, it } from "vitest"
import {
  archiveFilename,
  ArchiveEntry,
  ImportPlan,
  MAX_ENTRIES,
  MAX_UNPACKED_BYTES,
  planImport,
  readmeText,
  storesWhole,
} from "../../src/storage/archive"
import { manifestNaming } from "../helpers/testManifest"

// The back half of an import, with no zip library and no OPFS in the way - which is the whole point
// of the seam: normalization, every refusal, the caps and the README skip are settled over a listing
// this file builds by hand. What is left for the browser suite is the writing.

const MANIFEST = manifestNaming("cat-adventure", "Cat Adventure")
const SCRIPT = "story:\n  - A line\n"

// An entry as the reader hands one over: a path, the size the central directory claims, and a way to
// put the bytes somewhere. Nothing here ever asks for them except the manifest, which is the property
// being relied on - a refused archive inflates nothing at all.
const entry = (path: string, text = "", size?: number): ArchiveEntry => ({
  path,
  size: size ?? text.length,
  writeTo: (destination) => new Blob([text]).stream().pipeTo(destination),
})

const project = (prefix = ""): ArchiveEntry[] => [
  entry(`${prefix}manifest.yaml`, MANIFEST),
  entry(`${prefix}script.yaml`, SCRIPT),
  entry(`${prefix}assets/backgrounds/room.png`, "png bytes"),
]

// Unlimited room, for a test whose subject is not the quota.
const ROOMY = null

const planned = async (entries: ArchiveEntry[], available: number | null = ROOMY): Promise<ImportPlan> => {
  const plan = await planImport(entries, available)
  if (plan.kind !== "plan") throw new Error(`expected a plan, got: ${plan.problem}`)
  return plan
}

const refusal = async (entries: ArchiveEntry[], available: number | null = ROOMY): Promise<string> => {
  const plan = await planImport(entries, available)
  if (plan.kind !== "refused") throw new Error("expected a refusal, got a plan")
  return `${plan.problem} / ${plan.advice}`
}

const paths = (plan: ImportPlan): string[] => plan.files.map((file) => file.path)

describe("planning an import", () => {
  it("takes its identity from the manifest, not from a filename or a directory", async () => {
    const plan = await planned(project())

    expect(plan.id).toEqual("cat-adventure")
    expect(plan.title).toEqual("Cat Adventure")
    expect(plan.manifestText).toEqual(MANIFEST)
  })

  it("writes every entry but the manifest, which is the commit point and goes last", async () => {
    expect(paths(await planned(project()))).toEqual(["script.yaml", "assets/backgrounds/room.png"])
  })

  it("strips a single wrapping directory, which is what a hand-made zip of a folder has", async () => {
    const plan = await planned(project("cat-adventure/"))

    expect(plan.id).toEqual("cat-adventure")
    expect(paths(plan)).toEqual(["script.yaml", "assets/backgrounds/room.png"])
  })

  it("strips a wrapping directory whatever it is called - the manifest names the project", async () => {
    expect((await planned(project("whatever-they-renamed-it/"))).id).toEqual("cat-adventure")
  })

  it("leaves a project alone when the manifest is already at the root", async () => {
    // A project that happens to hold one directory and nothing else at the top level. There is a
    // manifest at the root, so there is nothing ambiguous to resolve.
    const entries = [...project(), entry("assets/audio/theme.mp3", "mp3 bytes")]

    expect(paths(await planned(entries))).toContain("assets/backgrounds/room.png")
  })

  it("refuses an archive with no manifest at all", async () => {
    expect(await refusal([entry("script.yaml", SCRIPT)])).toMatch(/no manifest\.yaml/)
  })

  it("refuses an archive whose manifest is inside two different directories", async () => {
    // No single prefix to strip, so nothing is stripped and there is no manifest at the root.
    const entries = [...project("one/"), entry("two/notes.txt", "hello")]

    expect(await refusal(entries)).toMatch(/no manifest\.yaml/)
  })

  it("refuses a manifest that does not parse, and quotes the parser", async () => {
    const entries = [entry("manifest.yaml", "formatVersion: 1\nid: [\n"), entry("script.yaml", SCRIPT)]

    expect(await refusal(entries)).toMatch(/manifest\.yaml does not parse/)
  })

  it("refuses a manifest from a format this build does not read, in the parser's own words", async () => {
    const entries = [
      entry("manifest.yaml", "formatVersion: 2\nid: cat-adventure\ntitle: Cat Adventure\n"),
      entry("script.yaml", SCRIPT),
    ]

    expect(await refusal(entries)).toMatch(/It reads 1\./)
  })

  it("refuses an id no directory could be named after, which the manifest schema is what enforces", async () => {
    const entries = [entry("manifest.yaml", manifestNaming("Cat Adventure")), entry("script.yaml", SCRIPT)]

    expect(await refusal(entries)).toMatch(/manifest\.yaml does not parse/)
  })

  it("refuses an archive with no script, which nothing downstream would catch", async () => {
    expect(await refusal([entry("manifest.yaml", MANIFEST)])).toMatch(/no script\.yaml/)
  })

  it.each([
    ["a parent segment", "assets/../../elsewhere/x.png"],
    ["a leading parent segment", "../x.png"],
    ["an absolute path", "/etc/passwd"],
    ["a backslash", "assets\\backgrounds\\room.png"],
    ["a drive letter", "C:/x.png"],
    ["a control character", "assets/ro\u0000om.png"],
  ])("refuses %s in an entry path", async (_what, path) => {
    expect(await refusal([...project(), entry(path, "x")])).toMatch(/outside the project/)
  })

  it("allows a colon that is not a drive letter, since a POSIX filename may hold one", async () => {
    // The blanket rule took a whole archive down over a file an author can perfectly well have.
    expect(paths(await planned([...project(), entry("assets/backgrounds/scene: one.png", "x")]))).toContain(
      "assets/backgrounds/scene: one.png"
    )
  })

  it("allows a dot in a name, which is not a parent segment", async () => {
    expect(paths(await planned([...project(), entry("assets/backgrounds/room.2.png", "x")]))).toContain(
      "assets/backgrounds/room.2.png"
    )
  })

  it("refuses more entries than the cap, before inflating any of them", async () => {
    const many = Array.from({ length: MAX_ENTRIES }, (_unused, i) => entry(`assets/backgrounds/${i}.png`, "x"))

    expect(await refusal([...project(), ...many])).toMatch(/files/)
  })

  it("refuses an archive that unpacks to more than the cap", async () => {
    const huge = entry("assets/audio/theme.mp3", "", MAX_UNPACKED_BYTES + 1)

    expect(await refusal([...project(), huge])).toMatch(/unpacks to/)
  })

  it("refuses an archive that unpacks to more than the browser says is free", async () => {
    const big = entry("assets/audio/theme.mp3", "", 10_000_000)

    expect(await refusal([...project(), big], 1_000_000)).toMatch(/room/)
  })

  it("sums the archive's own claimed sizes rather than inflating to find out", async () => {
    // Two entries that are a byte each and claim to be a gigabyte: the central directory is what the
    // cap is arithmetic over, which is what makes a zip bomb a refusal rather than a race.
    const lying = [entry("assets/a.png", "x", 1_500_000_000), entry("assets/b.png", "x", 1_500_000_000)]

    expect(await refusal([...project(), ...lying])).toMatch(/unpacks to/)
  })

  it("skips the README it generated, by exact path", async () => {
    expect(paths(await planned([...project(), entry("README.txt", "generated")]))).not.toContain("README.txt")
  })

  it("keeps a README the author put inside their own project", async () => {
    expect(paths(await planned([...project(), entry("assets/README.txt", "mine")]))).toContain("assets/README.txt")
  })

  it("skips the README under a wrapping directory too, since that is the same file", async () => {
    const entries = [...project("cat-adventure/"), entry("cat-adventure/README.txt", "generated")]

    expect(paths(await planned(entries))).not.toContain("README.txt")
  })
})

describe("what an archive is called", () => {
  it("is named after the manifest's id, which always exists because export is gated on it", () => {
    expect(archiveFilename("cat-adventure")).toEqual("cat-adventure.webvn.zip")
  })
})

describe("the README inside an archive", () => {
  const readme = readmeText("cat-adventure", "Cat Adventure", new Date("2026-09-06T11:02:31.000Z"))

  it("names the project both ways, because one of them is what it is filed under", () => {
    expect(readme).toContain('"Cat Adventure" (cat-adventure)')
  })

  it("says where to open it, hardcoded - an archive outlives any one deployment of the app", () => {
    expect(readme).toContain("https://a544jh.github.io/webvn-demo/")
  })

  it("points at the source, because the app is free software and this file may outlive it", () => {
    expect(readme).toContain("https://github.com/a544jh/WebVn")
  })

  it("dates itself, to the day", () => {
    expect(readme).toContain("Exported 2026-09-06")
  })
})

describe("what is stored rather than deflated", () => {
  it.each([".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp3", ".ogg", ".m4a", ".aac"])(
    "stores %s whole, because it is already compressed",
    (extension) => {
      expect(storesWhole(`assets/backgrounds/room${extension}`)).toBe(true)
    }
  )

  it.each(["manifest.yaml", "script.yaml", "README.txt", "assets/notes.md"])("deflates %s", (path) => {
    expect(storesWhole(path)).toBe(false)
  })

  it("does not care how the extension is cased", () => {
    expect(storesWhole("assets/backgrounds/ROOM.PNG")).toBe(true)
  })
})
