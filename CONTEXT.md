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

**Project directory**:
The directory a project's files sit in, under `projects/`. Named after the project id and normally
equal to it, but a *separate thing*: every read, write, store and lock addresses the directory, never
the id, because the two can disagree - an author who edits `id:` in the buffer has made them disagree
- and code that addressed the id would be asserting an invariant it cannot check. When they disagree
the fix is always to rename the directory to match the manifest, never the other way round.
_Avoid_: folder, project path, project name

**Resolver**:
What answers "where do this file's bytes come from", given a path inside a project. One per entry
point and both permanent: relative paths for the player, OPFS for the editor. Distinct from
`assetPaths.ts`, which answers "which file is this id" - a manifest question rather than a storage
one.
_Avoid_: loader (that is the thing that holds the decoded asset), fetcher, backend

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

**Store**:
What the editor does with the author's buffers: write them into the project store in OPFS, so the
work survives a reload. The store is the noun and storing is the verb - the project store stores the
script - while the file-level operation underneath it is a *write*. Reserved for the author's
project, because a *save* is the player's: a save slot holds a path through a story, and the two are
unrelated things that both used to be called saving.
_Avoid_: save, autosave (those are the player's save slots), persist (that is
`navigator.storage.persist`, which this design also calls)

**Close**:
What putting a project down means: flush what is pending, stop the storer, tear the renderer down,
empty the editor's root and release the lock. Switching projects is a close and a fresh boot through
the same path, never a live swap, so nothing in a session ever learns that another project exists.
_Avoid_: unload, dispose, destroy, switch (a switch is two closes and a boot, seen from outside)

**Payload**:
A project's manifest and script, minus its assets, encoded into a URL so a story can be shared as a
link. Two documents, manifest first.
_Avoid_: story, script, export (an export is the archive, which carries the assets too)

**Project link**:
The editor's own URL with `?project=<directory>` in it - which project is open, written down where a
reload can find it again. It names a *project directory* and carries nothing else, so a link opened
in another browser finds no such project: the bytes are in this one's store. That is the whole of
what makes it not a *payload*, which carries a story and works anywhere.
_Avoid_: deep link, route, permalink, share link (there is nothing in it to share)

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
A path plus the time it was saved, which is all a save is.

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

### Presentation

**Token**:
A named value in the design language, declared as a CSS custom property and read back with `var()`.
A value earns one by repeating, or by being spelled in a layer that another has to agree with -
`--vn-surface` because seven rules and a keyframe use it, `--vn-editor-status-warning` because
`editor.ts` paints a gutter marker the colour `editor.css` gives the store badge. A value used once
inside one stylesheet stays a literal. Two namespaces, and they are not interchangeable: `--vn-*` is
the story's look and a second theme may replace all of it, `--vn-editor-*` is the authoring chrome
and survives that replacement.
_Avoid_: variable (the script language has its own), custom property (the mechanism, not the point),
constant, CSS var

**Stage**:
The fixed-size area a story is played in - background, sprites, text box, the player's own controls.
It is what a theme themes, and what `--vn-*` names.
_Avoid_: screen, viewport, scene (a scene is what is on the stage at one moment), canvas (that is the
background renderer's own element)

**Chrome**:
The authoring tool's own surfaces, as opposed to the stage: the picker, the buffer tabs, the store
indicator, dialogs, buttons. It is what `--vn-editor-*` names, and the two are deliberately separable
- a second theme may replace everything the stage looks like without touching the chrome.
_Avoid_: UI (both are UI), shell, frame, editor (the editor is one thing wearing the chrome, and the
picker is another)

**Picker**:
The page an author lands on before any project is open, listing what the store enumerates and opening
whichever is chosen. Distinct from the **library**, which is the collection of projects itself: the
library is what an author has, the picker is where they see it.
_Avoid_: library (the collection, not the page), launcher, dashboard, project list, home
