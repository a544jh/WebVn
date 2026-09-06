import { InTurn } from "../../src/picker/ProjectPicker"

// The host's queue, for a suite that is not testing the queue: the job runs the moment it is asked
// for. Named rather than written out as `(job) => job()` at five call sites, because what it stands
// in for is worth saying once - `AppShell.queue`, which is what stops a view swap interleaving with
// a write that holds a lock.
//
// A suite that *is* about that ordering should drive a real `AppShell` instead, which is what
// `test/browser/AppShell.test.ts` does.
export const immediately: InTurn = (job) => job()
