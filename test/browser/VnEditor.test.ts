import { describe, expect, it } from "vitest"
import {
  blurEditor,
  editorTab,
  errorMarkers,
  nameTag,
  settle,
  startEditor,
  StartedEditor,
  typeManifest,
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

describe("adopting a manifest", () => {
  it("makes the script mean the new manifest's actors", async () => {
    const vn = await started()
    expect(nameTag(vn.root)?.textContent).toBe("Original")

    // Note what is *not* true here: the script buffer is clean and untouched. goToLine skips the
    // reparse when it is, which is right when only the playhead moved and wrong here - the script
    // did not change, its meaning did.
    //
    // The spec asks for this as "an id that was an error under the old manifest is not one under
    // the new". No such error exists yet - parseStory seeds from the manifest and validates no ids
    // against it, which is what ticket 03 (undeclared assets are parse errors) would add - so what
    // is asserted is the other half of the same reparse: the same script saying something else.
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
    expect(editorTab(vn.editorRoot, "manifest").classList.contains("vn-editor-tab-error")).toBe(true)
  })

  it("is not sticky - a valid edit after an invalid one is adopted normally", async () => {
    const vn = await started()
    await adopt(vn, "formatVersion: 1\nid: no-title-here\n")
    await adopt(vn, manifestWith("first-id", "Recovered"))

    expect(nameTag(vn.root)?.textContent).toBe("Recovered")
    expect(vn.editor.isManifestValid()).toBe(true)
    expect(editorTab(vn.editorRoot, "manifest").classList.contains("vn-editor-tab-error")).toBe(false)
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

  it("marks the tab for a declared file that is not there, without calling the manifest invalid", async () => {
    const vn = await started()

    // The two states the badge covers are not the same: a parse failure means the preview is
    // running a *different* manifest, a load failure means it is running this one with a file
    // missing under it. The badge means "this buffer is not fully in effect", which is both -
    // otherwise a filename typo stays invisible until the story reaches the asset and throws.
    await adopt(
      vn,
      `${manifestWith("first-id", "Original")}
backgrounds:
  nowhere: no-such-file.png
`
    )

    expect(vn.editor.isManifestValid()).toBe(true)
    expect(editorTab(vn.editorRoot, "manifest").classList.contains("vn-editor-tab-error")).toBe(true)
    // Adopted regardless: declaring an asset before the art exists is the normal authoring order.
    expect(nameTag(vn.root)?.textContent).toBe("Original")
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
