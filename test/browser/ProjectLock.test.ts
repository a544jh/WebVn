import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { takeProjectLock, ProjectLock } from "../../src/storage/projectLock"
import { createProject, readEditorState } from "../../src/storage/projectStore"
import { clearOpfsStore } from "../helpers/opfs"
import { bootStoredEditor, releaseStoredEditorLock } from "../helpers/vnHarness"

// One tab per project. Web Locks are per-origin and shared across tabs, but a test file cannot open
// a second tab - so this tests the layer rather than the browser: taking the lock before calling
// boot is exactly what a second tab does, minus the tab.

// Its own project name, because a lock is per-origin and every browser suite shares one: a directory
// name used by another file would have this suite contending with it rather than with itself.
const DIRECTORY = "lock-test-story"

const MANIFEST = `formatVersion: 1
id: ${DIRECTORY}
title: Lock Test
`

const SCRIPT = "story:\n  - Locked\n"

let taken: ProjectLock[] = []

const holdAsAnotherTab = async (directory: string): Promise<ProjectLock> => {
  const lock = await takeProjectLock(directory)
  if (lock === null) throw new Error("the lock was already held before the test started")
  taken.push(lock)
  return lock
}

const heldLockNames = async (): Promise<string[]> =>
  ((await navigator.locks.query()).held ?? []).map((info) => info.name ?? "")

beforeEach(async () => {
  // A previous test's boot still holds its lock - a real tab releases by going away, and a test file
  // is one tab for its whole run.
  await releaseStoredEditorLock()
  await clearOpfsStore()
  // One project and no editor.yaml: chooseProject falls back to the first of listProjects, so a boot
  // that gets as far as claiming writes `lastOpened` - which is what makes "wrote nothing" testable
  // below without needing an empty library and the demo seed.
  await createProject(DIRECTORY, { manifestText: MANIFEST, scriptText: SCRIPT })
})

afterEach(async () => {
  await Promise.all(taken.map((lock) => lock.release()))
  taken = []
})

describe("navigator.locks", () => {
  // The two platform checks. They matter because the refusal below is only worth anything if the
  // mechanism under it behaves.
  it("refuses a second exclusive request while the first is held, and grants it after a release", async () => {
    const first = await holdAsAnotherTab(DIRECTORY)

    expect(await takeProjectLock(DIRECTORY)).toBe(null)

    await first.release()
    const second = await takeProjectLock(DIRECTORY)
    expect(second).not.toBe(null)
    await second?.release()
  })

  it("holds the lock for the life of the session rather than releasing it on the next tick", async () => {
    await holdAsAnotherTab(DIRECTORY)
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(await heldLockNames()).toContain(`vn-project-${DIRECTORY}`)
  })
})

describe("booting a second tab on one project", () => {
  it("takes the lock, holds it afterwards, and records what it opened", async () => {
    const booted = await bootStoredEditor()

    expect(booted.kind).toBe("booted")
    expect(await heldLockNames()).toContain(`vn-project-${DIRECTORY}`)
    expect(await readEditorState()).toEqual({ lastOpened: DIRECTORY })
  })

  it("refuses cleanly when the lock cannot be taken, mounting nothing and writing nothing", async () => {
    // The test that matters. Everything above it is checking the platform. Taking the lock before
    // calling boot is exactly what a second tab does, minus the tab.
    await holdAsAnotherTab(DIRECTORY)

    const booted = await bootStoredEditor()

    expect(booted.kind).toBe("refused")
    if (booted.kind === "booted") throw new Error("unreachable")
    expect(booted.reason).toContain("another tab")
    // And it wrote nothing on its way to being refused - the previous test shows a boot that gets
    // through writes `lastOpened` here. That is why the lock is taken before claimProject rather
    // than after: a lock taken after the first store was not there for the write it guards.
    expect(await readEditorState()).toEqual({})
  })
})
