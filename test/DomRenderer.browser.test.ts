import { describe, expect, it } from "vitest"
import { nextStop, startVn, textBoxText } from "./helpers/vnHarness"

const script = `
story:
  - First line
  - Second line
  - Third line
`

describe("DomRenderer smoke test", () => {
  it("mounts, renders the first line and shows the next ones on advance()", async () => {
    const { root, player, renderer } = await startVn(script)
    expect(textBoxText(root)).toBe("First line")

    for (const line of ["Second line", "Third line"]) {
      const stop = nextStop(renderer, player)
      renderer.advance()
      await stop
      expect(textBoxText(root)).toBe(line)
    }
  })
})
