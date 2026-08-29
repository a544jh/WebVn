import { describe, expect, it } from "vitest"
import { VnManifest } from "../../src/core/manifest"
import { nameTag, sleep, startVn, textBoxText } from "../helpers/vnHarness"

// The ADV box under overlapping render passes - ROUGH_EDGES.md's "sub-renderers can write into an
// element a newer render already replaced". `renderAdv` clears the box and then appends to it, and
// anything between those two writes is a window a second pass can land in, which is how a line came
// out doubled ("ByeBye").
//
// What is pinned here is the half that no longer has a window: an unanimated render lands in one
// synchronous step, because there is nothing to sequence when nothing animates. The other half -
// two animated passes suspended over the same box - still wants the render generation threaded into
// the sub-renderers, and is left as that entry describes.
//
// Neither half is reachable from the UI today: every DOM event, timer tick and auto-advance is a
// turn of its own. This test therefore issues the renders directly, which is also the only way the
// doubling was ever reproduced.

const MANIFEST: VnManifest = {
  id: "textbox",
  title: "Text Box",
  actors: { A1: { name: "Ada" } },
  backgrounds: {},
  audioAssets: {},
}

const script = `
story:
  - A1: "first line"
  - A1: "second line"
`

describe("the ADV text box under overlapping renders", () => {
  it("lands in one step, so unanimated renders issued in the same turn do not stack their text", async () => {
    const { root, renderer } = await startVn(script, { manifest: MANIFEST })

    renderer.render(false)
    renderer.render(false)
    renderer.render(false)
    await sleep(300)

    expect(textBoxText(root)).toBe("first line")
    expect(nameTag(root)?.textContent).toBe("Ada")
  })
})
