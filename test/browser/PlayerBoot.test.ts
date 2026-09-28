import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { bootPlayer, BootedPlayer, PlayerBoot } from "../../src/playerBoot"
import { encodePayload } from "../../src/scriptUrl"
import { clearSaves, createVnRoot, textBoxText } from "../helpers/vnHarness"
import { manifestNaming } from "../helpers/testManifest"

// The player booting the way `player.html` does, through the function its entry point calls - so
// the path that ships is the path under test. It fetches its story from the folder it is told it is
// served from, and the folder here is the one vitest serves `test-assets/` as: the demo, laid out the
// way `dist/` lays it out.

const served = (path: string): string => new URL(path, location.href).href

const DEMO_FOLDER = served("/test-assets/")
const FIXTURES = served("/test/fixtures/published/")

const PAYLOAD_ID = "player-boot-payload"

let booted: BootedPlayer | null = null
let title = ""

const boot = async (folder: string, payload: string | null = null): Promise<PlayerBoot> => {
  const result = await bootPlayer({ root: createVnRoot(), folder, payload })
  if (result.kind === "booted") booted = result
  return result
}

const expectBooted = (result: PlayerBoot): BootedPlayer => {
  if (result.kind !== "booted") throw new Error(`The player refused: ${result.reason}`)
  return result
}

beforeEach(() => {
  title = document.title
  clearSaves("webvn-demo", PAYLOAD_ID)
})

afterEach(() => {
  booted?.renderer.teardown()
  booted = null
  document.title = title
})

describe("the player, booted from the folder it is served from", () => {
  it("plays that folder's story to its first stop, with every asset resolved against the folder", async () => {
    const result = expectBooted(await boot(DEMO_FOLDER))
    await result.firstStop

    // Resolved against the folder rather than against the page: relative to the runner's own
    // document, `assets/backgrounds/a.png` is a 404 and every declared file would be reported here.
    expect(result.missing).toEqual([])
    expect(result.player.state.id).toBe("webvn-demo")
    expect(result.player.state.commandIndex).toBeGreaterThan(0)
  })

  it("puts the manifest's title on the page", async () => {
    await boot(DEMO_FOLDER)

    expect(document.title).toBe("WebVn Demo")
  })

  it("refuses a folder with no manifest.yaml, and plays nothing", async () => {
    const result = await boot(FIXTURES + "no-manifest/")

    expect(result.kind).toBe("refused")
    if (result.kind === "refused") expect(result.reason).toContain("manifest.yaml")
    expect(textBoxText(document.getElementById("vn-div") as HTMLDivElement)).toBeNull()
  })

  it("refuses a folder with no script.yaml", async () => {
    const result = await boot(FIXTURES + "no-script/")

    expect(result.kind).toBe("refused")
    if (result.kind === "refused") expect(result.reason).toContain("script.yaml")
  })

  it("refuses a folder whose manifest does not parse", async () => {
    const result = await boot(FIXTURES + "unparsed/")

    expect(result.kind).toBe("refused")
    if (result.kind === "refused") expect(result.reason).toContain("does not parse")
  })

  it("says a page opened from the disk has to be served from a web host", async () => {
    // What a reader does first after extracting a published zip, and a page on `file:` may not fetch
    // its neighbours - so the YAML fetch is what fails, and the refusal has to say why.
    const result = await boot("file:///home/someone/Downloads/my-story-published/")

    expect(result.kind).toBe("refused")
    if (result.kind === "refused") expect(result.reason).toContain("web host")
  })
})

describe("the player, booted with a payload", () => {
  const manifest = manifestNaming(PAYLOAD_ID, "A Story In A Link")
  const script = "story:\n  - The line the link carries.\n"

  it("plays the payload rather than the folder", async () => {
    const result = expectBooted(await boot(DEMO_FOLDER, await encodePayload(manifest, script)))
    await result.firstStop

    expect(result.player.state.id).toBe(PAYLOAD_ID)
    expect(textBoxText(document.getElementById("vn-div") as HTMLDivElement)).toBe("The line the link carries.")
  })

  it("puts the payload's title on the page", async () => {
    await boot(DEMO_FOLDER, await encodePayload(manifest, script))

    expect(document.title).toBe("A Story In A Link")
  })

  it("refuses a payload it cannot read", async () => {
    const result = await boot(DEMO_FOLDER, "not-a-payload")

    expect(result.kind).toBe("refused")
  })
})
