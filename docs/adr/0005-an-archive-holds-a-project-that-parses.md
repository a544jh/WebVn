# An archive holds a project that parses

A `.webvn.zip` always contains a `manifest.yaml` that parses and a `script.yaml`. Both directions
enforce it: **export** refuses to build an archive from a project whose manifest does not parse or
whose script is missing, and **import** refuses an archive that fails the same test. Neither
degrades, warns and continues, or lands a partial project.

This is `0002-a-bad-manifest-is-fatal-a-bad-script-is-not.md`'s line drawn at the format boundary
rather than at the parser, and it inherits that ADR's asymmetry exactly: **the manifest gates the
archive; the script never does.** A manifest declaring files nobody has drawn yet, a script with
parse errors, and a script naming ids the manifest does not answer all travel freely in both
directions, because each is an ordinary state of a project being written and the editor already
reports every one of them on the line that caused it.

## Why the gate is on export too

Refusing a bad archive on the way in is obvious. Refusing to *create* one is the part that needs
recording, because the store deliberately does the opposite: `listProjects` keeps a project whose
manifest does not parse, with a null id and a null title, and the picker lists it, and the editor
opens it, and a rename can move it - all on the reasoning that it is an author's project with a typo
in it, and the library is the one place they would go to fix it.

So the store tolerates what the archive refuses, and a future reader is entitled to ask why.

Three reasons.

**Identity.** An archive is named `<project-id>.webvn.zip` and imports into `projects/<id>/`. A
project whose manifest does not parse has no id - that is the whole of ADR 0002 - so there is
nothing to name the file after and nothing to file it under. The alternatives are a filename-derived
directory, which mints exactly the id/directory disagreement the rename exists to repair, or a
manifest rewritten on the way in, which is the one direction `PROJECT_STORAGE.md` forbids without
exception.

**The invariant is only worth having if it holds.** "Every archive is importable" is a strong,
checkable property: it means an export is a backup rather than a hope, it means an archive found in
Downloads two years later opens, and it means import's refusals are about archives *other* tools
produced rather than about our own output. One export path that can emit an unimportable file costs
all of that.

**The escape hatch it appears to close is not closed.** The obvious objection is that export should
be the way to rescue a project too broken to open - but such a project is not too broken to open.
The editor opens an unparseable manifest perfectly well; that is what its red tab and its gutter
markers are for. The hatch is "fix the typo, then export", which is one step longer and is the step
the author was going to take anyway.

## Why `script.yaml` is in the invariant

`recoverProjects.ts` deliberately does not sweep a directory that has a manifest and no script: that
is the state `createProject` passes through between its two writes, and deleting on it would be a
wrong delete. Nothing else looks either. So without an explicit check a script-less archive would
import cleanly, appear in the picker with its title, and throw out of `readProject` the moment the
author clicked the row - a dead row in the surface whose entire purpose is opening things.

Supplying an empty script instead was considered and refused: it converts "this archive is broken"
into "this project mysteriously lost its story", and leaves the author unable to tell which
happened.

## Consequences

- **An archive exported by a future format version is refused by an older build**, with the version
  message rather than a half-load. `parseManifest` checks `formatVersion` before the rest of the
  schema and reports it alone, which is what makes that message readable.
- **Export has a disabled state**, on the picker row and in the editor, and it needs a reason
  attached rather than a greyed control. The editor's flag already exists: `editor.ts` tracks
  whether the manifest buffer last parsed, to gate the player link.
- **Import's refusals are not a fallback path.** Since our own export cannot produce a bad archive,
  every refusal is about a file that came from somewhere else - hand-edited, produced by another
  tool, or truncated in transit. They are worth phrasing for that reader, not for ours.
- **This does not make an archive a validated project.** It parses and it has a script; its assets
  may be missing, its story may be full of warnings. That is deliberate, and it is ADR 0002's line
  holding.
