import { describe, expect, it } from "vitest"
import { decodeProject, decodePayload, encodeProject, encodePayload, playerUrl } from "../../src/scriptUrl"

const manifest = `# A comment the payload has to keep.
formatVersion: 1
id: shared-story
title: A Shared Story
`

const script = `
story:
  - First line
  - Second line
`

describe("story url encoding", () => {
  it("round trips a manifest and a script", async () => {
    expect(await decodeProject(await encodeProject(manifest, script))).toEqual([manifest, script])
  })

  it("puts the manifest first", async () => {
    const [first] = await decodeProject(await encodeProject(manifest, script))
    expect(first).toBe(manifest)
  })

  it("refuses a single-document payload", async () => {
    // A link shared before the manifest travelled. Reading it as a script against the demo's
    // manifest would give every shared story the same id, which is the same save key - see
    // docs/adr/0003-the-url-payload-carries-the-manifest.md.
    await expect(decodeProject(await encodePayload(script))).rejects.toThrow()
  })

  it("encodes to characters that need no url escaping", async () => {
    const encoded = await encodeProject(manifest, script)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("survives a trip through the query string the player reads", async () => {
    const encoded = await encodeProject(manifest, script)
    const vn = new URL(playerUrl(encoded, "https://example.com/webvn/index.html")).searchParams.get("vn")
    expect(vn).toBe(encoded)
    expect(await decodeProject(vn as string)).toEqual([manifest, script])
  })

  it("round trips text on its own", async () => {
    expect(await decodePayload(await encodePayload(script))).toBe(script)
  })

  it("points at the player next to the page that exported it", () => {
    expect(playerUrl("abc", "https://example.com/webvn/index.html")).toBe(
      "https://example.com/webvn/player.html?vn=abc"
    )
    expect(playerUrl("abc", "https://example.com/webvn/")).toBe("https://example.com/webvn/player.html?vn=abc")
  })

  it("does not carry the exporting page's own query string along", () => {
    expect(playerUrl("abc", "https://example.com/webvn/index.html?vn=stale&x=1")).toBe(
      "https://example.com/webvn/player.html?vn=abc"
    )
  })
})
