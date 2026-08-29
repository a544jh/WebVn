# The URL payload carries the manifest

The payload shared through `?vn=` is a gzipped, url-safe base64 blob in the query string of
`player.html`.
It has always carried the script alone, and the player parses it against the demo's manifest because
that is the only manifest it has. Once the manifest is a document the author can edit
(`.scratch/manifest-editor/issues/01-manifest-in-the-editor.md`), that stops working: a shared link
would carry a story whose cast, backgrounds and audio ids are resolved against somebody else's
declarations.

**The payload is a two-document YAML stream: the manifest first, then the script.** A payload
carrying only one document is invalid, and the player refuses to load it rather than falling back to
a default manifest.

## Why the manifest has to travel

`id` is the project's identity, and identity is what saves are keyed under. `TODO` states the
consequence as an ordering constraint:

> Two-document URL payload before player save keying. `?vn=` carries a script alone and is parsed
> against the demo's manifest, so once saves are keyed by id the only id in scope is webvn-demo and
> every shared story saves on top of every other one. Harmless only while the key is the hardcoded
> "test" everyone shares.

Keying saves by `id` while every shared payload reports the same `id` would be worse than the shared
hardcoded key it replaces: it would *claim* per-project saves while silently mixing unrelated
stories' progress together. That is the same outcome `docs/adr/0002` and `design-docs/PROJECT_STORAGE.md`
already rule out from other directions, arriving this time through the transport.

## Why a bare script is not accepted for compatibility

This is the part a later reader will want to change, so it is written here rather than only in the
ticket that decided it. Accepting a single-document payload as "a script against the demo manifest"
looks like free backwards compatibility. It is not: it re-creates exactly the collision above, and it
does so for the payloads least likely to be noticed, because they are the old links nobody re-exports.
A payload that cannot say which project it belongs to has no business claiming a save key.

The format needs no version field of its own to police this. One document is legacy, two is current,
and the manifest inside carries `formatVersion` for anything finer. The break was affordable when it
was made: the only links in existence were the author's own.

## Consequences

- **The player gains an error surface.** `playerIndex.ts` discarded `parseStory`'s error list
  entirely and had no way to tell a player anything. Refusing a payload requires one, so a story that
  cannot be loaded says so in the vn div rather than leaving a blank stage indistinguishable from a
  bug. It is one unstyled line; a real error screen belongs to `PROJECT_STORAGE.md`.
- **The demo boots through the same path.** With no `?vn=`, the player falls back to the demo as a
  source of manifest text and script text, not as a second code path - so the payload path is
  exercised on every demo load instead of only by shared links.
- **Both parsers must refuse a multi-document input.** They take `docs[0]` and drop the rest, so the
  split has to be explicit somewhere. `composeDocuments` already returns every document precisely so
  a caller can refuse - *"a stray `---` is a thing a caller may want to refuse rather than silently
  drop"* - and this is the caller that has to.
- **The two-document form is transport only.** The editor keeps one buffer per document, each parsed
  on its own, so per-buffer gutters and line numbers are unaffected.
- **Export can now produce a dead link.** A payload whose manifest does not parse is one the player
  refuses, so the editor greys out Export while the manifest is invalid, following `canSave`'s
  precedent rather than export's own history of validating nothing.
