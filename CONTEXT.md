# WebVn

A client-side visual novel engine and the authoring tool for it. An author writes a story in YAML;
a player reads it in a browser, one stop at a time, making decisions that branch it.

## Language

### Authoring

**Project**:
An author's whole visual novel: its manifest, its script and its assets. The unit that is stored,
exported and imported.
_Avoid_: game, novel, story (a story is the command sequence inside one)

**Project id**:
The author-chosen name a project is filed under, and the source of truth for its identity. A
directory name or an archive filename is a label derived from it, and is allowed to go stale. It is
also what player saves are keyed under, so changing it is how an author declares a break with
everything filed under the old one - a rename and a save-break are the same gesture, deliberately.
_Avoid_: slug, uuid, key

**Manifest**:
What a project declares about itself: its identity, its cast, and which background, audio and sprite
assets exist, each under an id. An input to the parser, which seeds a starting state from it - not a
live field a running story can change. It is a symbol table, not just a preload index: the script
names ids and the manifest is what says which file each one is.
_Avoid_: config, settings, base state

**Asset id**:
The name a script calls an asset by, and the key it is declared under in the manifest. Renaming the
file behind one is a manifest edit, not a rewrite of the story. Any non-empty string, minus the two
the engine has spoken for: `stop`, which is how `bgm` stops the music, and a leading `#`, which is
how a background says it is a colour.
_Avoid_: asset name, handle, path (a path is what an id resolves *to*)

**Reference**:
An id a script names, expecting the manifest to declare it: a background, an audio track, an actor,
or one of that actor's sprites. Naming one is the whole of what a script does with the manifest, so
a reference the manifest does not answer is the only way the two documents can disagree - as an
undeclared asset, or an undeclared actor.
_Avoid_: usage, mention, lookup

**Undeclared asset**:
An asset id a script names that the manifest does not declare. Visible by reading the two documents,
so a parser can report it without touching the filesystem.
_Avoid_: unknown asset, bad asset

**Undeclared actor**:
An actor id a script names that the manifest does not declare. The same failure as an undeclared
asset and caught the same way, but an actor is cast rather than an asset, so the two are named
apart.
_Avoid_: unknown actor, undeclared character

**Neutralized command**:
A command replaced by a no-op because it named a reference the manifest does not answer. It keeps
its index - every save is a path of indices - so the story plays straight through it, and declaring
the id and reparsing mints the real command back where it was. A `Say` is warned about but never
neutralized: its text does not depend on the actor it names.
_Avoid_: disabled, stripped, dropped (a dropped command would shift every index after it)

**Missing asset**:
A file the manifest declares that is not there. Invisible to a parser, because nothing but a failed
load can tell - which is what makes it a different problem from an undeclared one rather than a
degree of it.
_Avoid_: broken asset, unloaded asset, bad asset

**Script**:
The YAML text an author writes. What a Story is parsed *from*.
_Avoid_: source, code

**Buffer**:
One document open in the editor, with its own text, undo history, cursor and dirty flag. The editor
holds one per file - today the script and the manifest, later one per included script.
_Avoid_: tab (a tab is how a buffer is chosen), pane, editor instance

**Document**:
A single YAML document in YAML's own sense: one unit of a `---`-separated stream. A buffer holds
exactly one; the URL payload is a stream of two.
_Avoid_: file (a document may travel without being a file), doc

**Adopt**:
What the editor does with an edited manifest: parse it, take it as the one the project is now
described by, and rebuild everything downstream of it. Reserved for the manifest, because *apply* is
what a command does to a state.
_Avoid_: apply

**Payload**:
A project's manifest and script, minus its assets, encoded into a URL so a story can be shared as a
link. Two documents, manifest first.
_Avoid_: story, script, export (an export is the archive, which carries the assets too)

**Story**:
The ordered sequence of commands a visual novel is made of, under the script's top-level `story` key.
_Avoid_: scene, scenario, script (that is the text it parses from)

