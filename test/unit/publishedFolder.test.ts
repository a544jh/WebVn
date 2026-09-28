import { describe, expect, it } from "vitest"
import { VnManifest } from "../../src/core/manifest"
import { publishedFiles, publishedFolderAt } from "../../src/publishedFolder"
import { TEST_MANIFEST } from "../helpers/testManifest"

// What a published folder holds, and what an address typed into Import from URL means - the two pure
// halves of `src/publishedFolder.ts`, which publish and URL import both stand on.

const manifest = (declarations: Partial<VnManifest>): VnManifest => ({ ...TEST_MANIFEST, ...declarations })

describe("publishedFiles", () => {
  it("is the manifest and the script, and nothing else, for a project that declares nothing", () => {
    expect(publishedFiles(manifest({}))).toEqual(["manifest.yaml", "script.yaml"])
  })

  it("carries every declared file at the path the renderer asks for it by", () => {
    const files = publishedFiles(
      manifest({
        backgrounds: { cliffs: "cliffs.png" },
        audioAssets: { waves: { file: "sea/waves.ogg" } },
        actors: { Keeper: { sprites: { idle: "idle.png", worried: "worried.png" } } },
      })
    )

    expect(files).toEqual([
      "manifest.yaml",
      "script.yaml",
      "assets/sprites/Keeper/idle.png",
      "assets/sprites/Keeper/worried.png",
      "assets/backgrounds/cliffs.png",
      "assets/audio/sea/waves.ogg",
    ])
  })

  it("keeps two actors' sprites apart, since each actor has a directory of its own", () => {
    const files = publishedFiles(
      manifest({ actors: { Ann: { sprites: { idle: "idle.png" } }, Bo: { sprites: { idle: "idle.png" } } } })
    )

    expect(files).toContain("assets/sprites/Ann/idle.png")
    expect(files).toContain("assets/sprites/Bo/idle.png")
  })

  it("names a file once however many ids declare it", () => {
    const files = publishedFiles(manifest({ backgrounds: { day: "harbour.png", night: "harbour.png" } }))

    expect(files).toEqual(["manifest.yaml", "script.yaml", "assets/backgrounds/harbour.png"])
  })
})

describe("publishedFolderAt", () => {
  const folder = (typed: string): string => {
    const address = publishedFolderAt(typed)
    if (address.kind !== "folder") throw new Error(`refused: ${address.problem}`)
    return address.url
  }

  it("takes a folder's own address as it stands", () => {
    expect(folder("https://someone.github.io/cat-adventure/")).toBe("https://someone.github.io/cat-adventure/")
  })

  it("gives an address with no filename its trailing slash before anything is fetched", () => {
    // GitHub Pages answers `/name` with a 301 to `/name/` that carries no CORS header, which a page on
    // another origin cannot follow - so the address that redirects is never the one fetched.
    expect(folder("https://a544jh.github.io/webvn-demo")).toBe("https://a544jh.github.io/webvn-demo/")
  })

  it("reads a page or a file in the folder as the folder", () => {
    expect(folder("https://someone.github.io/cat-adventure/index.html")).toBe(
      "https://someone.github.io/cat-adventure/"
    )
    expect(folder("https://a544jh.github.io/webvn-demo/player.html")).toBe("https://a544jh.github.io/webvn-demo/")
    expect(folder("https://someone.github.io/cat-adventure/manifest.yaml")).toBe(
      "https://someone.github.io/cat-adventure/"
    )
  })

  it("takes a host's root, with or without its slash", () => {
    expect(folder("https://cat-adventure.example")).toBe("https://cat-adventure.example/")
    expect(folder("https://cat-adventure.example/")).toBe("https://cat-adventure.example/")
  })

  it("drops a query and a fragment", () => {
    expect(folder("https://someone.github.io/cat-adventure/index.html?from=mail#start")).toBe(
      "https://someone.github.io/cat-adventure/"
    )
    expect(folder("https://someone.github.io/cat-adventure?utm_source=x")).toBe(
      "https://someone.github.io/cat-adventure/"
    )
  })

  it("takes http as well as https, and ignores whitespace pasted around the address", () => {
    expect(folder("  http://localhost:8080/my-story/  ")).toBe("http://localhost:8080/my-story/")
  })

  it("refuses a player link, which carries a script and no art or audio", () => {
    const address = publishedFolderAt("https://a544jh.github.io/webvn-demo/player.html?vn=H4sIAAAAAAAAA41Sy27bMBC8")

    expect(address).toEqual({
      kind: "refused",
      problem:
        "That is a player link. It carries a script but no art or audio - paste the address of the published folder instead.",
    })
  })

  it("refuses anything that is not an http or https address", () => {
    for (const typed of ["cat-adventure", "file:///home/someone/story/", "ftp://example.com/story/", "", "   "]) {
      expect(publishedFolderAt(typed).kind, typed).toBe("refused")
    }
  })
})
