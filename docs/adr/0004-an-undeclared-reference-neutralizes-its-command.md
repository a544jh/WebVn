# An undeclared reference neutralizes its command

A script names ids the manifest is expected to declare - a background, an audio track, an actor, one
of that actor's sprites. Nothing checks them. `parseStory` receives the manifest and never looks, so
`bg: forset` parses clean and the story plays until it reaches that frame, where
`BackgroundRenderer` cannot resolve the id and throws out of the render pass. The story stops dead,
several scenes away from the typo, with a stack trace instead of a line number.

**A reference the manifest does not declare is reported as a `ParserError` at `WARNING` level, and
the command that made it is replaced by an index-stable no-op.** The story still loads, still plays,
and simply does nothing where the broken command was. Neither entry point refuses it, and nothing
downstream is gated on it.

## Why the story is not refused

`docs/adr/0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md` already decided this, though it
argued it about parsing rather than playback:

> A script with one broken command still has content worth showing, and an author fixing it wants to
> keep playing the rest.

The asymmetry that ADR draws is **identity**, not severity: a manifest that does not validate has no
`id`, so there is nothing to load the project *under*. An undeclared reference destroys no identity.
It is one command that cannot run, in a story where every other command can, which is precisely the
case 0002 says to keep showing. So refusing to load - the reading `ERROR` would invite - is ruled out
by a decision already on the books, and this ADR extends that decision's reach from "`parseStory`
returns a state" to "the story remains playable through the broken part".

## Why the parser neutralizes rather than the renderer skipping

The alternative was to make the three sub-renderers return early on an id they cannot resolve instead
of throwing. It is a smaller diff and it would also cover *missing* assets, which undeclared ones do
not.

It was rejected because it puts one rule in two layers. The parser would know an id is undeclared and
report it; the renderer would independently know how to survive an id it cannot resolve. `CLAUDE.md`
names that failure mode about `stop` and `#` - "a rule spelled in two layers is a rule that drifts" -
and the same argument holds here. Once the parser guarantees no undeclared id reaches a renderer, the
three throws stop being a failure mode and become invariant guards, which is a cheaper thing to own
than three degradation paths. Making the renderers survive a *missing* asset is still open, and still
a separate change with its own blast radius.

## Why the level is WARNING

`ERROR` was chosen first and reversed. The argument for it was that an undeclared id already halted
the story, so a `WARNING` would understate what the engine actually did. Neutralizing the command
removes the halt and with it the argument: after this change the story plays to the end, so the
marker says "something here does nothing", which is what `WARNING` means everywhere else in the
gutter.

This is recorded because the reasoning does not survive in the code. A reader who finds an id that is
provably wrong - checkable by reading the two documents, with no filesystem involved - marked in the
same colour as a command whose options failed a Zod schema will reasonably think it should be red.
It should not, because unlike a red one it costs the author nothing to keep working through.

It also lands undeclared references at the same level as missing assets, which `CONTEXT.md` is at
pains to call "a different problem rather than a degree of it". The two stay distinguishable by which
document the marker lands in: an undeclared reference marks the script line that named the id, a
missing asset marks the manifest line that declared the file.

## Consequences

- **The parser rewrites its own command list.** `parseStory` returns commands that are not a
  one-to-one transcription of the script, which nothing before this did. The substitution is
  index-stable by construction, because `VnPath` records user actions against command *indices* and
  every save is a path - dropping the command instead, which is what reporting from inside a command
  handler would have required, would invalidate every saved game in the project.
- **Re-parsing heals it.** Declaring the missing id and reloading mints the real command at the same
  index, so a path saved against the broken story still replays against the fixed one.
- **A command does as much as it can without the id it could not resolve, which is not always
  nothing.** A `bg` is nothing but its image, so it goes inert. A `Say` carries text that does not
  depend on its actor, so the line is still said, in `default` styling with the raw id as its name
  tag - `Say.ts`'s existing fallback, promoted from accident to decision and now accompanied by a
  warning. Dropping a line of dialogue to punish a misspelt name is a larger hole than showing it in
  the wrong colour.
- **Neutralizing changes a command's class.** `Say` decides whether to stop by testing
  `state.commands[state.commandIndex + 1] instanceof Decision`, the only `instanceof` in the command
  set. `Decision` names no references and is therefore never neutralized, so the check is safe today
  - but anything that starts switching on command class has to account for this.
- **Nothing is gated on it.** Export stays gated on manifest parseability alone, following the
  precedent that "a story that declares a file nobody has drawn yet still plays", and there is no
  promotion of the level at import or export: the story behaves identically on both sides of a link,
  so there is nothing for a promotion to protect.
- **The renderer's three messages and the parser's four share one home.** `undeclaredMessage` lives
  beside `VnManifest` in `core/manifest.ts` and both layers import it, so a guard that does fire says
  what the author was already told.
