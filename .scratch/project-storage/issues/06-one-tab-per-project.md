# One tab per project, via navigator.locks

Status: ready-for-agent

Needs 05, and lands immediately after it. `design-docs/PROJECT_STORAGE.md`, "Load-bearing details":
*two tabs on one project race the editor's storing*.

**This was tranche 2 until ticket 05 made it urgent.** Before storing exists there is no persistence
at all, so a second editor tab costs nothing - it is two independent in-memory sessions and the loser
is whoever forgets to copy their text out. After 05 there is exactly one copy of the author's work,
two tabs both storing on a debounce, and last writer wins per file. An author with a second tab open
loses one tab's edits silently.

The indicator from 05 makes it worse rather than better: the losing tab still reads **stored**, which
is true about bytes that have since been overwritten. A truthful indicator over a lossy write is a
more convincing lie than no indicator at all.

So this closes a hazard that exists *only because tranche 1 created it*. Shipping 05 without it means
shipping a known way to lose an author's work, out of the ticket whose entire purpose is durability.

## The mechanism

`navigator.locks.request("vn-project-" + directory, { mode: "exclusive" }, ...)`, held for the
lifetime of the session - the callback returns a promise that never resolves until teardown, which is
how the Web Locks API expresses "hold this".

Take it in the boot sequence, **before** anything is written and before the editor mounts. A lock
taken after the first store is a lock that was not there for the write it was meant to protect.

The second tab does not get an editor. It gets the same refusal surface ticket 05 built for a browser
without OPFS - one message, nothing mounted - with different words: this project is open in another
tab. That is why this ticket is cheap: 05 already had to build "the editor refuses to load and says
why", so there is no new UI here, only a second reason to use it.

Prefer `ifAvailable: true` over waiting: a tab that silently blocks on a lock looks like a hung
editor. Ask, fail fast, say so.

## Details worth getting right

- **Key on the directory, not the manifest id.** Storing addresses the directory (ticket 05), so the
  lock has to guard the same thing the writes address. An author who edits `id:` mid-session has made
  the two disagree, and a lock keyed on the id would stop guarding the files being written.
- **Held for the session, released by the tab going away.** Web Locks are released automatically when
  the holding context dies, which is the property that makes this safe against a crash - unlike a
  flag in `editor.yaml`, which a killed tab would leave set forever and which would need a
  liveness heuristic to clear. Do not build a lock out of stored state.
- **`navigator.locks` needs a secure context**, like OPFS itself. Anything that can run the editor
  can take a lock, so there is no new feature detection - but assert that rather than assuming it,
  and if it is somehow absent, refuse the way an unsupported browser is refused rather than
  proceeding unlocked.
- **A refused tab must not have written anything first.** Check the ordering deliberately: read
  `editor.yaml`, take the lock, and only then seed, open or store.

## Tests

`test/browser/`. Web Locks are per-origin and shared across tabs, but a test file cannot open a
second tab - so test the layer, not the browser:

- boot takes the lock, and the lock is held afterwards (`navigator.locks.query()` shows it)
- a second `request` with `ifAvailable: true` for the same key is refused while the first is held,
  and granted after it is released
- the boot path refuses cleanly when the lock cannot be taken: no editor mounted, no write performed.
  Simulate by taking the lock in the test before calling boot - which is exactly what a second tab
  does, minus the tab.

The last one is the test that matters. The first two are checking the platform.

## Not in scope

- **Read-only mode for the second tab.** The design doc floats "read-only or a banner"; take the
  banner. Read-only means a mounted editor whose stores are suppressed, which is the memory-only path
  ticket 05 explicitly refused, arrived at from a different direction.
- **Cross-tab handoff** - closing tab A and having tab B pick the lock up live. It needs the teardown
  and remount that project switching needs, and that belongs with the picker.
