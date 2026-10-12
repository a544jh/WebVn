import { describe, expect, it, vi } from "vitest"
import { loadableAs } from "../../src/assetLoaders/probe"
import { PNG } from "../helpers/pickedFiles"

// A browser that never says whether it can play a file - neither `canplaythrough` nor `error` until
// something plays, which is mobile Safari's way with media - stood in for by an audio loader that
// never answers. What it can still show, it shows; the rest is a refusal the author sees.
vi.mock("../../src/assetLoaders/AudioAssetLoaderSrc", () => ({ loadAudio: () => new Promise(() => undefined) }))

describe("probing a file on a browser that never answers about audio", () => {
  it("still finds an image", async () => {
    expect(await loadableAs(new File([PNG], "jetty.png"), 50)).toBe("image")
  })

  it("answers neither for the rest, rather than leaving Add asset waiting", async () => {
    expect(await loadableAs(new File(["not art"], "notes.txt"), 50)).toBeNull()
  })
})
