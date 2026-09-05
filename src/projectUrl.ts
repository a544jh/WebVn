// Which project is open, in the address bar: `index.html?project=<directory>`, and the reading and
// writing of it. `.scratch/project-library/issues/06-the-open-project-in-the-url.md` says why a
// query parameter rather than a hash or a path segment - in short, `player.html?vn=` already names
// what to load in a query parameter, and a path segment would need a `<base href>`, a dev-server
// fallback and a Pages 404 shim to buy a prettier string.
//
// This module is to the parameter what `src/scriptUrl.ts` is to `vn=` and `assetPaths.ts` is to the
// `assets/` prefix: the one place it is spelled.

const PROJECT_PARAM = "project"

// **The directory, not the id.** Every read, write, store and lock addresses the directory, and
// `bootEditor` is told one; the id is the manifest's to declare and the two can disagree - a project
// whose manifest does not parse has a directory and no id at all, and it must stay openable.
//
// Not validated against `ID_PATTERN`. `isProject` is the question that actually matters and `exists`
// answers false for anything OPFS will not even name, so a malformed parameter becomes "there is no
// project called that" rather than a silent drop to the picker or a throw.
export const projectInUrl = (href: string): string | null => {
  const directory = new URL(href).searchParams.get(PROJECT_PARAM)
  // An empty parameter is someone's stripped URL, not a project called "".
  return directory === null || directory === "" ? null : directory
}

// The same URL with the parameter set, or removed for the picker. Through `URL` rather than string
// surgery, so anything else in the query - a debug flag, an import payload later - survives being
// navigated past.
export const urlForProject = (href: string, directory: string | null): string => {
  const url = new URL(href)
  if (directory === null) url.searchParams.delete(PROJECT_PARAM)
  else url.searchParams.set(PROJECT_PARAM, directory)
  return url.href
}

// The address bar, as the shell needs it. An interface because the browser suites run in a page
// whose URL belongs to vitest: a suite driving the real one would be writing into the runner's own
// address bar. `AppShellOptions` requires one rather than defaulting to `browserNavigation()`, so
// nothing can take the real thing by forgetting to say.
export interface Navigation {
  // Where the URL says the author is: a directory, or null for the picker.
  readonly current: () => string | null
  // A new entry - the author went somewhere, and Back should come back here.
  readonly push: (directory: string | null) => void
  // The same entry, said better: a rename, which moved the project under the author rather than
  // moving the author, and a link that named a project which would not open.
  readonly replace: (directory: string | null) => void
  // Back and forward. Fired with what the URL says *after* the browser moved.
  readonly onNavigate: (handler: (directory: string | null) => void) => void
}

// The real one, and the humble object of the pair: four one-line members with no branching in them,
// which is what makes it acceptable that it ships untested - the same bargain `src/index.ts`'s
// element lookups take. Everything with a decision in it lives above this.
//
// **The state object is null on purpose.** The URL is the state; a copy in `history.state` would be
// a second answer that can disagree with the first, and `popstate` reads the URL back anyway.
//
// It never removes its `popstate` listener. That is right here and would not be in `ProjectStoring`:
// one page load is one shell, and the shell outlives every session in it.
export const browserNavigation = (): Navigation => ({
  current: () => projectInUrl(location.href),
  push: (directory) => history.pushState(null, "", urlForProject(location.href, directory)),
  replace: (directory) => history.replaceState(null, "", urlForProject(location.href, directory)),
  onNavigate: (handler) => window.addEventListener("popstate", () => handler(projectInUrl(location.href))),
})