**Command**:
A single authored instruction, and the unit a story is a sequence of. Applying one to a state yields
the next state.
_Avoid_: statement, instruction, line, step, node

**Label**:
A named position in a story, and the only thing a jump or a decision can target.
_Avoid_: marker, anchor (an anchor is YAML's own feature, which scripts also use)

**Jump**:
The authored command that sends the playhead to a label, optionally under a condition. Reserved for
the command: the editor's two jumps are always qualified as a *direct jump* or a *replay jump*.

**Actor**:
A named character who can speak and be shown. Every actor inherits from the default actor. An
actor's id is capitalized, which is what tells a line of theirs apart from a command; the two
lowercase ids, `default` and `narrator`, are the engine's own.
_Avoid_: character, speaker

**Narrator**:
The unnamed actor, whose lines are narration and carry no name tag.

### Playing

**Playhead**:
The position in the story that will be applied next.
_Avoid_: cursor, pointer, index, program counter

**Stop**:
A point in a story where playback waits for the player. The unit everything else is measured in: an
advance runs to the next stop, and a command that never stops is not somewhere a player can be
parked.
_Avoid_: pause, beat, wait, halt

**Advance**:
The player action that moves from one stop to the next.
_Avoid_: next, continue, step, click

**Decision**:
A stop that offers the player a set of options, each targeting a label. The only branch a player
makes by hand.
_Avoid_: choice, branch, menu, option (an *option* is one item within a decision)

**Sprite**:
One of the images an actor can be shown in, declared under a name in the manifest. The script names
that name; only the manifest names the file.
_Avoid_: pose (considered and rejected - Ren'Py's model has no such term, and
`sprite: happy` / `sprites: {happy: ...}` is already a clean singular-plural pair)

**Sprite instance**:
An actor's presence on screen: which actor, showing which of their sprites, where. Its *id* is its
identity - one instance per id, defaulting to the actor's own name, so an actor is on screen once
unless the script names further instances of them. `hide` takes that id back.
_Avoid_: sprite (that is the declared image)

**Text box**:
The panel a line of dialogue is shown in. *ADV* mode shows one line at a time in a fixed box;
*freeform* mode places text at an insertion point on the screen and accumulates it.

**Text node**:
A run of text within a text box that carries its own colour and typing speed.

**Name tag**:
The speaking actor's name, shown with their line. The narrator has none.

**Skip mode**:
Fast-forwarding that runs on its own until cancelled, and only through commands already seen.

**Auto mode**:
Advancing on a timer, so the story reads itself at a steady pace.

### Recording a playthrough

**Path**:
The ordered record of the actions a player took, not the states those actions produced. Replaying a
path from the starting state is what reconstructs a playthrough.
_Avoid_: history, trail, route, log

**Action**:
One entry in a path: an advance, a decision, or a direct jump. Nothing a story does on its own is an
action, because nothing a story does on its own needs recording.

**Starting state**:
The state a story begins in, before any action. Every replay starts here.
_Avoid_: initial state, base state

**Replay**:
Rebuilding a state by applying a path to the starting state. The only way a state is ever
reconstructed, which is why commands may not depend on anything outside the state they are given.

**Seen command**:
A command the player has read at least once, anywhere, ever. Deliberately global and permanent
across undo, save slots and replays, because it exists to tell skip mode what may be skipped.

**Save slot**:
A stored path plus the time it was stored, which is all a save is.

### Authoring-only

**Direct jump**:
Moving the player to a command by teleporting the playhead and applying that command to whatever is
currently on screen. Nothing before it is replayed, so the scene is whatever happened to be there.
Cannot be expressed as a path, so a session containing one cannot be saved.

**Replay jump**:
Moving the player to a command by replaying the story from the beginning, answering decisions from
the ones already recorded. The scene is built properly, and the result is a real path.

**Animatable state**:
The part of a state a renderer animates towards rather than snaps to: text, sprites, background,
audio.
