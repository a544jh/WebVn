# The project library: design decisions

Settled 2026-09-05, ahead of ticket 02. The drawings live on a design canvas:

<https://claude.ai/code/artifact/c6d9544c-a7dd-49b4-b778-9e22a0e80f71>

Five artboards - the picker populated, with a project whose manifest does not parse, with a switch
refused, empty, and the editor carrying its return button. **That canvas is editable and is not in
this repo**, so it is the pixels and this file is the reasoning. Where the two disagree, the canvas
is newer and this file is wrong; say so rather than quietly following either.

## The picker is its own page, before the editor boots

Ticket 02 originally specified a panel in the editor's chrome. It is a page instead: the front door,
shown before anything is mounted, with the editor gaining a **Back to projects** button in its upper
left. Three things follow, and they are why this is written down rather than left as a drawing.

**Nothing is open, so nothing can be marked as open.** 02's "the open project is marked" was written
for a panel living inside a booted editor. On a pre-boot page the honest ordering is `lastOpened`
descending, which is the same field the ticket already makes do work - the row the author wants is
simply first.

**The lock-ordering cross-edge mostly dissolves.** "Take the new lock before closing the old" exists
because a switch happens *while holding a project*, and a refusal mid-switch would leave the author
with nothing mounted and their work already put down. From the picker there is nothing to be
stranded from: the previous project was released on the way out. What remains is that the picker
must handle a refusal by staying put and saying so, which is a much smaller problem.

**Ticket 01's teardown is still required, and its trigger is renamed.** It is what Back to projects
runs, not what switching runs. Nothing about *what* 01 tears down changes.

## Two faces, split the way everything else here splits

**Source Code Pro belongs to the story.** Name tags, dialogue, the script buffer. It is a monospace
face and it is not a UI face.

**Source Sans 3 is the chrome.** Adobe drew it as the companion to Source Code Pro, so the two agree
without being confusable. It is a linked webfont rather than `system-ui` because the requirement was
a UI font that looks the same on every system, which is exactly what `system-ui` does not do.

Today the chrome has no `font-family` at all - `body` sets only `background-color: dimgray` and
`.vn-editor-tab` is `font: inherit` - so it renders in the browser's default serif. Ticket 00.

## Icons: Lucide for the chrome, css.gg stays on the stage

**Lucide** (lucide-static, ISC), **vendored as inline SVG rather than installed.** That is the
pattern `gg.css` already set, and eight chrome icons do not earn a package against the entrypoint
size warning the build already prints.

**css.gg is not replaced.** Its four icons run on the stage at `--ggs: 2.5`, around 55px, where they
work. The problem was only ever reaching for them at 13px: they are border-drawn, and at fractional
scale they land on half-pixels and go soft.

So icons split stage-from-chrome, which is the seam the tokens (`--vn-*` / `--vn-editor-*`) and now
the fonts already follow. One rule in three places rather than three special cases.

Two details that are decisions, not defaults: `stroke-width` is **1.75**, not Lucide's 2, because
that default is drawn for 24px and reads heavy at the 14-15px this chrome uses; and `currentColor`
throughout, with the colour set on the *wrapper*, so an icon in a disabled row or an orange refused
row inherits without a second rule.

## Rules the existing code already set, which the design follows

- **The status colours are not decoration.** Green means stored, orange means "needs attention and
  the work still runs", red means "did not parse, or a write failed". Spending one on selection or
  emphasis costs that meaning. A current or selected row is marked with weight and a rule instead.
- **Orange takes black text.** `editor.css` says so outright: orange is light enough that white on it
  fails to read. Green and red take white.
- **The store indicator lives at the far edge of the tab bar**, not in a top bar. `editor.css` puts
  it there and explains why - the tabs carry per-buffer status and this is per-project, so it must
  not read as a third tab. The first draft of this design got that wrong and it was moved back.

## The app stays a single page

The picker is a **view**, not a third html entry: it is swapped in where the editor would mount, and
opening a project never reloads. `editorBoot.ts` already returns either a booted editor or a refusal,
so the seam exists. It lives in `src/picker/`, which is neither `src/editor/` (it must render without
one, and outlives any one editor session) nor `src/storage/` (deliberately UI-free).

Being one page is what makes teardown load-bearing rather than tidy. The picker is re-created on
every Back to projects, so it comes down the way ticket 01 brings the storer down - an
`AbortController` and a `stop()` - for the reason already written into `ProjectStoring`'s
constructor: a superseded component that kept its listeners is a data-loss bug, not a leak.

## There is a `src/chrome/`, and it is not the editor's

The authoring chrome now has at least three members that the picker needs and the editor also needs,
and neither owns:

- the shared stylesheet, including the chrome font
- the **`--vn-editor-*` tokens, moved out of `editor.css`** - the picker's refusal banner needs
  `--vn-editor-status-warning`, and it renders before any editor is constructed
- the **Lucide icon helper**, for the same reason - the picker draws a trash and a plus
- the **confirm surface**, which ticket 03 fires over the picker and ticket 04 fires inside the
  editor, so it can belong to neither

The `--vn-editor-*` prefix was always naming the chrome rather than the editor; the picker is what
makes that visible. The tokens keep their names - renaming them would churn `editor.css`, the tests
and the design for a prefix that is already right in meaning.

## The demo is added by a button, never seeded behind the author

Nothing seeds automatically. The picker carries an **Add demo project** button, shown only while the
demo is absent, which writes the demo and adds a row - and leaves the author on the picker, so they
see it arrive and see the button go. **New project** opens what it made; the demo button does not,
because populating a library and starting work are different intents.

This started as a fix for an ordering problem and turned out to be the better product. Seeding
automatically had to happen before the picker could render, at a moment when no project is chosen and
so no lock is held - which is exactly what `chooseProject`'s comment refuses, since a refused tab must
not have written anything on its way to being refused. A button is an action, and an action can take
a lock like any other.

## Not decided

Nothing outstanding. Per-project size was **deferred** rather than dropped - see `spec.md`, which
records why `WalkedFile.size` stays behind a display nothing currently shows.
