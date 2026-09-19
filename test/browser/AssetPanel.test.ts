import { describe, expect, it } from "vitest"
import { blurEditor, servedAssets, StartedEditor, startEditor, typeManifest, waitFor } from "../helpers/vnHarness"

// The column to the right of the stage: a read-only list of everything the project declares.
//
// The resolver these mount with points at what vitest serves out of the repo root, so `a.png` and
// `b.png` are files that are there and anything else is a file that is not - which is how both
// halves of the missing-file state are reachable without a store.

const SCRIPT = "story:\n  - A line.\n"

const MANIFEST = `formatVersion: 1
id: asset-panel-suite
title: Asset Panel Suite
backgrounds:
  cliffs: a.png
  jetty: b.png
audioAssets:
  waves: sfx/bigthump.ogg
actors:
  A1:
    sprites:
      idle: idle.png
`

// Panel reads, the way an author reads the column.
const groupHeaders = (started: StartedEditor): string[] =>
  [...started.panelRoot.querySelectorAll(".vn-asset-group")].map(
    (header) => (header.querySelector(".vn-asset-group-name") as HTMLElement).textContent ?? ""
  )

const rowKeys = (started: StartedEditor): string[] =>
  [...started.panelRoot.querySelectorAll(".vn-asset-row")].map((row) => (row as HTMLElement).dataset.vnAsset ?? "")

const row = (started: StartedEditor, key: string): HTMLElement =>
  started.panelRoot.querySelector(`.vn-asset-row[data-vn-asset="${key}"]`) as HTMLElement

const header = (started: StartedEditor, key: string): HTMLElement =>
  started.panelRoot.querySelector(`.vn-asset-group[data-vn-asset-group="${key}"]`) as HTMLElement

const fileOf = (elem: HTMLElement): string =>
  (elem.querySelector(".vn-asset-file") as HTMLElement | null)?.textContent ?? ""

// The colour a marked element actually renders, not the token it names - the same reason
// `markedLines` computes rather than reads the specified value.
const inkOf = (elem: Element): string => getComputedStyle(elem).color

const ORANGE = "rgb(255, 165, 0)"

