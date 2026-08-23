import { describe, expect, it } from "vitest"
import { decodeScript, encodeScript, playerUrl } from "../../src/scriptUrl"

const script = `
story:
  - First line
  - Second line
`

describe("script url encoding", () => {
  it("round trips a script", async () => {
    expect(await decodeScript(await encodeScript(script))).toBe(script)
  })

  it("encodes to characters that need no url escaping", async () => {
    const encoded = await encodeScript(script)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it("survives a trip through the query string the player reads", async () => {
    const encoded = await encodeScript(script)
    const vn = new URL(playerUrl(encoded, "https://example.com/webvn/index.html")).searchParams.get("vn")
    expect(vn).toBe(encoded)
    expect(await decodeScript(vn as string)).toBe(script)
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
