import { Reference, undeclaredMessage, VnManifest } from "../manifest"
import { Command } from "./Command"
import { NoOp } from "./NoOp"
import { ErrorLevel, ParserError } from "./Parser"

// Checking a story's references against the manifest, after the commands are built and before the
// story is played. A reference the manifest does not answer is reported at WARNING against the
// script line that named it, and the command that made it is replaced by a no-op - the story still
// loads and still plays. docs/adr/0004-an-undeclared-reference-neutralizes-its-command.md.
//
// Nothing here is YAML: it reads commands and a manifest, which is why it is in core rather than
// beside the parser that calls it.

// Whether the manifest answers a reference. The sprite case is the two-level walk - an actor's
// sprites are declared inside that actor - and this is the only place it is written.
const isDeclared = (manifest: VnManifest, reference: Reference): boolean => {
  switch (reference.kind) {
    case "background":
      return manifest.backgrounds[reference.id] !== undefined
    case "audio":
      return manifest.audioAssets[reference.id] !== undefined
    case "actor":
      return manifest.actors[reference.id] !== undefined
    case "sprite":
      return manifest.actors[reference.actor]?.sprites?.[reference.id] !== undefined
  }
}

// What one command names that the manifest does not declare. An undeclared actor swallows the
// command's sprite references to that actor: there is no point reporting that an actor nobody
// declared declares no sprites, and the actor reference has already said the useful half.
const undeclaredReferences = (command: Command, manifest: VnManifest): Reference[] => {
  const references = command.references()
  const undeclaredActors = references.filter((r) => r.kind === "actor" && !isDeclared(manifest, r)).map((r) => r.id)

  return references.filter((reference) => {
    if (isDeclared(manifest, reference)) return false
    return !(reference.kind === "sprite" && undeclaredActors.includes(reference.actor))
  })
}

export const checkReferences = (commands: Command[], manifest: VnManifest): [Command[], ParserError[]] => {
  const errors: ParserError[] = []

  // map rather than a filtering walk: the list keeps its length, because every save is a path of
  // indices into it and a shifted index is a saved game that replays into the wrong scene.
  const checked = commands.map((command) => {
    const undeclared = undeclaredReferences(command, manifest)
    for (const reference of undeclared) {
      errors.push(new ParserError(undeclaredMessage(reference), command.getSourceLocation(), ErrorLevel.WARNING))
    }
    if (undeclared.length === 0 || command.survivesUndeclaredReference()) return command
    return new NoOp(command)
  })

  return [checked, errors]
}
