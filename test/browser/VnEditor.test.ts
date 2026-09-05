import { describe, expect, it } from "vitest"
import {
  blurEditor,
  clickGutter,
  editorTab,
  errorMarkers,
  markedLines,
  nameTag,
  nextStop,
  settle,
  startEditor,
  StartedEditor,
  textBoxText,
  typeManifest,
  typeScript,
} from "../helpers/vnHarness"

// The first tests VnEditor has ever had. They assert on player and renderer state rather than on
// CodeMirror internals, so they outlive the tab bar the CM6 migration replaces with a file switcher.

const manifestWith = (id: string, actorName: string) => `
formatVersion: 1
id: ${id}
title: A Test Story

actors:
  A1:
    name: ${actorName}
`

const script = `
story:
  - A1: "a line"
`

const started = () => startEditor(manifestWith("first-id", "Original"), script)

const adopt = async (editor: StartedEditor, manifestText: string): Promise<void> => {
  typeManifest(editor, manifestText)
  await blurEditor(editor)
}

// What a tab is saying: the worst level marked in its own gutter. On the manifest, "error" is a
// buffer that did not parse and was never adopted and "warning" is one adopted with a file missing
// under it; on the script, "error" is a story that could not be built and "warning" one built with
// lines that do nothing.
const tabState = (vn: StartedEditor, buffer: "script" | "manifest"): "error" | "warning" | "clean" => {
  const classes = editorTab(vn.editorRoot, buffer).classList
  if (classes.contains("vn-editor-tab-error")) return "error"
  if (classes.contains("vn-editor-tab-warning")) return "warning"
  return "clean"
}

const manifestTabState = (vn: StartedEditor) => tabState(vn, "manifest")

describe("the script tab", () => {
  it("is clean for a script that parses", async () => {
    const vn = await started()

    expect(tabState(vn, "script")).toBe("clean")
  })

  it("goes orange for a reference the manifest does not answer, and clears when the manifest declares it", async () => {
    // The case the script tab exists for: since ADR 0004 an undeclared id is a warning on the
    // script line, but fixing it is a *manifest* edit - so the buffer being edited is not the buffer
    // holding the complaint, and without the tab the author is looking at the wrong one.
    const vn = await startEditor(manifestWith("first-id", "Original"), `story:\n  - Ghost: "who am I"\n`)

    expect(tabState(vn, "script")).toBe("warning")
    // The tab is a summary of the gutter under it, not a second opinion.
    expect(markedLines(vn.editorRoot)).toEqual([
      { line: 2, message: "No actor is declared as Ghost", color: "rgb(255, 165, 0)" }, // orange
    ])

    await adopt(
      vn,
      `${manifestWith("first-id", "Original")}
  Ghost:
    name: A Ghost
`
    )

    expect(tabState(vn, "script")).toBe("clean")
  })

  it("goes red for a script that could not be built at all", async () => {
    const vn = await startEditor(manifestWith("first-id", "Original"), `nothing: here\n`)

    // `story missing.` is an ERROR, unlike a line that merely does nothing - so the tab says red,
    // the same word its gutter is using.
    expect(tabState(vn, "script")).toBe("error")
  })
})

