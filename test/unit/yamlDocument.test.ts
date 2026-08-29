import { describe, expect, it } from "vitest"
import { splitDocuments } from "../../src/yamlParser/yamlDocument"

// The transport half of docs/adr/0003-the-url-payload-carries-the-manifest.md: a payload is a
// `---` separated stream, and each half has to come back out as the text that went in so the two
// parsers can read them on their own.

const manifest = `# A leading comment.
formatVersion: 1
id: a-story
`

const script = `story:
  - First line
`

describe("splitDocuments", () => {
  it("splits a two-document stream back into its parts", () => {
    expect(splitDocuments(manifest + "---\n" + script)).toEqual([manifest, script])
  })

  it("keeps a comment that sits above the first document", () => {
    expect(splitDocuments(manifest + "---\n" + script)[0]).toContain("# A leading comment.")
  })

  it("returns a single-document stream as one part", () => {
    expect(splitDocuments(script)).toEqual([script])
  })

  it("does not split on a --- that is inside a value", () => {
    const inline = `story:
  - "a line with --- in it"
`
    expect(splitDocuments(inline)).toEqual([inline])
  })
})
