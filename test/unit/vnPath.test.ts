import { describe, expect, it } from "vitest"
import { VnPath } from "../../src/core/vnPath"

describe("VnPath", () => {
  describe("advance", () => {
    it("coalesces consecutive advances into a single action", () => {
      const path = VnPath.emptyPath().advance().advance().advance()
      expect(path.getActions()).toHaveLength(1)
      expect(path.getRemainingAdvances()).toBe(3)
    })

    it("does not mutate the original path", () => {
      const one = VnPath.emptyPath().advance()
      const two = one.advance()
      expect(one.getRemainingAdvances()).toBe(1)
      expect(two.getRemainingAdvances()).toBe(2)
      expect(one.getActions()).toHaveLength(1)
    })

    it("starts a new advance run after a decision", () => {
      const path = VnPath.emptyPath().advance().makeDecision(0).advance().advance()
      expect(path.getActions()).toHaveLength(3)
      expect(path.getDecisions()).toEqual([0])
      expect(path.getRemainingAdvances()).toBe(2)
    })
  })

  describe("undo", () => {
    it("splits a partially undone advance run", () => {
      const path = VnPath.emptyPath().advance().advance().advance().advance().advance()
      const undone = path.undo(2)
      expect(undone.getActions()).toHaveLength(1)
      expect(undone.getRemainingAdvances()).toBe(3)
    })

    it("removes an exactly consumed advance run", () => {
      const path = VnPath.emptyPath().advance().advance()
      expect(path.undo(2).getActions()).toEqual([])
    })

    it("crosses action boundaries", () => {
      // 2 advances, a decision, 3 advances; undoing 4 steps eats the trailing run and the decision
      const path = VnPath.emptyPath().advance().advance().makeDecision(1).advance().advance().advance()
      const undone = path.undo(4)
      expect(undone.getActions()).toHaveLength(1)
      expect(undone.getDecisions()).toEqual([])
      expect(undone.getRemainingAdvances()).toBe(2)
    })

    it("counts a decision as one step", () => {
      const path = VnPath.emptyPath().advance().makeDecision(1)
      const undone = path.undo(1)
      expect(undone.getDecisions()).toEqual([])
      expect(undone.getRemainingAdvances()).toBe(1)
    })

    it("returns an empty path when undoing past the beginning", () => {
      const path = VnPath.emptyPath().advance().makeDecision(0).advance()
      expect(path.undo(99).getActions()).toEqual([])
    })

    it("does nothing for zero steps", () => {
      const path = VnPath.emptyPath().advance().makeDecision(2).advance()
      const undone = path.undo(0)
      expect(undone.getDecisions()).toEqual([2])
      expect(undone.getRemainingAdvances()).toBe(1)
    })
  })

  describe("toShorthandPath", () => {
    it("is [0] for the empty path", () => {
      expect(VnPath.emptyPath().toShorthandPath()).toEqual([0])
    })

    it("encodes decision ids in order plus the trailing advances, dropping intermediate advances", () => {
      const path = VnPath.emptyPath()
        .advance()
        .advance()
        .makeDecision(1)
        .advance()
        .advance()
        .advance()
        .makeDecision(0)
        .advance()
        .advance()
      expect(path.toShorthandPath()).toEqual([1, 0, 2])
    })

    it("has zero trailing advances when the path ends on a decision", () => {
      const path = VnPath.emptyPath().advance().makeDecision(2)
      expect(path.toShorthandPath()).toEqual([2, 0])
    })
  })
})
