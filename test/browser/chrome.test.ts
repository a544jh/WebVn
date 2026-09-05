import { beforeEach, describe, expect, it } from "vitest"
import { confirmDialog, openDialog } from "../../src/chrome/dialog"
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

// The confirm-and-prompt surface, exercised on its own rather than through either of its two hosts.
// It is `<dialog>` and `showModal()`, so the platform supplies the backdrop, the top layer and the
// focus trap - what is worth testing here is the part this file wrote.
describe("the dialog surface", () => {
  const dialogEl = (): HTMLDialogElement => document.querySelector("dialog.vn-dialog") as HTMLDialogElement

  it("resolves true on confirm and takes itself down", async () => {
    const answered = confirmDialog("Delete it?", ["This cannot be undone."], "Delete")
    ;(dialogEl().querySelector(".vn-dialog-confirm") as HTMLButtonElement).click()

    expect(await answered).toBe(true)
    expect(document.querySelector("dialog.vn-dialog")).toBe(null)
  })

  it("resolves false however it is closed", async () => {
    // Cancel and Escape are one code path: both end in a `close` event, which is where this is
    // taken down. Escape itself is the user agent's and cannot be raised from script, so the close
    // is issued directly - which is exactly what the platform does when Escape is pressed.
    const answered = confirmDialog("Delete it?", [], "Delete")
    dialogEl().close()

    expect(await answered).toBe(false)
    expect(document.querySelector("dialog.vn-dialog")).toBe(null)
  })

  it("keeps a refused confirm on screen, with what was typed still in it", async () => {
    const content = document.createElement("input")
    content.value = "half typed"
    let refuse = "Not yet."
    const answered = openDialog({
      title: "Name it",
      content,
      validate: () => (refuse === "" ? null : refuse),
    })

    const confirm = dialogEl().querySelector(".vn-dialog-confirm") as HTMLButtonElement
    confirm.click()
    expect(dialogEl()).not.toBe(null)
    expect((dialogEl().querySelector(".vn-dialog-problem") as HTMLElement).textContent).toBe("Not yet.")
    expect((dialogEl().querySelector("input") as HTMLInputElement).value).toBe("half typed")

    // And the message describes this attempt rather than the last one.
    refuse = ""
    confirm.click()
    expect(await answered).toBe(true)
  })
})
