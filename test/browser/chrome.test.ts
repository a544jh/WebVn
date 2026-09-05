import { beforeEach, describe, expect, it } from "vitest"
import { icon } from "../../src/chrome/icons"

// The authoring chrome's own vocabulary: the face it renders in, the status colours it means things
// by, and the icon helper. Deliberately imported *without* src/editor/editor.ts, because that is the
// property the split buys - the picker draws all three before any VnEditor is constructed, and
// before the tokens moved they resolved only because editor.css happened to be in the bundle.
import "../../src/chrome/chrome.css"
// The stage's theme, so the two faces can be told apart in one document the way the app has them.
import "../../src/domRenderer/defaultTheme.css"

const token = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("the chrome's vocabulary", () => {
  it("resolves the status tokens with no editor on the page", () => {
    expect(token("--vn-editor-status-ok")).toBe("green")
    expect(token("--vn-editor-status-warning")).toBe("orange")
    expect(token("--vn-editor-status-error")).toBe("red")
    expect(token("--vn-editor-marker-position")).toBe("blue")
  })

  it("renders the chrome in Source Sans 3 and the stage in Source Code Pro", () => {
    const stage = document.createElement("div")
    stage.classList.add("vn-textbox-renderer")
    document.body.appendChild(stage)

    expect(getComputedStyle(document.body).fontFamily).toContain("Source Sans 3")
    expect(getComputedStyle(stage).fontFamily).toContain("Source Code Pro")
  })

  it("gives a button the chrome's face, which it would not inherit on its own", () => {
    const button = document.createElement("button")
    document.body.appendChild(button)

    expect(getComputedStyle(button).fontFamily).toContain("Source Sans 3")
  })
})

describe("the icon helper", () => {
  it("returns an SVG element rather than markup", () => {
    expect(icon("chevron-left")).toBeInstanceOf(SVGElement)
  })

  it("hands out independent elements for one name", () => {
    const first = icon("plus")
    const second = icon("plus")

    expect(first).not.toBe(second)
    first.remove()
    expect(second.isConnected).toBe(false)
    // Independent all the way down: a clone shares no child with the template it came from.
    expect(first.firstElementChild).not.toBe(second.firstElementChild)
  })

  it("takes its colour from whatever contains it", () => {
    const row = document.createElement("div")
    row.style.color = "rgb(255, 0, 0)"
    row.appendChild(icon("trash-2"))
    document.body.appendChild(row)

    expect(getComputedStyle(row.firstElementChild as SVGElement).stroke).toBe("rgb(255, 0, 0)")
  })

  it("draws one name at two sizes", () => {
    expect(icon("plus", 24).getAttribute("width")).toBe("24")
    expect(icon("plus").getAttribute("width")).toBe("16")
  })
})
