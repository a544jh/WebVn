import { z } from "zod"

const Schema = z.array(z.union([z.number(), z.tuple([z.number(), z.number()])]))
type Intervals = z.infer<typeof Schema>

export class ConsecutiveIntegerSet {
  private arr: Intervals = []

  public add(n: number): ConsecutiveIntegerSet {
    if (this.arr.length === 0) {
      this.arr.push(n)
      return this
    }

    for (let i = 0; i < this.arr.length; i++) {
      const item = this.arr[i]
      const lowVal = typeof item === "number" ? item : item[0]
      const highVal = typeof item === "number" ? item : item[1]
      if (n < lowVal - 1) {
        // insert in front
        this.arr.splice(i, 0, n)
        return this
      } else if (n === lowVal - 1) {
        // extend low
        if (typeof item === "number") {
          this.arr[i] = [n, item]
        } else {
          item[0] = n
        }
        return this
      } else if (n >= lowVal && n <= highVal) {
        // in set, do nothing
        return this
      } else if (i < this.arr.length - 1 && n === highVal + 1 && n === getLowVal(this.arr[i + 1]) - 1) {
        // merge 3
        // [1,2]   [4,6] => [1,6]
        if (typeof item === "number") {
          this.arr[i] = [item, getHighVal(this.arr[i + 1])]
        } else {
          item[1] = getHighVal(this.arr[i + 1])
        }
        this.arr.splice(i + 1, 1)
        return this
      } else if (n === highVal + 1) {
        // extend high
        if (typeof item === "number") {
          this.arr[i] = [item, n]
        } else {
          item[1] = n
        }
        return this
      }
    }
    // append to end
    this.arr.push(n)
    return this
  }

  public contains(n: number): boolean {
    // TODO could maybe binary search instead
    for (const item of this.arr) {
      if ((typeof item === "number" && n < item) || (Array.isArray(item) && n < item[0])) {
        // array is sorted, already went past
        return false
      } else if (item === n) {
        return true
      } else if (Array.isArray(item) && n >= item[0] && n <= item[1]) {
        return true
      }
    }
    return false
  }

  public toJson(): string {
    return JSON.stringify(this.arr)
  }

  public static fromJson(s: string): ConsecutiveIntegerSet {
    const newSet = new ConsecutiveIntegerSet()
    newSet.arr = Schema.parse(JSON.parse(s))
    return newSet
  }
}

function getLowVal(item: number | [number, number]): number {
  return typeof item === "number" ? item : item[0]
}

function getHighVal(item: number | [number, number]): number {
  return typeof item === "number" ? item : item[1]
}