describe("adopting a manifest", () => {
  it("makes the script mean the new manifest's actors", async () => {
    const vn = await started()
    expect(nameTag(vn.root)?.textContent).toBe("Original")

    // Note what is *not* true here: the script buffer is clean and untouched. goToLine skips the
    // reparse when it is, which is right when only the playhead moved and wrong here - the script
    // did not change, its meaning did.
    //
    // The spec asks for this as "an id that was an error under the old manifest is not one under
    // the new". Ticket 03 added that error, but this rename keeps the actor's key and changes only
    // the name it displays under, so what is asserted is the other half of the same reparse: the
    // same script saying something else.
    await adopt(vn, manifestWith("first-id", "Renamed"))

    expect(nameTag(vn.root)?.textContent).toBe("Renamed")
  })

  it("keeps the last valid manifest when the edit does not parse", async () => {
    const vn = await started()
    await adopt(vn, "formatVersion: 1\nid: no-title-here\n")

    // The preview stays on the manifest that last parsed - a broken manifest has no identity to
    // load the project under, so there is nothing to show it as.
    expect(nameTag(vn.root)?.textContent).toBe("Original")
    expect(vn.editor.isManifestValid()).toBe(false)
    expect(errorMarkers(vn.editorRoot).length).toBeGreaterThan(0)
    // Visible from the other buffer, which is the whole point: otherwise the only sign that the
    // preview is running a different manifest is a gutter in a tab nobody is looking at.
    expect(manifestTabState(vn)).toBe("error")
  })

  it("is not sticky - a valid edit after an invalid one is adopted normally", async () => {
    const vn = await started()
    await adopt(vn, "formatVersion: 1\nid: no-title-here\n")
    await adopt(vn, manifestWith("first-id", "Recovered"))

    expect(nameTag(vn.root)?.textContent).toBe("Recovered")
    expect(vn.editor.isManifestValid()).toBe(true)
    expect(manifestTabState(vn)).toBe("clean")
  })

  it("does nothing on a blur that edited nothing", async () => {
    const vn = await started()
    let renders = 0
    vn.renderer.onRenderCallbacks.push(() => renders++)

    // Blur is a much broader event than "I finished editing the manifest": clicking the preview or
    // another browser tab fires it too, and reloading the story out from under the author on each
    // one would make the preview unusable.
    editorTab(vn.editorRoot, "manifest").click()
    await blurEditor(vn)
    await settle()

    expect(renders).toBe(0)
  })

  it("marks the tab in orange for a declared file that is not there, without calling it invalid", async () => {
    const vn = await started()

    // The two states the tab covers are not the same failure, so they are not the same colour: a
    // parse failure means the preview is running a *different* manifest, a load failure means it is
    // running this one with a file missing under it. Both have to say something, or a filename typo
    // stays invisible until the story reaches the asset and throws.
    await adopt(
      vn,
      `${manifestWith("first-id", "Original")}
backgrounds:
  nowhere: no-such-file.png
`
    )

    expect(vn.editor.isManifestValid()).toBe(true)
    expect(manifestTabState(vn)).toBe("warning")
    // Adopted regardless: declaring an asset before the art exists is the normal authoring order.
    expect(nameTag(vn.root)?.textContent).toBe("Original")
  })

  it("marks the declaring line for a file that is not there, not just the tab", async () => {
    const vn = await started()
    const manifest = `${manifestWith("first-id", "Original")}
backgrounds:
  nowhere: no-such-file.png
`
    await adopt(vn, manifest)

    // A filename is the one thing an author cannot check by reading the two documents, so the report
    // has to land on the edit that caused it rather than in the console.
    const marked = markedLines(vn.editorRoot)
    expect(marked).toHaveLength(1)
    expect(marked[0].message).toContain("backgrounds/no-such-file.png")
    // The `nowhere: no-such-file.png` line, 1-based, in the buffer as typed.
    expect(marked[0].line).toBe(manifest.split("\n").findIndex((l) => l.includes("no-such-file")) + 1)
    // Orange, not red: red is for a manifest that did not parse, which is the one that is not
    // adopted. Declaring art nobody has drawn yet is the normal authoring order.
    expect(marked[0].color).toBe("rgb(255, 165, 0)") // orange
  })

  it("says unadopted, not missing-file, when a broken edit lands on top of a missing file", async () => {
    const vn = await started()
    await adopt(
      vn,
      `${manifestWith("first-id", "Original")}
backgrounds:
  nowhere: no-such-file.png
`
    )
    expect(manifestTabState(vn)).toBe("warning")

    await adopt(vn, "formatVersion: 1\nid: no-title-here\n")

    // The missing file is the *last* adoption's news - this buffer never got as far as loading
    // anything. Two colour rules on one tab would otherwise resolve by stylesheet order.
    expect(manifestTabState(vn)).toBe("error")
  })

  it("clears a missing-file marker once the declaration is fixed", async () => {
    const vn = await started()
    await adopt(
      vn,
      `${manifestWith("first-id", "Original")}
backgrounds:
  nowhere: no-such-file.png
`
    )
    expect(markedLines(vn.editorRoot)).toHaveLength(1)

    await adopt(vn, manifestWith("first-id", "Original"))

    expect(markedLines(vn.editorRoot)).toEqual([])
    expect(manifestTabState(vn)).toBe("clean")
  })

  it("writes later saves under the adopted id", async () => {
    const vn = await started()
    // Nothing rekeys the renderer: the id rides in on the state `reloadStory` swaps in, so a caller
    // cannot reload the story and forget the key. ADR 0001's 2026-08-29 amendment.
    await adopt(vn, manifestWith("renamed-id", "Original"))

    vn.root.click()
    await settle()

    expect(localStorage.getItem("vn-save-renamed-id")).not.toBe(null)
    expect(localStorage.getItem("vn-save-first-id")).toBe(null)
  })
})

// Leaving the script buffer reparses it, and the reparse moves the player: the path is cut back to
// what still replays against the new story and `startingState` becomes it. What the editor then
// does with the line it was asked for is a separate question, and the answer can be "nothing" -
// clicking a blank line, or a line whose command an edit has just deleted. The reload has already
// happened by then, so returning without a render leaves the preview quoting a story that is gone.
describe("reparsing on blur", () => {
  const manifest = `
formatVersion: 1
id: reparse-test
title: A Test Story
`

  const script = `
story:
  - "First line"
  - "Second line"
  - "Third line"
`

  // The line the player is parked on is gone from the new script, so goToLine finds no command for
  // it. Breaking the YAML is the bluntest way there and the one an author actually hits.
  const broken = `
story:
  - "First line"
  -- Hello, This is WebVn - A fast visual novel engine for the modern web.
  - "Third line"
`

  const readToTheEnd = async (vn: StartedEditor): Promise<void> => {
    for (let i = 0; i < 2; i++) {
      const stop = nextStop(vn.renderer, vn.player)
      vn.renderer.advance()
      await stop
    }
  }

  it("repaints where the reload landed, even with no command on the line", async () => {
    const vn = await startEditor(manifest, script)
    await readToTheEnd(vn)
    expect(textBoxText(vn.root)).toBe("Third line")

    typeScript(vn, broken)
    await blurEditor(vn)

    // One command left, and the player is on it. The preview used to be left on "Third line",
    // which is not in this story and not where the player is.
    expect(vn.player.state.commands).toHaveLength(1)
    expect(vn.player.state.commandIndex).toBe(1)
    expect(textBoxText(vn.root)).toBe("First line")
  })

  it("leaves a clicked blank line alone when there was nothing to reparse", async () => {
    const vn = await startEditor(manifest, script)
    await readToTheEnd(vn)
    let renders = 0
    vn.renderer.onRenderCallbacks.push(() => renders++)

    // The other side of the repaint: nothing was reparsed, so nothing moved, so a line that holds
    // no command is still the no-op it always was.
    clickGutter(vn, 1)
    await settle()

    expect(renders).toBe(0)
    expect(vn.player.state.commandIndex).toBe(3)
    expect(textBoxText(vn.root)).toBe("Third line")
  })
})
