import { Navigation } from "../../src/projectUrl"

// The address bar, as a test can hold it. `AppShell` is handed one of these rather than
// `browserNavigation()`, which is why `AppShellOptions.navigation` is required: the browser suites
// run in a page whose URL belongs to vitest, and a suite pushing onto it would be writing into the
// runner's own address bar.
//
// It records what was pushed as well as where it ended up, because the two answer different
// questions - "is the author's Back going to work" is about the entries, and "does a reload land
// here" is about the current one.
export interface FakeNavigation extends Navigation {
  // Every push, in order. A replace does not appear: it overwrites where the author is rather than
  // taking them somewhere, which is exactly the distinction a rename test needs to assert.
  readonly pushed: (string | null)[]
  // The browser walking its history - back or forward - which is the one thing the app does not do
  // to itself. Sets the URL and then tells the shell, in that order, because that is the order the
  // real `popstate` arrives in.
  readonly go: (directory: string | null) => void
}

export const fakeNavigation = (initial: string | null = null): FakeNavigation => {
  let current = initial
  let handler: ((directory: string | null) => void) | null = null
  const pushed: (string | null)[] = []

  return {
    current: () => current,
    push: (directory) => {
      current = directory
      pushed.push(directory)
    },
    replace: (directory) => {
      current = directory
    },
    onNavigate: (h) => {
      handler = h
    },
    pushed,
    go: (directory) => {
      current = directory
      handler?.(directory)
    },
  }
}
