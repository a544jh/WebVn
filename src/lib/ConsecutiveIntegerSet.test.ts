import { describe, it, expect } from "vitest"
import { ConsecutiveIntegerSet } from "./ConsecutiveIntegerSet"

describe("ConsecutiveIntegerSet", () => {
  it("reports contains=false for an empty set", () => {
    const set = new ConsecutiveIntegerSet()
    expect(set.contains(0)).toBe(false)
    expect(set.contains(42)).toBe(false)
  })

  it("contains values it has been given", () => {
    const set = new ConsecutiveIntegerSet()
    set.add(1).add(5).add(10)
    expect(set.contains(1)).toBe(true)
    expect(set.contains(5)).toBe(true)
    expect(set.contains(10)).toBe(true)
    expect(set.contains(2)).toBe(false)
  })

  it("merges adjacent integers into intervals", () => {
    const set = new ConsecutiveIntegerSet()
    set.add(1).add(2).add(3).add(4)
    expect(set.toJSON()).toEqual([[1, 4]])
  })

  it("merges two intervals when filling the gap", () => {
    const set = new ConsecutiveIntegerSet()
    set.add(1).add(2).add(4).add(5)
    expect(set.toJSON()).toEqual([
      [1, 2],
      [4, 5],
    ])
    set.add(3)
    expect(set.toJSON()).toEqual([[1, 5]])
  })

  it("round-trips through toJSON / fromJSON", () => {
    const set = new ConsecutiveIntegerSet()
    set.add(1).add(2).add(3).add(7).add(9).add(10)
    const json = set.toJSON()
    const restored = ConsecutiveIntegerSet.fromJSON(JSON.parse(JSON.stringify(json)))
    expect(restored.contains(2)).toBe(true)
    expect(restored.contains(7)).toBe(true)
    expect(restored.contains(10)).toBe(true)
    expect(restored.contains(4)).toBe(false)
    expect(restored.contains(8)).toBe(false)
  })
})
