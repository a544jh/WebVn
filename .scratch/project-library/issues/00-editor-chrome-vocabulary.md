# 00: The authoring chrome's own vocabulary

Status: done

Blocked by: nothing (can start immediately, in parallel with 01).

Numbered 00 rather than renumbering 01-06, which are referenced by number in `spec.md` and in the
commit that extracted them.

## What to build

`src/chrome/` - a font, an icon helper, and a home for the vocabulary the picker and the editor
share. No behaviour changes, and the only thing an author sees is that the editor stops rendering in
the browser's default serif.

**Why a directory and not two files in `src/editor/`.** The picker (ticket 02) renders *before* any
editor exists and is not one, yet it needs the same font, the same icons, the same status colours and
the same confirm surface. Anything both need belongs to neither. `--vn-editor-*` was always naming
the authoring chrome rather than the editor component - the picker is what makes that visible - so
the tokens move here and keep their names.

This is a prefactor in the same sense ticket 01 is: it is not *about* the project library, but the
library is the first thing that needs it, and 02, 03 and 04 all draw from it. `design.md` has the
reasoning for both choices; this ticket is the work.

## The font

`body` sets only `background-color: dimgray`, and `.vn-editor-tab` is `font: inherit`, so every
button, tab, radio and label in the editor renders in the browser's default serif today. That is an
accident rather than a choice, and the picker is about to be the largest piece of UI in the app.

- Add **Source Sans 3** to the Google Fonts `<link>` in `src/index.html` only. **Not
  `src/player.html`**: the player has no chrome, so the link there would fetch a face nothing
  renders.
- Give the chrome `font-family: "Source Sans 3", system-ui, sans-serif` in `src/chrome/chrome.css`,
  imported by `src/index.ts`. **Not `defaultTheme.css`** - that file is the *story's* theme, and
  `design.md` says a second theme may replace all of it. Putting the chrome's face there means
  swapping themes changes the editor's typeface, which is the coupling `--vn-editor-*` exists to
  prevent.
- **Do not touch the stage.** `.vn-textbox-renderer`, `#vn-decision-renderer`, `#vn-actions`,
  `.vn-pause-menu-item`, `.vn-save-heading` and `.vn-now-playing` all name `var(--vn-font)`
  explicitly and must keep it.
- The debug panel keeps `var(--vn-font)`: its path chips are shorthand, and its own comment says they
  match the panel on purpose.

Move the **`--vn-editor-*` tokens out of `editor.css`** into `chrome.css` in the same change. This
is not tidying: the picker's refusal banner needs `--vn-editor-status-warning`, and it renders before
any `VnEditor` is constructed. It happens to work today only because the import graph evaluates
`editor.css` at bundle load - a dependency on module evaluation order for a colour, which is the kind
of thing that breaks silently when someone splits a bundle. `editor.ts` keeps `import
"./editor.css"`; the tokens are simply no longer in it.

Whether the font itself earns a `--vn-editor-font` token is a judgement call, and the block comment
in `defaultTheme.css` states the rule to weigh it against: a value earns a token by repeating, or by
being spelled in a layer another has to agree with. One `font-family` declaration is neither, which
is the same reason the chrome's `#eee`, `#ccc` and `3px` are literals.

## The icons

Vendor **Lucide** (lucide-static, ISC) as inline SVG. Do not add a dependency: `gg.css` is already
vendored, and the entrypoint size warning the build prints is a standing argument against a package
for eight icons.

- `src/chrome/icons.ts`, holding the path data and one helper. In `src/chrome/` and not
  `src/editor/` because the picker draws a trash and a plus before any editor exists.
- Signature roughly `icon(name, size = 16): SVGElement`. It must return an element rather than a
  string, because the chrome builds its DOM with `createElement` and nothing else here uses
  `innerHTML`.
- `stroke="currentColor"`, `stroke-width="1.75"`, `fill="none"`, `viewBox="0 0 24 24"`,
  `stroke-linecap`/`stroke-linejoin` `round`. The colour is set on whatever *contains* the icon, so a
  muted row, a disabled control and an orange refused row each need no icon-specific rule.
- Build the element once per name and hand out `cloneNode(true)`, which is the pattern the
  sub-renderers already use for dropping listeners.
- Start with what 02 and 03 need: `chevron-left`, `plus`, `trash-2`. Add per ticket rather than
  vendoring a set nobody calls.
- **`gg.css` is untouched.** Its four icons stay on the stage. See `design.md` for why replacing them
  would be churn, and why reusing them in the chrome does not work.

## The confirm surface

Not built here - ticket 03 builds it - but it lands in `src/chrome/` when it does, and this ticket is
where that is decided. It cannot belong to the editor: 03 fires its new-and-delete dialogs over the
picker with no editor mounted, while 04 fires its rename dialog inside one. Ticket 03 currently calls
it "the editor's own", which was true when the library was a panel and is not now.

## Acceptance criteria

- [ ] The editor's buttons, tabs and labels render in Source Sans 3, and the face is fetched by
      `index.html` only
- [ ] The VN stage still renders in Source Code Pro - name tag, textbox, decisions, actions, pause
      menu, save headings - and the demo suite's computed-colour assertions still pass
- [ ] `--vn-editor-*` resolve on a page where no `VnEditor` has been constructed
- [ ] `icon("chevron-left")` returns an `SVGElement` that inherits its colour from its container
- [ ] Two calls for the same name return independent elements
- [ ] `gg.css` is unchanged and the stage's four icons still render
- [ ] `npm test` and `npm run test:demo` pass; lint, prettier and typecheck are clean

## Not in scope

- **Any picker UI.** Ticket 02.
- **A `--vn-editor-font` token**, unless the builder judges it earns one - see above.
- **Renaming `--vn-editor-*` to `--vn-chrome-*`.** The prefix is already right in meaning; renaming
  would churn `editor.css`, the tests and the design for nothing.
- **Building the confirm surface.** Ticket 03. This ticket only decides where it lives.
- **Restyling existing chrome beyond the font.** The `#eee`/`#ccc`/`3px` vocabulary is already
  consistent and is not this ticket's to revisit.

## Comments

**Landed 2026-09-05**, on `claude/project-library`. `src/chrome/chrome.css` holds the chrome's face
and the `--vn-editor-*` tokens; `src/chrome/icons.ts` holds three Lucide icons behind
`icon(name, size)`. Covered by `test/browser/chrome.test.ts`, which imports the two chrome modules
*without* `src/editor/editor.ts` - that absence is the point.

Two decisions worth recording:

- **`chrome.css` is imported by `src/editor/editor.ts` as well as by `src/index.ts`.** The ticket
  names only the entry point, but the editor is chrome too and its gutter markers are painted from
  these tokens. Naming the dependency in both places is what closes the hazard the ticket
  describes - the tokens resolving because some *other* module happened to pull `editor.css` in -
  rather than moving it one file along. The picker will do the same.
- **Form controls get `font-family: inherit`.** A `<button>` renders in the browser's own UI font
  whatever `body` says, and the chrome is mostly buttons, so the face would otherwise have landed on
  the labels and nothing else.
