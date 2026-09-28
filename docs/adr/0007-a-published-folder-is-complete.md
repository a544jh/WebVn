# A published folder is complete

A **published folder** - `manifest.yaml`, `script.yaml`, every file the manifest declares, and the
player beside them as `index.html` - always holds every file its manifest declares. Both directions
enforce it: **publish** refuses to write one while a declared file is missing from the project, and
**URL import** refuses to read one where a declared file does not arrive. Each refusal names what
is missing. Neither degrades, warns and continues, or lands a partial project.

The script never gates, exactly as in `0005-an-archive-holds-a-project-that-parses.md`: a script
with parse errors, or one naming ids the manifest does not answer, publishes and imports freely.

## Why this is not a contradiction of 0005

On its face it is one. ADR 0005 lets an archive carry a manifest that declares files nobody has
drawn yet, in both directions, and a later reader will want to "fix" one rule to match the other.
They differ because their audiences do. **An archive** is the author's backup of work in progress,
and declaring before drawing is the normal authoring order. **A published folder** is what other
people receive.

## Why, in order

The order matters, because the reasons do not all cover the same files.

**1. The round trip.** What publish writes, URL import reads back. If publish could write a folder
with a hole in it, our own output would be something our own import refuses, and a refusal would
stop meaning "someone else's folder is broken". This is 0005's third consequence - *import's
refusals are about files other tools produced* - carried to the second format. It is the only reason
that covers **every** declared file, including one no script line uses yet.

**2. A 404 cannot tell "never drawn" from "lost in transit".** An archive's integrity is checked by
the zip format itself, so a file missing from one really was never there. Over HTTP the two look
identical, and landing either silently is the project with holes in it that the rename recovery
exists to prevent. The design doc says it for import in as many words: *a partial import is a
failure, not a project.*

**3. The reader.** A declared file that is not there is a scene the renderer throws on when the story
reaches it. This is the most vivid reason and the weakest: it covers only files some script line
uses, and it stops holding on the day the renderers learn to survive a missing file, which
`CLAUDE.md` already names as a separate change. That is why it comes last, and why this decision
must not be reopened on the grounds that the renderers have become tolerant.

## Considered and refused

**Completeness as "every file the story can reach".** Both directions would refuse only a missing
file that some command names, and a declared-but-unused file would travel as a missing asset, as it
does in an archive. It fits reason 3 exactly, and it would let an author publish chapter 1 while
chapter 2's sprites are declared but undrawn. Refused because it makes `Command.references()` the
only thing between a reader and a crash - today a command that forgets to override it loses a
warning, and under this rule it would ship a broken scene - and because import would have to parse
the script to judge completeness, which puts the script back in a gate 0005 keeps it out of.

**Publish warns and writes anyway.** Our own output could then be unimportable, which is reason 1
in full.

## Consequences

- **An author cannot publish while any declaration is ahead of its art**, even one no script line
  uses yet. The fix is to remove that declaration, or draw the file. The asset panel never declares
  ahead in the first place - its Add writes the file and the declaration together - so the case
  arises only from a hand edit, and the editor has already marked every such line orange.
- **Publish's refusal is a click, not a greyed control.** The control is gated on the manifest
  parsing, as Export ZIP is; missing files are listed in a dialog when it is pressed, because a list naming
  them says more than a disabled button.
- **URL import names the first file that failed, not every one.** It streams, so knowing them all
  would mean fetching the rest just to count them; the person importing is usually not the author
  and cannot fix the host anyway. Publish checks the local store, which is cheap, and names them all.
- **This does not make a published folder a validated project.** Its script may be full of warnings,
  and that is ADR 0002's line holding.
