import { describe, expect, it } from "vitest"
import { projectInUrl, urlForProject } from "../../src/projectUrl"

// The parameter, read and written. `browserNavigation` is not covered here and is not meant to be:
// it is four one-line members over `location` and `history` with no decision in any of them, and
// everything with a decision in it is either in these two functions or in AppShell.

const PAGE = "https://example.test/webvn/index.html"

describe("reading the open project out of a URL", () => {
  it("is the directory the parameter names", () => {
    expect(projectInUrl(`${PAGE}?project=a-story`)).toBe("a-story")
  })

  it("is null for a bare URL, which is the picker", () => {
    expect(projectInUrl(PAGE)).toBe(null)
  })

  it("is null for an empty parameter, which is someone's stripped URL and not a project called nothing", () => {
    expect(projectInUrl(`${PAGE}?project=`)).toBe(null)
  })

  it("ignores everything else in the query", () => {
    expect(projectInUrl(`${PAGE}?debug=1&project=a-story#somewhere`)).toBe("a-story")
  })

  it("hands back what it was given rather than validating it", () => {
    // Deliberate: `isProject` is the question that matters and answers false for anything OPFS will
    // not even name, so a malformed parameter becomes "there is no project called that" rather than
    // a silent drop to the picker.
    expect(projectInUrl(`${PAGE}?project=..%2Fetc`)).toBe("../etc")
  })
})

describe("writing it back", () => {
  it("sets the parameter", () => {
    expect(urlForProject(PAGE, "a-story")).toBe(`${PAGE}?project=a-story`)
  })

  it("replaces one that is already there", () => {
    expect(urlForProject(`${PAGE}?project=a-story`, "another-story")).toBe(`${PAGE}?project=another-story`)
  })

  it("removes it for the picker", () => {
    expect(urlForProject(`${PAGE}?project=a-story`, null)).toBe(PAGE)
  })

  it("leaves the rest of the query alone, so anything else navigates past this", () => {
    expect(urlForProject(`${PAGE}?debug=1`, "a-story")).toBe(`${PAGE}?debug=1&project=a-story`)
    expect(urlForProject(`${PAGE}?debug=1&project=a-story`, null)).toBe(`${PAGE}?debug=1`)
  })

  it("round trips", () => {
    expect(projectInUrl(urlForProject(PAGE, "a-story"))).toBe("a-story")
    expect(projectInUrl(urlForProject(urlForProject(PAGE, "a-story"), null))).toBe(null)
  })
})
