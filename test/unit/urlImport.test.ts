import { describe, expect, it } from "vitest"
import { sizeLabel } from "../../src/storage/persistence"
import { Allowance, metered, PassedAllowance, Watchdog } from "../../src/storage/urlImport"

// The two guards URL import streams every file through, which a static test server cannot make fire:
// the running byte total, and the stall timeout. What a folder is refused for is the browser suite's,
// against real fetch; the 30-second stall itself is checked by hand.

const bytes = (length: number): Uint8Array => new Uint8Array(length)

// A body that arrives in the chunks given, as a response's does.
const body = (...chunks: number[]): ReadableStream<Uint8Array> =>
  new ReadableStream({
    start(controller) {
      for (const length of chunks) controller.enqueue(bytes(length))
      controller.close()
    },
  })

// Drains a stream and says how many bytes came out the other end.
const drained = async (stream: ReadableStream<Uint8Array>): Promise<number> => {
  let total = 0
  await stream.pipeTo(new WritableStream({ write: (chunk) => void (total += chunk.byteLength) }))
  return total
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe("metered", () => {
  it("lets every byte through, and counts it", async () => {
    const allowance: Allowance = { used: 0, limit: 100 }

    expect(await drained(body(10, 20, 30).pipeThrough(metered(allowance, () => undefined)))).toBe(60)
    expect(allowance.used).toBe(60)
  })

  it("counts across every file of one import, since the limit is the import's and not the file's", async () => {
    const allowance: Allowance = { used: 0, limit: 100 }

    await drained(body(40).pipeThrough(metered(allowance, () => undefined)))
    await drained(body(40).pipeThrough(metered(allowance, () => undefined)))

    expect(allowance.used).toBe(80)
  })

  it("stops the moment the total passes the limit, partway through a file", async () => {
    const allowance: Allowance = { used: 90, limit: 100 }
    let passed = 0

    const flowing = body(5, 5, 5, 5).pipeThrough(metered(allowance, () => undefined))
    await expect(
      flowing.pipeTo(new WritableStream({ write: (chunk) => void (passed += chunk.byteLength) }))
    ).rejects.toBeInstanceOf(PassedAllowance)
    // The chunk that crossed the line is not handed on.
    expect(passed).toBe(10)
  })

  it("says each chunk arrived, which is what keeps a slow file alive", async () => {
    let heard = 0

    await drained(body(1, 1, 1).pipeThrough(metered({ used: 0, limit: 100 }, () => heard++)))

    expect(heard).toBe(3)
  })
})

describe("Watchdog", () => {
  it("abandons a request that has delivered nothing for its whole interval", async () => {
    const watchdog = new Watchdog(20)

    await sleep(60)

    expect(watchdog.stalled).toBe(true)
    expect(watchdog.signal.aborted).toBe(true)
  })

  it("lets a request live as long as it keeps delivering", async () => {
    const watchdog = new Watchdog(40)

    for (let i = 0; i < 5; i++) {
      await sleep(15)
      watchdog.fed()
    }

    expect(watchdog.stalled).toBe(false)
    watchdog.stop()
  })

  it("does nothing once stopped", async () => {
    const watchdog = new Watchdog(20)
    watchdog.stop()

    await sleep(60)

    expect(watchdog.signal.aborted).toBe(false)
  })
})

describe("the size a limit is said in", () => {
  it("is gigabytes once it is that big, as the canvas's banner says it", () => {
    expect(sizeLabel(1_400_000_000)).toBe("1.4 GB")
    expect(sizeLabel(2_000_000_000)).toBe("2.0 GB")
  })

  it("is megabytes below that, where a fraction of a gigabyte would read as nothing", () => {
    expect(sizeLabel(350_000_000)).toBe("350.0 MB")
  })
})
