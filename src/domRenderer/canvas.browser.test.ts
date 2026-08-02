import { describe, it, expect } from "vitest"

describe("browser environment", () => {
  it("provides a working Canvas2D context", () => {
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    expect(ctx).not.toBeNull()
  })
})
