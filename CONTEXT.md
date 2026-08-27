# WebVn

A client-side visual novel engine and the authoring tool for it. An author writes a story in YAML;
a player reads it in a browser, one stop at a time, making decisions that branch it.

## Language

### Authoring

**Manifest**:
Everything a story needs that its script does not spell out: the cast, and the lists of background
and audio assets. An input to the parser, which seeds a starting state from it - not a live field a
running story can change.
_Avoid_: config, settings, base state

**Script**:
The YAML text an author writes. What a Story is parsed *from*.
_Avoid_: source, code

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
A named character who can speak and be shown. Every actor inherits from the default actor.
_Avoid_: character, speaker

**Narrator**:
The unnamed actor, whose lines are narration and carry no name tag.

**Pose**:
One of the images an actor can be shown in. Named per actor, so two actors can each have an `idle`.
_Avoid_: expression, sprite (a sprite is the thing on screen, not the image it uses)

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
An actor's presence on screen: which actor, in which pose, where. Distinct from the pose, which is
only the image.

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
