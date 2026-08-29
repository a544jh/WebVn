# A bad manifest is fatal; a bad script is not

`parseStory` returns `[VnPlayerState, ParserError[]]` and always returns a state: a script with an
unparseable command still yields a playable story, with the error reported alongside it and drawn in the
editor's gutter. `parseManifest`, introduced with the `manifest.yaml` file format, deliberately does not
match that shape. It returns `[VnManifest | null, ParserError[]]`, and a manifest that fails validation
yields nothing at all - the caller gets errors and no project.

## Why they differ

A script with one broken command still has content worth showing, and an author fixing it wants to keep
playing the rest. A manifest that fails validation has no **identity**: `id` is what saves are keyed under
(`vn-save-<id>`), what names the project's directory, and what `design-docs/PROJECT_STORAGE.md` makes the
single source of truth for which project this is. There is nothing to fall back *to*. Recovering by
substituting a default or accepting a partial manifest would load the project under some other project's
save key, which is exactly the "silently mix unrelated stories' progress together" outcome that design
rules out.

It is the same invariant the storage design already states from the other direction: **no manifest means
garbage**. A directory without a valid manifest is not a project with problems - it is not a project, and
the sweep deletes it. A manifest that does not validate is that case arriving through the parser instead of
through enumeration, and the two should not disagree.

## Consequences

- Every caller of `parseManifest` handles `null`. Today that is `demoStory.ts`, which throws, because the
  file is one we ship in our own bundle and CI parses it before anyone else sees it. A unit test asserting
  the demo's manifest parses with zero errors is the actual guarantee; the throw is type narrowing.
- When manifest editing reaches the editor, it cannot show a half-adopted manifest the way it shows a
  half-parsed script. It has to render the errors and keep the last valid manifest, which is a different
  interaction from the script buffer's and should not be assumed to fall out of the existing one.
- `ParserError` and `SourceLocation` are still the currency, so the gutter machinery is shared even though
  the failure modes are not.