describe("the asset panel", () => {
  it("draws the manifest's three groups and the ids under them", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    expect(groupHeaders(started)).toEqual(["Backgrounds", "Audio", "Actors", "A1"])
    expect(rowKeys(started)).toEqual([
      "backgrounds/cliffs",
      "backgrounds/jetty",
      "audioAssets/waves",
      "actors/A1/sprites/idle",
    ])
    // The id leads and the filename trails it, which is the row saying which of the two kinds of
    // word each is.
    expect((row(started, "backgrounds/cliffs").querySelector(".vn-asset-id") as HTMLElement).textContent).toBe("cliffs")
    expect(fileOf(row(started, "backgrounds/cliffs"))).toBe("a.png")
  })

  it("says how much is under each header, so a folded group still says how much it is hiding", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    const counts = [...started.panelRoot.querySelectorAll(".vn-asset-group-count")].map((span) => span.textContent)
    // Two backgrounds, one track, one actor, and that actor's one sprite.
    expect(counts).toEqual(["2", "1", "1", "1"])
  })

  it("folds a group away and back, and keeps the fold across a redraw", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    header(started, "backgrounds").click()
    expect(header(started, "backgrounds").getAttribute("aria-expanded")).toBe("false")
    expect(rowKeys(started)).toEqual(["audioAssets/waves", "actors/A1/sprites/idle"])

    // A redraw is what a manifest adoption causes, and a collapse that lived in the markup would
    // spring open under one.
    typeManifest(started, MANIFEST + "  A2:\n    sprites:\n      idle: idle.png\n")
    await blurEditor(started)
    await waitFor("the new actor to be drawn", () => groupHeaders(started).includes("A2"))
    expect(header(started, "backgrounds").getAttribute("aria-expanded")).toBe("false")

    header(started, "backgrounds").click()
    expect(rowKeys(started)).toContain("backgrounds/cliffs")
  })

  it("redraws when an adopted manifest declares something new", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })

    typeManifest(started, MANIFEST.replace("  jetty: b.png\n", "  jetty: b.png\n  lamp: b.png\n"))
    await blurEditor(started)

    await waitFor("the new background to be drawn", () => rowKeys(started).includes("backgrounds/lamp"))
    expect(fileOf(row(started, "backgrounds/lamp"))).toBe("b.png")
  })

  it("keeps the last manifest that parsed on screen, and says that is what it is showing", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })
    expect(started.panelRoot.querySelector(".vn-asset-panel-stale")).toBeNull()

    typeManifest(started, "formatVersion: 1\nid: asset-panel-suite\ntitle: [\n")
    await blurEditor(started)

    await waitFor(
      "the panel to say it is stale",
      () => started.panelRoot.querySelector(".vn-asset-panel-stale") !== null
    )
    // The tree is the one that *was* adopted, not an empty one: docs/adr/0002's other half.
    expect(rowKeys(started)).toContain("backgrounds/cliffs")
    expect((started.panelRoot.querySelector(".vn-asset-panel-stale") as HTMLElement).textContent).toBe(
      "the last manifest that parsed"
    )
  })

  it("goes orange on a declared file that is not there, and on its group header", async () => {
    const started = await startEditor(MANIFEST.replace("jetty: b.png", "jetty: storm.png"), SCRIPT, {
      resolver: servedAssets(),
    })

    await waitFor("the missing file to be reported", () =>
      row(started, "backgrounds/jetty").classList.contains("vn-asset-missing")
    )

    const missing = row(started, "backgrounds/jetty")
    expect(inkOf(missing.querySelector(".vn-asset-file") as Element)).toBe(ORANGE)
    // Said as well as coloured: a filename is the one thing an author cannot check by reading the
    // two documents.
    expect((missing.querySelector(".vn-asset-note") as HTMLElement).textContent).toBe("not drawn yet")
    // The header wears the worst level under it, which is what makes a folded group still honest.
    expect(inkOf(header(started, "backgrounds"))).toBe(ORANGE)

    // And nothing marks the file that *is* there: green means stored, and spending it here would
    // cost that.
    const present = row(started, "backgrounds/cliffs")
    expect(present.classList.contains("vn-asset-missing")).toBe(false)
    expect(inkOf(present.querySelector(".vn-asset-file") as Element)).not.toBe(ORANGE)
  })

  it("carries a missing sprite's orange up through its actor to the Actors group", async () => {
    const started = await startEditor(MANIFEST.replace("idle: idle.png", "idle: worried.png"), SCRIPT, {
      resolver: servedAssets(),
    })

    await waitFor("the missing sprite to be reported", () =>
      row(started, "actors/A1/sprites/idle").classList.contains("vn-asset-missing")
    )
    expect(inkOf(header(started, "actors/A1"))).toBe(ORANGE)
    expect(inkOf(header(started, "actors"))).toBe(ORANGE)
  })

  it("shows the empty state for a project straight out of mintProject", async () => {
    const started = await startEditor("formatVersion: 1\nid: asset-panel-empty\ntitle: Empty\n", SCRIPT)

    expect(started.panelRoot.querySelectorAll(".vn-asset-group")).toHaveLength(0)
    expect((started.panelRoot.querySelector(".vn-asset-empty") as HTMLElement).textContent).toBe(
      "Nothing declared yet.Add a file, or write it into manifest.yaml."
    )
  })

  // seedActors merges both in on every boot, so a panel reading the state rather than the manifest
  // would draw two actors nobody wrote down.
  it("does not draw the engine's own actors", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })
    expect(groupHeaders(started)).not.toContain("default")
    expect(groupHeaders(started)).not.toContain("narrator")
  })

  // **A long list scrolls rather than growing the page**, which is what the whole column's height
  // exists to make true: the panel ends level with the bottom of the scene and the list is what
  // moves. It used to rely on `align-items: stretch` in the row to bound it, and stretch takes the
  // *largest* item, so a list past 720px pushed the panel down the page and nothing ever overflowed.
  //
  // Asserted on the offsets rather than on viewport rects, because a scroll container is exactly the
  // thing that makes the two disagree.
  it("keeps the panel the height of the scene and scrolls a list too long for it", async () => {
    // Under `backgrounds:`, where the group already is - appended to the whole manifest these would
    // land under `actors:` instead, and be 80 complaints about an actor key that is not capitalized.
    const many = Array.from({ length: 80 }, (_, n) => `  bg${n}: a.png`).join("\n")
    const started = await startEditor(MANIFEST.replace("  jetty: b.png", `  jetty: b.png\n${many}`), SCRIPT, {
      resolver: servedAssets(),
    })
    const panel = started.panelRoot.querySelector(".vn-asset-panel") as HTMLElement
    const list = started.panelRoot.querySelector(".vn-asset-list") as HTMLElement

    expect(rowKeys(started).length).toBeGreaterThan(80)
    expect(panel.offsetHeight).toBe(720)
    // The list is what has more in it than fits, and the panel is not: a footer scrolled off the
    // bottom would be the same overflow in the wrong element.
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight)
    expect(panel.scrollHeight).toBe(panel.clientHeight)
    // The Add asset button is still on screen, which is the point of the footer being outside the
    // scroll container.
    const add = started.panelRoot.querySelector(".vn-asset-add") as HTMLElement
    expect(add.offsetTop + add.offsetHeight).toBeLessThanOrEqual(panel.offsetTop + 720)
  })

  it("draws nothing once it is stopped, whatever the editor goes on reporting", async () => {
    const started = await startEditor(MANIFEST, SCRIPT, { resolver: servedAssets() })
    started.assetPanel.stop()
    expect(started.panelRoot.children).toHaveLength(0)

    typeManifest(started, MANIFEST + "  A2:\n    sprites:\n      idle: idle.png\n")
    await blurEditor(started)
    expect(started.panelRoot.children).toHaveLength(0)
  })
})
