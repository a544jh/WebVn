// The half of `AssetLoader.loadAll` that is the same whatever is being loaded: attempt everything
// that has not already failed, remember what fails, and hand back every path currently known to be
// missing rather than rejecting on the first one.
//
// Reported-but-not-retried is the pair that matters. Reporting a known failure again keeps the
// caller's report honest across loads, while retrying it would re-request every filename an author
// has ever mistyped, since registration is cumulative and nothing is ever unregistered.
export const loadAllOf = async (
  paths: string[],
  failed: Set<string>,
  load: (path: string) => Promise<void>
): Promise<string[]> => {
  await Promise.all(
    paths
      .filter((path) => !failed.has(path))
      .map((path) =>
        load(path).catch(() => {
          failed.add(path)
        })
      )
  )
  return paths.filter((path) => failed.has(path))
}
